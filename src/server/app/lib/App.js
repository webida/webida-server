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

/**
 * App class representing an App
 * Use App.getInstance() to get an instance of App class.
 *
 * @since: 15. 11. 4
 * @author: Koong Kyungmi (kyungmi.k@samsung.com)
 */

var url = require('url');
var _ = require('underscore');
var path = require('path');

var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;
var db = require('../../common/db-manager')('app');
var dao = db.dao;

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;


var rootApp = null;

function App(appid) {
    this.id = appid;
    this.appid = appid;
    this.domain = null;
    this.apptype = null;
    this.name = null;
    this.desc = null;
    this.ownerId = null;
    this.status = 'stopped';
}

function getDomainByRequest(req) {
    var host = req.hostname;
    var domain = null;
    logger.debug('getDomainByRequest request : ', req.hostname, req.originalUrl);
    logger.info('deploy type', config.services.app.deploy.type);

    // It has only exception for empty subdomain ('') because of default webida-client app.
    // and deploy type 'path' always has the path started with 'pathPrefix'
    // for making a distinction with the default app.
    if (host === config.domain)  {
        domain = '';
    } else {
        domain = host.substr(0, host.indexOf('.' + config.domain));
    }
    if (domain === '' && config.services.app.deploy.type === 'path') {
        var paths = req.path.split('/');
        if (paths.length > 2 && paths[1] === config.services.app.deploy.pathPrefix) {
            domain = paths[2];
        }
    }

    logger.debug('getDomainByRequest domain : ', domain);
    return domain;
}

/**
 * Set and return rootApp global variable
 */
function getRootApp(callback) {
    if (rootApp) {
        return callback(null, rootApp);
    }
    var app = new App('');
    app.getAppInfo(function (err, appInfo) {
        if (err) {
            return callback(err);
        }
        if (!appInfo) {
            // Here shouldn't be reached. Root App is installed default and always exists.
            callback(new Error('Cannot find root app'));
        }
        app = _.extend(app, appInfo);

        rootApp = app;
        callback(null, app);
    });
}

App.prototype.getAppInfo = function (callback) {
    dao.app.$findOne({appid: this.appid}, function (err, context) {
        var app = context.result();
        if (err) {
            callback(err);
        } else {
            callback(null, app);
        }
    });
};
App.prototype.getAppRootDirname = function () {
    return this.appid;
};
App.prototype.getAppRootPath = function () {
    return path.join(config.services.app.appsPath, this.getAppRootDirname());
};
App.prototype.getFSPath = function (pathname) {
    var subPath = this.getSubPath(pathname);
    if (pathname[pathname.length - 1] === '/') {
        return path.join(config.services.app.appsPath, this.appid, subPath, 'index.html');
    } else {
        return path.join(config.services.app.appsPath, this.appid, subPath);
    }
};
App.prototype.getSubPathFromUrl = function (url) {
    var parsedUrl = require('url').parse(url);
    return this.getSubPath(parsedUrl.pathname);
};
App.prototype.getSubPath = function (pathname) {
    var result = pathname;
    if (this.domain && config.services.app.deploy.type === 'path') {
        var prefixPath = '/' + config.services.app.deploy.pathPrefix + '/' + this.domain;
        if (pathname.indexOf(prefixPath) === 0) {
            result = pathname.substring(prefixPath.length);
        }
    }
    return result;
};

/**
 * get App's base url to be deployed without trailing slashes('/')
 *
 * @returns {string} - the accessible full url represent the root directory of this app
 */
App.prototype.getBaseUrl = function () {
    var deployConf = config.services.app.deploy;
    var baseUrl;
    if (deployConf.type === 'path') {
        baseUrl = url.resolve(config.appHostUrl, this.domain ? ('/' + deployConf.pathPrefix + '/' + this.domain) : '');
    } else {    // type === 'domain'
        var appHostUrl = url.parse(config.appHostUrl);
        appHostUrl.host = (this.domain ? (this.domain + '.') : '') + appHostUrl.host;
        baseUrl = url.format(appHostUrl);
    }
    return baseUrl.replace(/\/+$/, '');
};

App.isUrlSlashEnded = function (url) {
    return (url.length > 0) && (url[url.length - 1] === '/');
};
/* This returns if this app is running AS RETURN VALUE.
 * This should be called after fetching appInfo. Or it throws error.
 */
App.prototype.isRunning = function () {
    // if status === 'stopped', it's stopped. Or it's running.
    // TOFIX status has running. Does it check not stopped status return is correct?
    if (this.status) {
        logger.debug('isRunning', this.appid, this.status);
        return this.status !== 'stopped';
    } else {
        throw new Error('App information is incorrect');
    }
};

App.prototype.setDeploy = function (callback) {
    logger.info('setDeploy', this.appid);
    var self = this;
    dao.app.$findOne({appid: self.appid, isDeployed: 0}, function (err, context) {
        var appInfo = context.result();
        if (err) {
            logger.error('setDeploy: query failed');
            return callback(err);
        } else if (!appInfo) {
            var error = new ClientError('App does not exist or is already being deployed');
            logger.error('setDeploy:', error);
            return callback(error);
        } else {
            dao.app.$update({appid: self.appid, $set: {isDeployed: 1}}, function (err) {
                callback(err);
            });
        }
    });
};

App.prototype.unsetDeploy = function (callback) {
    dao.app.$update({appid: this.appid, $set: {isDeployed: 0}}, callback);
};

/*
 * callback(err, app): app is null if not exists
 */
App.getInstanceByAppid = function (appid, callback) {
    var app = new App(appid);
    app.getAppInfo(function (err, appInfo) {
        logger.debug('App.getInstanceByAppid', appid);
        if (err) {
            return callback(err);
        }
        if (appInfo) {
            app = _.extend(app, appInfo);
            return callback(null, app);
        } else {
            return callback(null, null);
        }
    });
};
App.getInstance = App.getInstanceByAppid;

App.getInstanceByDomain = function (domain, callback) {
    dao.app.$findOne({domain: domain}, function (err, context) {
        var appInfo = context.result();
        if (err) {
            callback(err);
        } else {
            if (appInfo && appInfo.appid) {
                var app = new App(appInfo.appid);
                app.getAppInfo(function (err, appInfo) {
                    logger.debug('App.getInstanceByAppid', appInfo.appid);
                    if (err) {
                        return callback(err);
                    }
                    if (appInfo) {
                        app = _.extend(app, appInfo);
                        return callback(null, app);
                    } else {
                        return callback();
                    }
                });
            } else {
                callback();
            }
        }
    });
};

App.getInstanceByRequest = function (req, callback) {
    var domain;
    logger.info('getInstanceByRequest', req.hostname, req.originalUrl);
    try {
        //var parsedUrl = require('host').parse(url, true);
        //domain = parsedUrl.pathname.split('/')[1];
        domain = getDomainByRequest(req);
    } catch (e) {
        return callback(new Error('Invalid host: ' + req.hostname));
    }

    if (domain === 'www') {
        return callback('redirect');
    }

    App.getInstanceByDomain(domain, function (err, app) {
        if (!app) {
            return callback('Can not find app information');
        }

        app.getAppInfo(function (err, appInfo) {
            if (err) {
                return callback(err);
            }
            if (appInfo) {
                app = _.extend(app, appInfo);
                return callback(null, app);
            }
            getRootApp(callback);
        });
    });
};

module.exports = App;
