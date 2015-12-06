/*
 * Copyright (c) 2012-2015 S-Core Co., Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* jshint -W003 */
'use strict';

var path = require('path');
var fs = require('fs');
var request = require('request');
var express = require('express');
var _ = require('underscore');
var httpProxy = require('http-proxy');
var proxy = new httpProxy.RoutingProxy();
var childProcess = require('child_process');
var async = require('async');
var tmp = require('tmp');
var URI = require('URIjs');
var url = require('url');
var shortid = require('shortid');
var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();

var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var authMgr = require('../../common/auth-manager');
var config = require('../../common/conf-manager').conf;
var App = require('./App');

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

var db = require('../../common/db-manager')('app', 'user', 'system');
var dao = db.dao;

var router = new express.Router();

exports.router = router;

Error.prototype.toJSON = function () {
    return this.toString();
};

// Basic properties that appInfo will have
var DEFAULT_APPINFO_PROPERTIES = ['id', 'appid', 'domain', 'apptype', 'name', 'desc'];
var APPINFO_PROPERTIES = ['id', 'appid', 'domain', 'apptype', 'name', 'desc', 'ownerId', 'status', 'srcurl'];
var FULL_APPINFO_PROPERTIES = ['id', 'appid', 'domain', 'apptype', 'name', 'desc', 'ownerId', 'status', 'port', 'pid',
    'srcurl', 'isDeployed'];
var APPINFO_PROJECTIONS = ['id', 'appid', 'domain', 'apptype', 'name', 'desc', 'ownerId', 'status', 'srcurl'];

// Port range that will be assigned to nodejs apps
// These ports are not used by linux for local port(ie. not assigned for port 0)
// See net.ipv4.ip_local_port_range and net.ipv4.ip_local_reserved_ports
var PORT_START = 30000;
var PORT_END = 32000;
var PORTS_NOT_IN_USE = _.range(PORT_START, PORT_END);
var PORTS_IN_USE = [];

var routeFileQueue = async.queue(function (task, callback) {
    var url, err, contents;
    logger.info('route file write ' + task.name);
    if (task.name === 'appendNodeAppToRouteFile') {
        if (task.domain && task.port) {
            url = task.domain + '.' + config.domain;
            var target = config.domain + ':' + task.port;
            var route = {};
            route[url] = target;

            //Append new route first position
            config.routingTable = _.extend(route, config.routingTable);

            contents = JSON.stringify({'router':config.routingTable}, null, 4);
            if (config.routingTablePath) {
                return fs.writeFile(config.routingTablePath, contents, callback);
            } else {
                err = new Error('Can not find routing file information, so skip file write');
            }
        } else {
            err = new Error('appendNodeAppToRouteFile task must input domain and port');
        }
    } else if ( task.name === 'deleteNodeAppToRouteFile' ) {
        if (task.domain) {
            url = task.domain + '.' + config.domain;

            //Delete route information
            config.routingTable = _.omit(config.routingTable, url);

            contents = JSON.stringify({'router':config.routingTable}, null, 4);
            if (config.routingTablePath) {
                return fs.writeFile(config.routingTablePath, contents, callback);
            } else {
                err = new Error('Can not find routing file information, so skip file write');
            }
        } else {
            err = new Error('deleteNodeAppToRouteFile task must input domain');
        }
    } else {
        err = new Error('task name must be appendNodeAppToRouteFile or deleteNodeAppToRouteFile');
    }

    //Error case
    logger.error(err);
    callback(err);
}, 1);

var APPDOMAIN_ADMIN_PATTERN = /^[a-z0-9]([a-z0-9\-]{1,})[a-z0-9]$/;
var APPDOMAIN_USER_PATTERN = /^[a-z0-9]([a-z0-9\-]{6,61})[a-z0-9]$/;
function isValidDomainFormat(domain, user, callback) {
    if (typeof domain === 'string' || domain instanceof String) {
        if (user.isAdmin) {
            if (APPDOMAIN_ADMIN_PATTERN.test(domain)) {
                return callback(null, true);
            } else if (domain === '') {
                return callback(null, true);
            } else {
                return callback(null, false);
            }
        } else {
            if (APPDOMAIN_USER_PATTERN.test(domain) && (!/--/.test(domain))) {
                // If user app then domain must be /$uid-.*/
                var valid = domain.substring(0, user.uid.toString().length + 1) === user.uid + '-';
                return callback(null, valid);
            } else {
                return callback(null, false);
            }
        }
    } else {
        return callback(null, false);
    }
}

function domainExist(domain, callback) {
    logger.debug('domainExist: ', domain);

    dao.app.$findOne({domain: domain}, function (err, context) {
        var appInfo = context.result();
        if (err) { return callback(err); }
        callback(null, (appInfo) ? true : false);
    });
}

var VALID_APPTYPES = ['html', 'nodejs'];
function isValidAppType(apptype) {
    return _.find(VALID_APPTYPES, function (t) { return t === apptype; });
}

function validateAppInfo(appInfo, user, callback) {
    if (!appInfo.ownerId) {
        logger.info('Invalid owner: ', appInfo);
        return callback(null, false);
    }

    if (!isValidAppType(appInfo.apptype)) {
        logger.info('Invalid apptype: ', appInfo);
        return callback(null, false);
    }

    isValidDomainFormat(appInfo.domain, user, function (err, ret) {
        if (err) { return callback(err); }
        if (ret) {
            return callback(null, appInfo);
        } else {
            return callback(null, false);
        }
    });
}


// Use these two functions to get and return ports
// TODO this implementation seems not efficient
function getEmptyPort() {
    logger.debug('getEmptyPort', PORTS_IN_USE);
    if (PORTS_NOT_IN_USE.length === 0) {
        PORTS_NOT_IN_USE = _.difference(_.range(PORT_START, PORT_END), PORTS_IN_USE);
    }
    if (PORTS_NOT_IN_USE.length === 0) {
        logger.warn('ERROR: ALL PORTS ARE IN USE!!!');
        return -1;
    }
    var port = PORTS_NOT_IN_USE.shift();
    PORTS_IN_USE.unshift(port);
    logger.debug('getEmptyPort end', PORTS_IN_USE);
    return port;
}
function returnPort(port) {
    logger.debug('returnPort', PORTS_IN_USE);
    PORTS_NOT_IN_USE.push(port);
    PORTS_IN_USE = _.without(PORTS_IN_USE, port);
    logger.debug('returnPort end', PORTS_IN_USE);
}

function getDirHtml(fsPath, callback) {
    var dir = path.dirname(fsPath);
    logger.debug('getDirHtml', dir);
    fs.stat(dir, function (err/*, stats*/) {
        if (err) {
            return callback(err);
        }
        fs.readdir(dir, function (err, files) {
            if (err) {
                return callback(err);
            }
            async.reduce(files, '<pre><a href="../">../</a><br>',
                function (result, f, next) {
                    var p = path.resolve(dir, f);
                    fs.stat(p, function (err, stats) {
                        var line;
                        if (stats.isDirectory()) {
                            line = '<a href="' + f + '/">' + f + '/</a><br>';
                        } else {
                            line = '<a href="' + f + '">' + f + '</a><br>';
                        }
                        return next(null, result + line);
                    });
                },
                function (err, result) {
                    return callback(null, result + '</pre>');
                });
        });
    });
}

function handleHtmlApp(req, res, next, app) {
    /*
    HTML app url should be ended with slash('/') because it uses relative
    path in HTML code may cause problems. So if not, redirect to the url with slash
    */
    var subPath = app.getSubPathFromUrl(req.url);
    logger.info('subPath', subPath);
    if (subPath === '') {
        var slashEndedUrl = req.host + req.url + '/';
        logger.debug('Redirect to ' + slashEndedUrl);
        res.redirect(slashEndedUrl);
        return;
    }

    logger.info('req.parsedUrl : ', req.parsedUrl);
    var parsedUrl = req.parsedUrl;
    var fsPath = app.getFSPath(parsedUrl.pathname);
    logger.info('fsPath', fsPath);
    fs.exists(fsPath, function (exists) {
        if (exists) {
            logger.debug('Serve file:', fsPath);
            res.sendFile(fsPath);
        } else {
            var pathname = parsedUrl.pathname;
            if (pathname[pathname.length - 1] === '/') {
                // TOFIX see conf whether show dir html
                getDirHtml(fsPath, function (err, html) {
                    if (err) {
                        return res.sendErrorPage(404,
                            'Requested subpath is directory, and it is failed to read directory entry');
                        //return res.sendfail(new ClientError(404,
                        //    'Requested subpath is directory, and it is failed to read directory entry'));
                    } else {
                        return res.send(404, html);
                    }
                });
            } else {
                logger.info('File not found: ' + fsPath);
                return res.sendErrorPage(404, 'File not found');
                //return res.sendfail(new ClientError('File not found'));
            }
        }
    });
}

function proxyRequest(req, res, port, reqBuffer) {
    proxy.proxyRequest(req, res, {
        host: req.host,
        port: port,
        buffer: reqBuffer
    });
}

function handleNodejsApp(req, res, next, app, reqBuffer) {
    logger.debug('handleNodejsApp : ', app.appid);
    proxyRequest(req, res, app.port, reqBuffer);
}

function handleApp(req, res, next, app, reqBuffer) {
    if (app.isRunning()) {
        if (app.apptype === 'html') {
            handleHtmlApp(req, res, next, app);
        } else if (app.apptype === 'nodejs') {
            handleNodejsApp(req, res, next, app, reqBuffer);
        } else {
            logger.info('unknown apptype', app);
            next();
        }
    } else {
        res.sendErrorPage(404, 'This app is not running.');
    }
}

function frontend(req, res, next) {
    var reqBuffer = httpProxy.buffer(req);
    App.getInstanceByRequest(req, function (err, app) {
        if (err) {
            if (err === 'redirect') {
                return res.redirect(config.appHostUrl);
            } else {
                return res.sendErrorPage(404, 'Cannot find app for url. Check app domain or url.');
            }
        }
        logger.info('app frontend', app);
        handleApp(req, res, next, app, reqBuffer);
    });
}

/* This installs Webida system apps.
 * This should be called once before running Webida server.
 */
// FIXME this method is almost same with installOffline. Refactoring is needed.
exports.init = function (uid, callback) {
    function makeAppsPath(callback) {
        childProcess.execFile('mkdir', ['-p', config.services.app.appsPath], [],
                function (error, stdout, stderr) {
                    logger.debug('mkdir', config.services.app.appsPath, error, stdout, stderr);
                    callback(error);
                });
    }
    function deploy(appId, srcPath, user, callback) {
        logger.debug('deploy ', appId, srcPath);
        deployApp(appId, srcPath, user, function (err) {
            if (err) {
                logger.debug('Failed to deploy system app:', appId);
                return callback(err);
            }
            callback();
        });
    }
    function buildApp(appInfo, callback) {
        var srcPath = path.resolve(__dirname, '../systemapps', appInfo.appid);
        var packageObj;
        try {
            packageObj = require(srcPath + '/package.json');
            childProcess.exec('sh -c "npm install; npm update;"', {
                cwd: srcPath,
                env: process.env,
                maxBuffer: 1024 * 1024
            }, function (err, stdout, stderr) {
                if (err) {
                    logger.error('Failed to run npm install/update', arguments, err.stack);
                    return callback({
                        err: err,
                        stdout: stdout,
                        stderr: stderr
                    });
                }
                logger.info(srcPath, err, 'STDOUT', stdout.toString(), 'STDERR', stderr.toString());
                if (packageObj['build-dir']) {
                    srcPath = path.join(srcPath, '/' + packageObj['build-dir']);
                }
                callback(null, srcPath);
            });
        } catch (e) {
            logger.warn('Failed to find package.json in the app path (' + srcPath + '):', e);
            callback(null, srcPath);
        }
    }
    function addSystemApp(appInfo, callback) {
        logger.info('Install Webida system app:\'' + appInfo.appid + '\'');
        dao.user.$findOne({uid: uid}, function (err, context) {
            if (err) {
                callback(err);
            } else if (context.result()) {
                var user = context.result();
                appInfo.ownerId = user.userId;

                App.getInstanceByAppid(appInfo.appid, function (err, app) {
                    if (err) {
                        logger.error('Failed to get appinfo', arguments, err.stack);
                        return callback(err);
                    }
                    buildApp(appInfo, function (err, buildPath) {
                        if (err) {
                            logger.error('Failed to build app', appInfo.appid, err);
                            return callback(err.err || 'Failed to build app');
                        }
                        if (app) {
                            logger.info('app exists', appInfo);
                            deploy(appInfo.appid, buildPath, user, callback);
                        } else {
                            logger.info('create app', appInfo);
                            addNewApp(appInfo, {isAdmin: true}, function (err) {
                                if (err) {
                                    logger.debug('Failed to create system app:', appInfo);
                                    return callback(err);
                                }
                                deploy(appInfo.appid, buildPath, user, callback);
                            });
                        }
                    });
                });
            } else {
                callback('Unknown user: ' + uid);
            }
        });
    }
    function updateDB(callback) {
        async.eachSeries(config.systemApps.map(function (app) {
            return {
                appid: app.id,
                domain: app.domain,
                apptype: app.appType,
                name: app.name,
                desc: app.desc,
                status: app.status
            };
        }), addSystemApp, callback);
    }
    function createTable(callback) {
        dao.system.createAppTable({}, callback);
    }

    //logger.info('Use webida app DB: ', config.db.appDb);
    async.series([createTable, makeAppsPath, updateDB], callback);
};


/* This installs Webida system apps.
 *  *  * This should be called once before running Webida server.
 *   *   */
exports.installOffline = function (uid, callback) {
    function makeAppsPath(callback) {
        childProcess.execFile('mkdir', ['-p', config.services.app.appsPath], [],
                function (error, stdout, stderr) {
                    logger.debug('mkdir', config.services.app.appsPath, error, stdout, stderr);
                    callback(error);
                });
    }
    function deploy(appInfo, srcPath, user, callback) {
        logger.debug('deploy ', appInfo, srcPath);
        deployApp(appInfo.appid, srcPath, user, function (err) {
            if (err) {
                logger.debug('Failed to deploy system app:', appInfo);
                return callback(err);
            }
            callback();
        });
    }
    function buildApp(appInfo, callback) {
        var srcPath = path.resolve(__dirname, '../systemapps', appInfo.appid);
        var packageObj;
        try {
            packageObj = require(srcPath + '/package.json');
            logger.info('package.json', packageObj);
            if (packageObj['build-dir']) {
                srcPath = path.join(srcPath, '/' + packageObj['build-dir']);
            }
        } catch (e) {
            logger.warn('Failed to find package.json in the app path (' + srcPath + '):', e);
        }
        callback(null, srcPath);
    }
    function addSystemApp(appInfo, callback) {
        dao.user.$findOne({uid: uid}, function (err, context) {
            if (err) {
                callback(err);
            } else if (context.result()) {
                var user = context.result();

                logger.info('Install Webida system app:\'' + appInfo.appid + '\'');
                appInfo.ownerId = user.userId;
                App.getInstanceByAppid(appInfo.appid, function (err, app) {
                    if (err) {
                        logger.error('Failed to get appinfo', arguments, err.stack);
                        return callback(err);
                    }
                    buildApp(appInfo, function (err, buildPath) {
                        if (err) {
                            return callback(err);
                        }
                        if (app) {
                            logger.info('app exists', appInfo);
                            deploy(appInfo, buildPath, user, callback);
                        } else {
                            logger.info('create app', appInfo);
                            addNewApp(appInfo, {isAdmin: true}, function (err) {
                                if (err) {
                                    logger.debug('Failed to create system app:', appInfo);
                                    return callback(err);
                                }
                                deploy(appInfo, buildPath, user, callback);
                            });
                        }
                    });
                });
            } else {
                callback('Unknown user: ' + uid);
            }
        });
    }
    function updateDB(callback) {
        async.eachSeries(config.systemApps.map(function(app) {
            return {
                appid: app.id,
                domain: app.domain,
                apptype: app.appType,
                name: app.name,
                desc: app.desc,
                status: app.status
            };
        }), addSystemApp, callback);
    }

    async.series([makeAppsPath, updateDB], callback);
};


/**
  * This completely set the appInfo.
  * Note that if you're updating some properties, use udpateAppInfo().
  * @param appInfo appInfo object to be saved
  * @param isAdmin true if the caller has admin priv
  * @param callback return the return values(err, oldAppinfo)
  */
var addAppInfo = exports.addAppInfo = function (appInfo, user, callback) {
    logger.debug('addAppInfo: ', appInfo, user);

    validateAppInfo(appInfo, user, function (err, ret) {
        if (err) { return callback(err); }
        if (!ret) {
            return callback(new Error('Invalid appInfo' + JSON.stringify(appInfo)));
        }
        dao.app.$save(appInfo, function (err) {
            // TODO elaborate error cases(domain duplication or others)
            if (err) { return callback(err); }
            callback(null);
        });
    });
};

function updateAppInfo(appid, newAppInfo, user, callback) {
    logger.debug('updateAppInfo start', arguments);
    dao.app.$findOne({appid: appid}, function (err, context) {
        var appInfo = context.result();
        if (err) {
            return callback(err);
        }
        if (!appInfo) {
            return callback(new Error('app not found:' + appid));
        }

        _.extend(appInfo, newAppInfo);

        logger.debug('updateAppInfo: ', newAppInfo, 'result: ', appInfo);

        validateAppInfo(appInfo, user, function (err, ret) {
            if (err) { return callback(err); }
            if (!ret) {
                callback(new Error('Invalid appInfo:' + JSON.stringify(appInfo)));
            }
            dao.app.$update({id: appInfo.id, $set: appInfo}, function (err) {
                if (err) { return callback(err); }
                callback(null, appInfo);
            });
        });
    });
}
exports.updateAppInfo = updateAppInfo;

function removeAppInfo(appid, callback) {
    dao.app.$remove({appid: appid}, function (err, context) {
        var result = context.result();
        logger.debug('removeAppInfo deleted', appid, result.affectedRows);
        if (err) { return callback(err); }
        if (!result.affectedRows) {return callback(new Error('Cannot find app:' + appid)); }
        callback(null);
    });
}

function initHtmlApp(app, callback) {
    var filename = 'index.html';
    var appPath = app.getAppRootPath();
    fs.writeFile(path.join(appPath, filename), '', function (err) {
        // TODO error handling. ignore?
        callback(err, app);
    });
}

/**
 * This copies simple http server app to the specified app
 */
function initNodejsApp(app, callback) {
    var appPath = app.getAppRootPath();
    async.parallel([
        function (next) {
            // copy template js file
            var templatePath = path.join(__dirname, 'templates/nodejs/main.js');
            utils.copyFile(templatePath, path.join(appPath, 'main.js'), next);
        },
        function (next) {
            var packageInfo = _.pick(app, DEFAULT_APPINFO_PROPERTIES);
            packageInfo.scripts = {start: 'node main.js'};
            packageInfo.version = '0.0.0';
            logger.debug('initNodejsApp', packageInfo);
            packageInfo = JSON.stringify(packageInfo, null, 4);
            fs.writeFile(path.join(appPath, 'package.json'), packageInfo, next);
        }
    ], callback);
}

function addNewAppDoFSChores(app, callback) {
    // make directory for app files
    var appPath = app.getAppRootPath();
    logger.debug('appPath', appPath);
    fs.mkdir(appPath, function (err) {
        // TODO error rollback
        if (err) { callback(err); }
        if (app.apptype === 'html') {
            initHtmlApp(app, callback);
        } else if (app.apptype === 'nodejs') {
            initNodejsApp(app, callback);
        } else {
            callback(new Error('Unknown type'));
        }
    });
}

function addNewApp(newAppInfo, user, callback) {
    logger.info('addNewApp', newAppInfo, user);
    domainExist(newAppInfo.domain, function (err, exist) {
        if (err) {
            logger.error(err);
            return callback(err);
        }
        if (exist) {
            return callback(new ClientError('App already exists for domain:' + newAppInfo.domain));
        }

        var appid = newAppInfo.appid || shortid.generate();
        var app = new App(appid);
        app.domain = newAppInfo.domain;
        app.apptype = newAppInfo.apptype;
        app.name = newAppInfo.name || '';
        app.desc = newAppInfo.desc || '';
        app.ownerId = newAppInfo.ownerId;
        app.isDeployed = 0;
        app.status = 'stopped';

        var appInfo = _.pick(app, FULL_APPINFO_PROPERTIES);
        addAppInfo(appInfo, user, function (err) {
            if (err) {
                logger.error('Failed to add appinfo:', err);
                return callback(err);
            }
            addNewAppDoFSChores(app, function (err) {
                if (err) {
                    logger.error('Failed to add appinfo:fail fs chores:', err);
                    return callback(err);
                }
                startApp(app.appid, function (err) {
                    if (err) {
                        logger.error('Failed to add appinfo:fail startApp:', err);
                        return callback(err);
                    }
                    return callback(null, appid);
                });
            });
        });
    });
}
exports.addNewApp = addNewApp;

function removeApp(appid, userId, isAdmin, callback) {
    // TODO check authority
    logger.debug('Remove', appid);
    var app = new App(appid);
    var appInfo;
    async.waterfall([
        function (next) {
            app.getAppInfo(next);
        },
        function (appInfo, next) {
            if (!appInfo) {
                next(new Error('cannot find app', appid));
                return;
            }

            // stop nodejs app
            if (appInfo.apptype === 'nodejs' && appInfo.status === 'running') {
                stopApp(appid, userId, isAdmin, next);
            } else {
                next();
            }
        },
        function (next) {
            removeAppInfo(appid, next);
        },
        function (next) {
            // TODO delete files. currently just move it into 'deleted' dir
            var appRootPath = app.getAppRootPath();
            var appRootDirname = app.getAppRootDirname();
            var movePath = path.join(config.services.app.appsPath, 'deleted',
                makeTempNameFrom(appRootDirname));
            fs.rename(appRootPath, movePath, function (err) {
                // TODO rollback on error
                logger.debug('move app to deleted', appRootPath, movePath, err);
                next(err, appInfo);
            });
        }
    ], callback);

    function makeTempNameFrom(str) {
        return str + '-' + new Date().getTime();
    }
}
exports.removeApp = removeApp;

function ensurePathExists(pathToCheck, callback) {
    fs.exists(pathToCheck, function (exists) {
        if (exists) {
            callback();
        } else {
            fs.mkdir(pathToCheck, callback);
        }
    });
}

function doChangeAppInfo(appid, oldAppInfo, appInfo, user, callback) {
    updateAppInfo(appid, appInfo, user, function (err) {
        callback(err, oldAppInfo);
    });
}

function copyApps(srcPath, destPath, app, callback)
{
    fs.rename(srcPath, destPath, function (err) {
        if (err) {
            logger.error('Failed to move app to deploy path', err, err.stack);
            return callback(err);
        }

        return callback(null);
    });
}

function doDeploy(pPath, app, callback) {
    var appInfo = _.pick(app, FULL_APPINFO_PROPERTIES);
    updateAppInfo(app.appid, appInfo, {isAdmin: true}, function (err) {
        if (err) {
            return callback(err);
        }

        var appNew = new App(app.appid);
        var appPath = appNew.getAppRootPath();

		logger.info('appNew=', appNew);
		logger.info('appPath=', appPath);

        var deletedAppsPath = path.join(config.services.app.appsPath, 'deleted');
        ensurePathExists(deletedAppsPath, function (err) {
            if (err) {
                logger.error('deleted path does not exist or unable to create', err, err.stack);
                return callback(err);
            }

			// check app exist.
            fs.exists(appPath, function (exists) {
                if (exists) {
                    logger.info('apps exist');

                    var tmpTemplate = path.join(config.services.app.appsPath, 'deleted', appNew.getAppRootDirname() +
                        '-XXXXXX');
                    tmp.tmpName({ template: tmpTemplate }, function (err, movePath) {
                        fs.rename(appPath, movePath, function (err) {
                            if (err) {
                                logger.error('Failed to move old app to deleted path', err, err.stack);
                                return callback(err);
                            } else {
                                copyApps(pPath, appPath, app, callback);
                            }
                        });
                    });
                } else {
                    copyApps(pPath, appPath, app, callback);
                }
            }); // end of checking app p.
        });
    });
}

/**
  * @param directory path
**/
var deployApp = module.exports.deployApp = function (appid, pPath, user, callback) {
    logger.info('deployApp', arguments);
    App.getInstanceByAppid(appid, function (err, app) {
        // if exists app , stop and deploy
        if (app) {
            if (!user.isAdmin && app.ownerId !== user.userId) {
                return callback(new Error('Unauthorized request'));
            }

            async.series([
                function (next) {
                    if (user.isAdmin) { return next(); }

                    //db.apps.find({owner:user.uid}).count( function (err, count) {
                    dao.app.$count({ownerId: user.userId}, function (err, context) {
                        var count = context.result();
                        if (count > config.services.app.appQuotaCount - 1) {
                            next('Too many apps are deployed');
                        } else {
                            next(null);
                        }
                    });
                },
                function (next) {
                    fs.lstat(pPath, function (err, stats) {
                        if (err) {
                            logger.warn(err);
                            return next('Deploy path is invalid');
                        }

                        if (stats.isDirectory()) {
                            return next(null);
                        } else {
                            return next('Deploy path must be directory');
                        }
                    });
                },
                function (next) {
                    app.setDeploy(next);
                },
                function (next) {
                    if (app.isRunning() && app.apptype === 'nodejs') {
                        stopApp(app.appid, user.userId, user.isAdmin, next);
                    } else {
                        next(null);
                    }
                },
                function (next) {
                    doDeploy(pPath, app, next);
                }
            ], function (err) {
                app.unsetDeploy(function (err2) {
                    if (err2) { logger.error('Can not unset deploy flag :', app); }
                    callback(err);
                });
            });
        } else {
            return callback(new ClientError('App must be created before deploy'));
        }
    });

};

function deployPackageFile(appid, zipFile, subDirectory, user, callback) {
    tmp.dir(function _tempDirCreated(err, tmpPath) {
        if (err) {
            logger.debug(err);
            return callback(err);
        }
        tmpPath = path.join(tmpPath, '/');

        var cmd;
        var params;
        var sizeCheckCmd;
        var sizeCheckParams;
        if (path.extname(zipFile) === '.zip') {
            cmd = 'unzip';
            params = ['-q', zipFile, '-d', tmpPath];
            sizeCheckCmd = 'unzip';
            sizeCheckParams = ['-Zt', zipFile];
        } else {
            cmd = 'tar';
            params = ['xfm', zipFile, '-C', tmpPath];
            sizeCheckCmd = 'gzip';
            sizeCheckParams = ['-l', zipFile];
        }
        logger.info('size Check deployPackageFile', sizeCheckCmd, sizeCheckParams);
        childProcess.execFile(sizeCheckCmd, sizeCheckParams, function (err, stdout, stderr) {
            if (err) { return callback(err); }

            if (!stdout) { return callback('File size check failed'); }
            if (stderr) { return callback('File size check failed' + stderr); }

            var size;
            if (path.extname(zipFile) === '.zip') {
                size = stdout.split(/\s+/);
                size = _.compact(size);
                size = parseInt(size[2], 10);
            } else {
                size = stdout.split(/\s+/);
                size = _.compact(size);
                size = parseInt(size[5], 10);
            }

            logger.info('deployPackageFile', cmd, params, tmpPath, user.isAdmin, size,
                config.services.app.appQuotaSize);
            // App size check
            if (!user.isAdmin && size > config.services.app.appQuotaSize) {
                var error = new ClientError('App size limit is ' + config.services.app.appQuotaSize +
                    ' bytes. Your app size is ' + size + ' bytes');
                logger.info(error);
                return callback(error);
            }

            childProcess.execFile(cmd, params, function (err) {
                if (err) { return callback(err); }

                if (subDirectory) {
                    tmpPath = path.join(tmpPath, subDirectory);
                }
                deployApp(appid, tmpPath, user, function (err) {
                    if (subDirectory) {
                        // Remove tmp directory when subDirectory exist.
                        // Other case tmp directory move to app directory so, that is not exists.
                        fs.rmdir(path.join(tmpPath, '..'), function (cleanErr) {
                            // Ignore tmp directory remove error
                            if (cleanErr) { logger.warn(cleanErr); }
                            return callback(err);
                        });
                    } else {
                        callback(err);
                    }
                });
            });
        });
    });
}
module.exports.deployPackageFile = deployPackageFile;

/**
  * @param appid to be changed
  * @param newAppInfo
  * @param user
  * @param callback return the return values(err, oldAppInfo)
  */
function changeAppInfo(appid, newAppInfo, user, callback) {
    function hasAtLeastOneProperty(appInfo) {
        var numChanges = 0;
        if (appInfo.domain) {
            numChanges = numChanges + 1;
        }
        if (appInfo.apptype) {
            numChanges = numChanges + 1;
        }
        if (appInfo.name) {
            numChanges = numChanges + 1;
        }
        if (appInfo.desc) {
            numChanges = numChanges + 1;
        }
        if (appInfo.srcurl) {
            numChanges = numChanges + 1;
        }
        return numChanges > 0;
    }

    logger.debug('changeAppInfo', arguments);

    if (!hasAtLeastOneProperty(newAppInfo)) {
        callback(new Error('At least one property should be changed'));
        return;
    }

    var oldApp = new App(appid);
    oldApp.getAppInfo(function (err, oldAppInfo) {
        if (err) {
            return callback(err);
        }
        if (!oldAppInfo) {
            return callback(new Error('App does not exist: ' + appid));
        }
        var appInfo = {
            domain: newAppInfo.domain || oldAppInfo.domain,
            apptype: newAppInfo.apptype || oldAppInfo.apptype,
            name: newAppInfo.name || oldAppInfo.name,
            desc: newAppInfo.desc || oldAppInfo.desc,
            srcurl: newAppInfo.srcurl || oldAppInfo.srcurl
        };
        logger.debug('Change app from', oldAppInfo, 'to', appInfo);

        // Check can remove. It is only allowd admin or app owner
        if (!user.isAdmin && oldAppInfo.ownerId !== user.userId) {
            return callback(new Error('Only app owner can change information'));
        }

        doChangeAppInfo(appid, oldAppInfo, appInfo, user, callback);
    });
}
exports.changeAppInfo = changeAppInfo;

// Set app as stopped in DB
function setAppStopped(appid, callback) {
    logger.debug('setAppStopped', arguments);
    // It doesn't update domain so it does not check domain validation. So we call updateAppInfo for admin
    updateAppInfo(appid, {pid: null, status: 'stopped', port: null}, {isAdmin: true}, callback);
}

// Set app as running in DB
function setAppRunning(appid, pid, port, callback) {
    // It doesn't update domain so it does not check domain validation. So we call updateAppInfo for admin
    updateAppInfo(appid, {pid: pid, status: 'running', port: port}, {isAdmin: true}, callback);
}


/**
 * Map domain -> process object
 */
var nodejsProcMap = {};

/**
 * This is called when nodejs app is exited by Webida or itself or whatever.
 * If's it's not exited by Webida, just clean up the running info.
 */
function handleAppExit(appid, pid, code) {
    logger.debug('handleAppExit', appid, pid, code);
    delete nodejsProcMap[appid];

    App.getInstanceByAppid(appid, function (err, app) {
        if (app && app.isRunning()) {
            console.error('ERR: app is exiting while DB not cleared', appid);
            // This process is not properly stopped by Webida.stopApp()
            // This could be a bug.
            // Just clean up DB
            // TODO more?
            setAppStopped(appid, function () {});
        }
    });
}

function doStartApp(app, callback) {
    function startNodejsApp(app, callback) {
        var port = getEmptyPort();
        logger.debug('Empty port found:', port);

        var childEnv = _.extend(process.env, {PORT: port});
        var appProc = childProcess.spawn('npm', ['start'], {
            cwd: app.getAppRootPath(),
            env: childEnv,
            detached: false,
            stdio: 'inherit' // TODO log stdout/err
        });
        nodejsProcMap[app.appid] = appProc;

        appProc.on('exit', function (code) {
            handleAppExit(app.appid, appProc.pid, code);
        });

        //update routing info
        routeFileQueue.push({name:'appendNodeAppToRouteFile', domain:app.domain, port:port}, function (err) {
            if (err) {
                callback(err);
            } else {
                logger.info('Finish appendNodeAppToRouteFile');

                setAppRunning(app.appid, appProc.pid, port, callback);
            }
        });
    }
    function startHtmlApp(app, callback) {
        setAppRunning(app.appid, null, null, callback);
    }
    if (app.apptype === 'html') {
        startHtmlApp(app, callback);
    } else if (app.apptype === 'nodejs') {
        startNodejsApp(app, callback);
    } else {
        // shouldn't be reached here.
        throw new Error('Unknown apptype');
    }
}
function startApp(appid, callback) {
    logger.debug('startApp', appid);
    App.getInstanceByAppid(appid, function (err, app) {
        if (err) {
            return callback(err);
        }
        // check if it's already running
        if (app.isRunning()) {
            return callback(new Error('App is already running'));
        }
        doStartApp(app, callback);
    });
}
exports.startApp = startApp;

function doStopApp(app, callback) {
    function stopNodejsApp(app, callback) {
        // check if it's already stopped
        if (!app.isRunning()) {
            return callback(new Error('App is already stopped'));
        }

        //update routing info
        routeFileQueue.push({name : 'deleteNodeAppToRouteFile', domain : app.domain}, function (err) {
            if (err) {
                callback(err);
            } else {
                logger.info('Finish deleteNodeAppToRouteFile');

                setAppStopped(app.appid, function (err, lastAppInfo) {
                    if (err) {
                        // TODO
                        callback(err);
                    }
                    returnPort(lastAppInfo.port);
                    try {
                        //logger.info('stopApp', 'try to kill', app.pid);
                        process.kill(app.pid, 'SIGTERM');
                        callback(null);
                    } catch (e) {
                        //logger.info('stopApp', 'Failed to kill', e);
                        callback(e);
                    }
                });
            }
        });
    }
    function stopHtmlApp(app, callback) {
        setAppStopped(app.appid, callback);
    }
    if (app.apptype === 'html') {
        stopHtmlApp(app, callback);
    } else if (app.apptype === 'nodejs') {
        stopNodejsApp(app, callback);
    } else {
        // shouldn't be reached here.
        throw new Error('Unknown apptype');
    }
}
function stopApp(appid, userId, isAdmin, callback) {
    logger.debug('Stop ', appid);
    App.getInstanceByAppid(appid, function (err, app) {
        if (err) {
            callback(err);
            return;
        }
        // check if it's already running
        if (!app.isRunning()) {
            callback(new Error('App is already stopped'));
            return;
        }
        // Check can stop. It is only allowd admin or app owner
        if (!isAdmin && app.ownerId !== userId) {
            return callback(new Error('Only app owner can change information'));
        }
        doStopApp(app, callback);
    });
}
exports.stopApp = stopApp;

function stopAllNodejsApps(callback) {
    logger.info('Stop all nodejs apps');
    getAllAppInfos(null, function (err, appInfos) {
        if (err) {
            logger.warn(err);
            return callback(err);
        }

        async.each(appInfos, function (appInfo, next) {
            if (appInfo.apptype === 'nodejs' &&
                    appInfo.status === 'running') {
                logger.debug(appInfo);
                // stopApp with admin parameter true
                stopApp(appInfo.appid, undefined, true, next);
                return;
            }
            next();
        }, callback);
    });
}
exports.stopAllNodejsApps = stopAllNodejsApps;

function startAllNodejsApps(callback) {
    logger.info('Start all nodejs apps');
    getAllAppInfos(null, function (err, appInfos) {
        if (err) {
            return callback(err);
        }
        if (appInfos.length <= 0) {
            return callback();
        }
        async.each(appInfos, function (appInfo, next) {
            if (appInfo.type === 'nodejs' &&
                    appInfo.status === 'stopped') {
                logger.debug('startAllNodejsApps', appInfo);
                return startApp(appInfo.appid, next);
            }
            next();
        }, callback);
    });
}
exports.startAllNodejsApps = startAllNodejsApps;

var getAllAppInfos = exports.getAllAppInfos = function (projections, callback) {
    dao.app.$find({}, function (err, context) {
        var vals = context.result();
        if (err) {
            return callback(err);
        } else {
            if (projections) {
                return callback(null, _.pick(vals, projections));
            } else {
                return callback(null, vals);
            }

        }
    });
};

var getUserAppInfos = exports.getUserAppInfos = function (userId, projections, callback) {
    dao.app.$find({ownerId: userId}, function (err, context) {
        var vals = context.result();
        if (err) {
            return callback(err);
        } else {
            if (projections) {
                return callback(null, vals.map(function (val) {
                    return _.pick(val, projections);
                }));
            } else {
                return callback(null, vals);
            }
        }
    });
};

function deployFromGit(appid, srcUrl, user, res) {
    function readSizeRecursive(item, cb) {
        fs.lstat(item, function (err, stats) {
            var total = stats.size;

            if (err) {
                cb(err, total);
            } else if (!stats.isDirectory()) {
                cb(null, total);
            } else {
                fs.readdir(item, function (err, list) {
                    async.forEach(list, function (diritem, callback) {
                        readSizeRecursive(path.join(item, diritem), function (err, size) {
                            total += size;
                            callback(err);
                        });
                    }, function (err) {
                        cb(err, total);
                    });
                });
            }
        });
    }

    tmp.dir(function _tempDirCreated(err, tmpPath) {
        if (err) {
            logger.warn('deployFromGit failed to create temp dir', err);
            return res.sendfail(new ServerError('Failed to deploy from git'));
        }

        async.series([
            function (next) {
                childProcess.execFile('git', ['clone', srcUrl, tmpPath, '--depth=1'], next);
            },
            function (next) {
                readSizeRecursive(tmpPath, function (err, size) {
                    if (err) {
                        logger.warn(err);
                        return next('Deploy path is invalid');
                    }

                    // App size check
                    if (!user.isAdmin && size > config.services.app.appQuotaSize) {
                        var error = new ClientError('App size limit is ' + config.services.app.appQuotaSize +
                            ' bytes. Your app size is ' + size + ' bytes');
                        logger.info(error);
                        return next(error);
                    } else {
                        return next(null);
                    }
                });
            },
            function (next) {
                deployApp(appid, tmpPath, user, next);
            }
        ], function (err) {
            if (err) {
                logger.warn(err);
                return res.sendfail(new ServerError('Failed to deploy from git'));
            } else {
                return res.sendok();
            }
        });
    });
}
exports.deployFromGit = deployFromGit;

function deployFromWebidaFS(appid, wfsPathUrl, user, callback) {
    tmp.file({postfix: '.zip'}, function (err, tmpFile) {
        if (err) {
            logger.debug('deployFromWebidaFS failed to create temp dir', err);
            return callback(err);
        }
        var wfsUri = URI(wfsPathUrl);
        var fsid = wfsUri.segment(0);
        var subPath = wfsUri.segment(0, '').pathname();
        var downloadZipApi = URI(config.fsHostUrl);
        var projectName = '';

        if (path.extname(subPath) === '.zip') {
            downloadZipApi
                .segment('webida/api/fs/file')
                .segment(fsid)
                .segment(subPath)
                .addQuery('access_token', user.token);
        } else {
            if (wfsUri.segment(-1)) {
                projectName = wfsUri.segment(-1);
            } else {
                projectName = wfsUri.segment(-2);
            }

            downloadZipApi
                .segment('webida/api/fs/archive')
                .segment(fsid + '/')
                .addQuery('source', subPath)
                .addQuery('target', 'package.zip')
                .addQuery('mode', 'export')
                .addQuery('access_token', user.token);
        }
        var opts = {
            url: downloadZipApi.toString(),
            strictSSL: false // TOFIX security?
        };
        logger.info('deployFromWebidaFS get package', opts, 'to', tmpFile);
        var to = fs.createWriteStream(tmpFile);
        request(opts).pipe(to);
        to.on('finish', function () {
            deployPackageFile(appid, tmpFile, projectName, user, function (err) {
                fs.unlink(tmpFile, function (cleanErr) {
                    // Ignore tmp file remove error
                    if (cleanErr) { logger.warn('Deploy zip file error: ' + cleanErr); }
                    callback(err);
                });
            });
        });
    });
}
exports.deployFromWebidaFS = deployFromWebidaFS;

// App APIs
router.get('/webida/api/app/appinfo',
    authMgr.ensureLogin,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'app:getAppInfo', rsc:'app:*'}, res, next);
    },
    function (req, res) {
        var appid = req.parsedUrl.query.appid;
        var userId = req.user.userId;
        var isAdmin = req.user.isAdmin;

        logger.debug('appInfo', req.parsedUrl, appid);

        App.getInstanceByAppid(appid, function (err, app) {
            if (err) {
                return res.sendfail(new ServerError('Failed to get app information'));
            }
            if (!app) {
                return res.sendfail(new ClientError('App does not exist'));
            }

            // It is only allowd admin or app owner
            if (!isAdmin && app.ownerId !== userId) {
                return res.sendfail(new ClientError('Only app owner can get information'));
            }

            var appInfo = _.pick(app, APPINFO_PROPERTIES);
            res.sendok(appInfo);
        });
    }
);

router.get('/webida/api/app/allapps',
    authMgr.ensureLogin,
    function (req, res) {
        getAllAppInfos(APPINFO_PROJECTIONS, function (err, appInfos) {
            logger.debug('allapps', arguments);

            if (err) {
                return res.sendfail(new ServerError('Failed to get all of apps information'));
            } else {
                return res.sendok(appInfos);
            }
        });
    }
);

router.get('/webida/api/app/isValidDomain',
    authMgr.ensureLogin,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'app:isValidDomain', rsc:'app:*'}, res, next);
    },
    function (req, res) {
        var domain = req.parsedUrl.query.domain;

        isValidDomainFormat(domain, req.user, function (err, ret) {
            if (err || !ret) {
                return res.sendok(false);
            }

            domainExist(domain, function (err, exist) {
                if (err || exist) {
                    return res.sendok(false);
                } else {
                    return res.sendok(true);
                }
            });
        });
    }
);

router.get('/webida/api/app/create',
    authMgr.ensureLogin,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'app:createApp', rsc:'app:*'}, res, next);
    },
    function (req, res) {
        var appInfo = {};
        var query = req.parsedUrl.query;
        appInfo.domain = query.domain;
        appInfo.apptype = query.apptype;
        appInfo.name = query.name;
        appInfo.desc = query.desc;
        appInfo.ownerId = req.user.userId;
        addNewApp(appInfo, req.user, function (err, newAppid) {
            if (err) {
                return res.sendfail(err, 'Failed to create app:' + appInfo.domain);
            }
            return res.sendok(newAppid);
        });
    }
);

router.get('/webida/api/app/delete',
    authMgr.ensureLogin,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'app:deleteApp', rsc:'app:*'}, res, next);
    },
    function (req, res) {
        var userId = req.user.userId;
        var isAdmin = req.user.isAdmin;
        removeApp(req.parsedUrl.query.appid, userId, isAdmin, function (err/*, oldAppInfo*/) {
            if (err) {
                return res.sendfail(new ServerError('Failed to delete applciation:' + req.parsedUrl.query.appid));
            } else {
                return res.sendok();
            }
        });
    }
);

router.get('/webida/api/app/changeappinfo',
    authMgr.ensureLogin,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'app:setAppInfo', rsc:'app:*'}, res, next);
    },
    function (req, res) {
        var newAppInfo = {};
        var query = req.parsedUrl.query;
        newAppInfo.domain = query.newdomain;
        newAppInfo.apptype = query.newapptype;
        newAppInfo.name = query.newname;
        newAppInfo.desc = query.newdesc;
        newAppInfo.srcurl = query.newsrcurl;
        changeAppInfo(query.appid, newAppInfo, req.user, function (err/*, oldAppInfo*/) {
            if (err) {
                return res.sendfail(new ServerError('Failed to change app information:' + query.appid));
            } else {
                return res.sendok();
            }
        });
    }
);

router.get('/webida/api/app/myapps',
    authMgr.ensureLogin,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'app:getMyAppInfo', rsc:'app:*'}, res, next);
    },
    function (req, res) {
        var user = req.body.user || req.user;
        getUserAppInfos(user.userId, APPINFO_PROJECTIONS, function (err, appInfos) {
            if (err) {
                return res.sendfail(new ServerError('Failed to get my app information'));
            }
            logger.debug('myapps (%s): ', user.userId, appInfos);
            res.sendok(appInfos);
        });
    }
);

router.get('/webida/api/app/start',
    authMgr.ensureLogin,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'app:startApp', rsc:'app:*'}, res, next);
    },
    function (req, res) {
        var appid = req.parsedUrl.query.appid;

        startApp(appid, function (err) {
            if (err) {
                return res.sendfail(new ServerError('Failed to start app:' + appid));
            }
            res.sendok();
        });
    }
);

router.get('/webida/api/app/stop',
    authMgr.ensureLogin,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'app:stopApp', rsc:'app:*'}, res, next);
    },
    function (req, res) {
        var appid = req.parsedUrl.query.appid;
        var userId = req.user.userId;
        var isAdmin = req.user.isAdmin;

        stopApp(appid, userId, isAdmin, function (err) {
            if (err) {
                return res.sendfail(new ServerError('Failed to stop app:' + appid));
            }
            res.sendok();
        });
    }
);

router.get('/webida/api/app/deploy',
    authMgr.ensureLogin,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'app:deployApp', rsc:'app:*'}, res, next);
    },
    function (req, res) {
        var srcUrl = req.parsedUrl.query.srcUrl;
        var type = req.parsedUrl.query.type;
        var appid = req.parsedUrl.query.appid;
        var user = req.user;

        logger.debug('app/deploy', srcUrl, type, user.uid);

        if (type === 'git') {
            deployFromGit(appid, srcUrl, user, res);
        } else {
            // deploy from webida fs
            // TOFIX wfs url format. config has 'wfs://' protocol
            var wfsPathUrl = 'wfs://' + URI(config.fsHostUrl).hostname() + '/' + srcUrl;
            exports.deployFromWebidaFS(appid, wfsPathUrl, user, function (err) {
                if (err) {
                    return res.sendfail(err, 'Failed to deploy app: ' + appid);
                } else {
                    return res.sendok();
                }
            });
        }
    }
);

//deploy package file
router.post('/webida/api/app/deploy',
    authMgr.ensureLogin,
    multipartMiddleware,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'app:deployPkg', rsc:'app:*'}, res, next);
    },
    function (req, res) {
        var content = req.files.content;
        var zipFile = content.path;
        var appid = req.parsedUrl.query.appid;
        var user = req.user;

        if (!req.parsedUrl.query.hasOwnProperty('appid')) {
            return res.sendfail(new ClientError('Deploy appid is undefined'));
        }

        deployPackageFile(appid, zipFile, null, user, function (err) {
            fs.unlink(zipFile, function (cleanErr) {
                // Ignore tmp file remove error
                if (cleanErr) { logger.warn('Deploy tmp file error: ' + cleanErr); }

                if (err) {
                    return res.sendfail(err, 'Failed to deploy package file ' + appid);
                } else {
                    return res.sendok();
                }
            });
        });
    }
);

router.get('/webida/api/app/configs',
    function (req, res) {
        var result = {
            /*servers: {
                host: url.parse(config.appHostUrl).host,
                app: config.appHostUrl,
                auth: config.authHostUrl,
                fs: config.fsHostUrl,
                build: config.buildHostUrl,
                ntf: config.ntfHostUrl,
                cors: config.corsHostUrl,
                conn: config.connHostUrl,
                mon: config.monHostUrl,
            },*/
            systemApps: {},
            featureEnables: {
                signUp: config.services.auth.signup.allowSignup,
                guestMode: config.guestMode.enable
            }
        };
        async.each(config.systemApps, function (systemApp, callback) {
            App.getInstanceByAppid(systemApp.id, function (err, app) {
                if (err) {
                    return callback(err);
                }
                result.systemApps[systemApp.id] = {
                    baseUrl: app.getBaseUrl()
                };
                callback();
            });
        }, function (err) {
            if (err) {
                return res.sendfail(err, 'Failed to get information of system applications');
            } else {
                return res.sendok(result, true);
            }
        });
    }
);

router.all('*', frontend, function (req, res) {
    res.status(500).send('Unknown page');
});


