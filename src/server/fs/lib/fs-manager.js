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

'use strict';

var Path = require('path');
var URI = require('URIjs');
var send = require('send');
var express = require('express');
var async = require('async');
var _ = require('lodash');
var tmp = require('tmp');
var shortid = require('shortid');
var formidable = require('formidable');

var authMgr = require('../../common/auth-manager');
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

var db = require('./webidafs-db').getDb();
var ntf = require('./ntf-manager').NtfMgr;
var flinkMap = require('./flinkmap');
var attr = require('./attr');
var fsAlias = require('./fs-alias');
var linuxfs = require('./linuxfs/' + config.services.fs.linuxfs);
var WebidaFS = require('./webidafs').WebidaFS;

var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();

var fsService = require('./fs-service');
var Resource = require('./Resource');

var META_ATTR_PREFIX = 'user.wfs.meta.';

var router = new express.Router();
module.exports.router = router;

module.exports.close = function () {
};

module.exports.setLinuxFS = function (linuxFsModule) {
    linuxfs = linuxFsModule;
};

ntf.init('127.0.0.1', config.ntf.port, function () {
    logger.debug('connected to ntf');
});

function getFsinfosByUserId(userId, callback) {
    db.wfs.$find({ownerId: userId}, function (err, context) {
        var infos = context.result();
        if (err) {
            logger.error(err);
            return callback(new ServerError('Failed to get filesystem infos'));
        }
        return callback(null, infos);
    });
}
exports.getFsinfosByUid = getFsinfosByUserId;

function getWfsByFsid(fsid, callback) {
    if (!fsid) {
        return callback(new Error('fsid is null'));
    }

    db.wfs.$findOne({fsid: fsid}, function (err, context) {
        var info = context.result();
        if (err) {
            return callback(err);
        }
        if (!info) {
            return callback(new Error(
                'Could not find fsid(' + fsid + ') data'));
        }
        return callback(null, new WebidaFS(info));
    });
}
exports.getWfsByFsid = getWfsByFsid;

function getTopicsFromPath(path, fsid) {
    var scopeStr = 'sys.fs.change:';
    var topics = new Array(scopeStr + 'fs:' + fsid + path);
    var index;
    while (true) {
        index = path.lastIndexOf('/');
        if (index === -1) {
            break;
        }

        path = path.slice(0, index);
        var topic = scopeStr + 'fs:' + fsid + path + '/*';
        topics.push(topic);
    }
    return topics;
}

function fsChangeNotifyTopics(path, op, opuid, fsid, sessionID) {
    var opData = {
        eventType: op,
        opUid: opuid,
        fsId: fsid,
        path: path
    };

    if (sessionID) {
        opData.sessionID = sessionID;
    }

    var msgData = {
        topic: 'reserved',
        eventType: 'fs.change',
        data: opData
    };

    var topics = getTopicsFromPath(path, fsid);

    ntf.sysnoti2(topics, msgData, function (/*err*/) {
        logger.info('notified topics - ', topics);
        logger.info('notified data - ', msgData);
    });
}

function fsCopyNotifyTopics(path, op, opuid, fsid, srcPath, destPath, sessionID) {
    var opData = {
        eventType: op,
        opUid: opuid,
        fsId: fsid,
        srcPath: srcPath,
        destPath: destPath
    };

    if (sessionID) {
        opData.sessionID = sessionID;
    }

    var msgData = {
        topic: 'reserved',
        eventType: 'fs.change',
        data: opData
    };

    var topics = getTopicsFromPath(path, fsid);
    ntf.sysnoti2(topics, msgData, function (/*err*/) {
        logger.info('notified topics - ', topics);
        logger.info('notified data  - ', msgData);
    });
}

function fsExecNotifyTopics(path, op, opuid, fsid, subCmd, sessionID) {
    var opData = {
        eventType: op,
        opUid: opuid,
        fsId: fsid,
        path: path,
        subCmd: subCmd
    };

    if (sessionID) {
        opData.sessionID = sessionID;
    }


    var msgData = {
        topic: 'reserved',
        eventType: 'fs.change',
        data: opData
    };

    var topics = getTopicsFromPath(path, fsid);

    ntf.sysnoti2(topics, msgData, function (/*err*/) {
        logger.info('notified topics - ', topics);
        logger.info('notified data - ', msgData);
    });
}

var secArgs = [ 'clone', 'pull', 'fetch' ];
var blackArgs = [ 'status' ];

function updateByExec(cmdInfo, uid, fsid, path, wfsUrl, sessionID, cb) {
    logger.info('updateByExec - ', path);

    var arg = cmdInfo.args[0];
    logger.debug('sec: cmd  - ', arg);
    if (!_.contains(blackArgs, arg)) {
        fsExecNotifyTopics(path, 'filedir.exec', uid, fsid, arg, sessionID);
    }

    // for sec
    if (!_.contains(secArgs, arg)) {
        return cb();
    }

    var localPath = WebidaFS.getPathFromUrl(wfsUrl);
    logger.debug('sec: local path = ', localPath);
    fsService.stat(localPath, function (error/*, stat*/) {
        if (error) {
            logger.error('sec exec err - ', error);
            if (cb) {
                cb();
            }
        } else {
            // FIXME temp logic
            if (cb) {
                cb();
            }
            /*
             if (stat.isDirectory()) {
             flinkMap.updateLinkByExec(fsid, localPath, function (err) {
             if (!err) {
             logger.info('sec: updateByExec done');
             }
             if (cb) {
             cb();
             }
             });
             }
             */
        }
    });
}

module.exports.updateByExec = updateByExec;

var GIT_CHECKLOCK_CMDS = ['checkout', 'merge', 'mv', 'pull', 'rebase', 'rm', 'revert', 'stash'];
function checkLock(fsid, path, cmdInfo, callback) { // check locked file
    if ((cmdInfo.cmd === 'git' || cmdInfo.cmd === 'git.sh') &&
        _.contains(GIT_CHECKLOCK_CMDS, cmdInfo.args[0])) {

        db.wfs.$findOne({fsid: fsid}, function (err, context) {
            var wfsInfo = context.result();
            if (err) {
                return callback(err);
            } else if (wfsInfo) {
                //var regPath = new RegExp(path);
                db.lock.getLock({wfsId: wfsInfo.wfsId, path: path}, function(err, context) {
                    var files = context.result();
                    logger.info('checkLock', fsid, path, cmdInfo, path, files);
                    if (err) {
                        return callback(new ServerError('Check lock failed.'));
                    } else if (files.length > 0) {
                        return callback(new ClientError('Locked file exist.'));
                    } else {
                        return callback(null);
                    }
                });
            } else {
                return callback(new ClientError('Unkown WFS: ' + fsid));
            }
        });
    } else {
        return callback(null);
    }
}
module.exports.checkLock = checkLock;

/**
 * Get Metadata
 */
function getMeta(srcUrl, metaName, callback) {
    var srcpath = WebidaFS.getPathFromUrl(srcUrl);
    var attrName = META_ATTR_PREFIX + metaName;
    attr.getAttr(srcpath, attrName, function (err, val) {
        if (err) {
            return callback(new Error('Failed to get metadata'));
        }
        try {
            var metadata = JSON.parse(val);
            callback(null, metadata);
        } catch (e) {
            callback(null, '');
        }
    });
}
exports.getMeta = getMeta;

function setMeta(srcUrl, metaName, val, callback) {
    var srcpath = WebidaFS.getPathFromUrl(srcUrl);
    var attrName = META_ATTR_PREFIX + metaName;
    var str = JSON.stringify(val);
    attr.setAttr(srcpath, attrName, str, callback);
}
exports.setMeta = setMeta;

function removeMeta(srcUrl, metaName, callback) {
    var srcpath = WebidaFS.getPathFromUrl(srcUrl);
    var attrName = META_ATTR_PREFIX + metaName;
    attr.removeAttr(srcpath, attrName, callback);
}
exports.removeMeta = removeMeta;

/**
 * callback(err, fsinfo)
 * fsinfo: {owner: <user id>, fsid: <id>}
 */
function doAddNewFS(owner, fsid, callback) {
    if (typeof fsid === 'function') {
        callback = fsid;
        fsid = null;
    }

    fsid = fsid || shortid.generate();
    var fsinfo = {
        wfsId: fsid,
        fsid: fsid
    };
    var ownerUid = parseInt(owner);

    db.transaction([
        db.user.$findOne({uid: ownerUid}),
        function (context, next) {
            var userInfo = context.result();
            if (!userInfo) {
                next('Unkown owner: ' + owner);
            } else {
                fsinfo.ownerId = userInfo.userId;
                next();
            }
        },
        function (context, next) {
            db.wfs.$save(fsinfo, function (err) {
                next(err);
            }, context);
        },
        function (context, next) {
            linuxfs.createFS(fsid, next);
        }
    ], function (err) {
        if (err) {
            logger.error('createFS failed', fsinfo, err);
            callback(err);
        } else {
            db.wfs.$findOne({wfsId: fsid}, function (err, context) {
                callback(err, context.result());
            });
        }
    });
}
exports.doAddNewFS = doAddNewFS;

function addNewFS(user, owner, callback) {
    logger.info('addNewFS start', user, owner);
    async.waterfall([
        function (next) {
            // Ensure owner is a valid user
            utils.getEmail(owner, function (err) {
                // It's a valid user if email exists. TOFIX what if non-activated user?
                if (err) {
                    return next(new ClientError('Not a valid user'));
                }
                next();
            });
        },
        function (next) {
            // Ensure max number of FS's of normal user
            if (!user.isAdmin) {
                getFsinfosByUserId(user.userId, function (err, fsinfos) {
                    if (err) { return next(err); }
                    if (fsinfos.length >= config.services.fs.fsPolicy.numOfFsPerUser) {
                        return next(new ClientError('Max filesystems exceeded'));
                    }
                    return next();
                });
            } else {
                return next();
            }
        },
        function (next) {
            doAddNewFS(owner, next);
        }
    ], callback);
}
exports.addNewFS = addNewFS;

function doDeleteFS(fsid, ownerId, callback) {
    db.transaction([
        db.alias.$remove({wfsId: fsid}),
        db.downloadLink.$remove({wfsId: fsid}),
        db.lock.$remove({wfsId: fsid}),
        db.wfs.$remove({fsid: fsid}),
        db.wfsDel.$save({wfsId: fsid, fsid: fsid, ownerId: ownerId}),
        function (context, next) {
            linuxfs.deleteFS(fsid, next);
        }
    ], function (err) { // called with (err, context)
        if (err) {
            logger.error('doDeleteFS failed', fsid, err);
            return callback(err);
        }
        return callback(null);
    });
}

/**
 * Delete WFS
 *
 * @param userinfo
 * @param fsid
 * @param callback - callback(err)
 */
function deleteFS(user, fsid, callback) {
    logger.info('deleteFS start', user, fsid);
    if (!fsid) {
        return callback(new Error('Invalid fsid'));
    }
    return doDeleteFS(fsid, user.userId, callback);
}
exports.deleteFS = deleteFS;

function serveFile(req, res, srcUrl, serveErrorPage) {
    var sendError = serveErrorPage ? res.sendErrorPage : res.sendfail;
    var path = WebidaFS.getPathFromUrl(srcUrl);
    if (!path) {
        return sendError(new ClientError('Invalid file path'));
    }
    fsService.stat(path, function (error, stats) {
        if (error) {
            return sendError(new ClientError(404, 'No such file'));
        } else {
            if (stats.isDirectory()) {
                return sendError(new ClientError('Only file can be served. It is a directory path.'));
            } else if (stats.isFile()) {
                // serve hidden files(starting with dot), too
                return send(req, path).hidden(true).pipe(res);
            } else {
                // Shouldn't be reached
                return sendError(new ClientError('Invalid type of resource'));
            }
        }
    });
}

/** Get filesystem info
 * @param {String} fsid
 * @returns {Object} fsinfo - {owner: <user id>, fsid: <fsid>}
 */
router.get('/webida/api/fs/:fsid',
    authMgr.ensureLogin,
    function (req, res) {
        var fsid = req.params.fsid;
        var fs = new WebidaFS(fsid);
        fs.getInfo(function (err, fsinfo) {
            if (err) {
                return res.sendfail(err, 'Failed to get filesystem info' + fsid);
            }

            if (req.user.userId === fsinfo.ownerId) {
                return res.sendok(fsinfo);
            } else {
                var authInfo = {
                    uid:req.user.uid,
                    action:'fs:getFSInfo',
                    rsc: 'fs:' + req.params.fsid + '/*'
                };

                authMgr.checkAuthorize(authInfo, res, function() {
                    return res.sendok(fsinfo);
                });
            }
        });
    }
);

/** Get all filesystem infos for owner
 * @param {String} uid
 * @returns {Object} fsinfos - [{owner: <user id>, fsid: <fsid>}]
 */
router.get('/webida/api/fs',
    authMgr.ensureLogin,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'fssvc:getMyFSInfos', rsc:'fssvc:*'}, res, next);
    },
    function (req, res) {
        var user= req.body.user || req.user;
        getFsinfosByUserId(user.userId, function (err, fsinfos) {
            if (err) {
                logger.info('allfsinfos err', err, user.userId);
                return res.sendfail(err, 'Failed to get filesystem info');
            } else if (!fsinfos) {
                logger.info('no fs info for', user.userId);
                res.sendok(new Array([]));
            } else {
                logger.info('allfsinfos success', user.userId, fsinfos);
                res.sendok(fsinfos);
            }
        });
    });

/** Create new filesystem
 *
 * @param {String} owner - owner uid who will be the owner of the newly created filesystem
 * @returns {Object} result - {result:'ok'|'fail', fsinfo: {owner: <user id>, fsid: <fsid>}}
 */
router.post('/webida/api/fs',
    authMgr.ensureLogin,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'fssvc:addMyFS', rsc:'fssvc:*'}, res, next);
    },
    function (req, res) {
        var user = req.user; // requester
        var owner = req.body.owner; // owner uid
        if (!owner) {
            return res.sendfail(new ClientError('Owner is not specified'));
        }
        var STATE = Object.freeze({ADDNEWFS:0, CREATEPOLICY:1, ASSIGNPOLICY:2});
        var policyRule = {name: 'DefaultFS', action: ['fs:*']};
        var state;
        var fsid;

        // rollback function
        var rollback = function (err, result) {
            var msg;
            switch (state) {
                case STATE.ASSIGNPOLICY:
                    var policy = result;
                    msg = msg || 'addNewFS assignPolicy fail';
                    authMgr.deletePolicy(policy.pid, user.token, function (err) {
                        if (err) {
                            logger.debug('rollback: deletePolicy fail', err);
                        } else {
                            logger.debug('rollback: deletePolicy done');
                        }
                    });
                /* falls through */
                case STATE.CREATEPOLICY:
                    msg = msg || 'addNewFS createDefaultFSPolicy fail';
                    deleteFS(user, fsid, function (err) {
                        if (err) {
                            logger.debug('rollback: deletFS fail', err);
                        } else {
                            logger.debug('rollback: deletFS done');
                        }
                    });
                /* falls through */
                case STATE.ADDNEWFS:
                    msg = msg || 'addNewFS fail';
                    break;
                default:
                    msg = msg || 'addNewFS unknown fail';
            }
            logger.info(msg, err, result);
            return res.sendfail(err, 'Failed to create new filesystem');
        };

        /* create fs */
        async.waterfall([
            function (cb) {
                state = STATE.ADDNEWFS;
                addNewFS(user, owner, cb);
            },
            function (fsinfo, cb) {
                fsid = fsinfo.fsid;
                state = STATE.CREATEPOLICY;
                policyRule.resource = ['fs:' + fsid + '/*'];
                authMgr.createPolicy(policyRule, user.token, _.partialRight(cb, fsinfo));
            },
            function (policy, fsinfo, cb) {
                if (!policy) {
                    return cb(new ServerError('createPolicy failed ' +
                        JSON.stringify(policyRule)));
                }
                state = STATE.ASSIGNPOLICY;
                authMgr.assignPolicy(owner, policy.pid, user.token, function (err) {
                    if (err) {
                        return cb(err, policy);
                    } else {
                        return cb(null, fsinfo);
                    }
                });
            }
        ], function (err, result) {
            if (err) {
                return rollback(err, result);
            }
            logger.info('addNewFS success', result);
            res.sendok(result);
        });
    }
);

/** Delete filesystem
 *
 * @param {String} fsid
 */
router.delete('/webida/api/fs/:fsid',
    authMgr.ensureLogin,
    function (req, res, next) {
        var user = req.user;
        if (!user.isAdmin) {
            authMgr.checkAuthorize({uid:user.uid,
                action:'fssvc:deleteFS', rsc:'fssvc:*'}, res, next);
        } else {
            return next();
        }
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var user = req.user;
        var done = false;

        async.waterfall([
            function (cb) {
                deleteFS(user, fsid, cb);
            },
            function (cb) {
                done = true;
                var policyRule = {name: 'DefaultFS',
                    action: ['fs:*'], resource: ['fs:' + fsid + '/*']};
                authMgr.getPolicy(policyRule, user.token, cb);
            },
            function (policy, cb) {
                if (!policy) {
                    logger.debug('getPolicy return null');
                    return cb(new Error('No proper policy'));
                }
                var pid = policy.pid;
                authMgr.removePolicy(pid, user.token, function (err) {
                    if (err) {
                        logger.debug('removePolicy fail', err);
                    } else {
                        logger.debug('removePolicy done');
                    }
                    return cb(err, pid);
                });
            },
            function (pid, cb) {
                authMgr.deletePolicy(pid, user.token, function (err) {
                    if (err) {
                        logger.debug('deletePolicy fail', err);
                    } else {
                        logger.debug('deletePolicy done');
                    }
                    return cb(err);
                });
            }
        ], function (err) {
            if (!done) {
                logger.info('Failed to delete filesystem ', fsid, err);
                return res.sendfail(err, 'Failed to delete filesystem');
            }
            res.sendok();
        });
    }
);

/**
 * Get file list.
 * Requires READ permission.
 *
 * @method RESTful API list - /webida/api/fs/list/{fsid}/{path}[?recursive={value}}]
 * @param {String} fsid - fsid
 * @param {String} path - relative path
 * @param {String} recursive - true / false [default=false]
 */
router.get('/webida/api/fs/list/:fsid/*',
    authMgr.getUserInfo,
    function (req, res, next) {
        var uid = req.user ? req.user.uid : 0;
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:uid, action:'fs:list', rsc:rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var srcUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));
        var options = {};

        var recursive = req.query.recursive || 'false';
        if (recursive === 'true') {
            options.recursive = true;
        } else if (recursive === 'false') {
            options.recursive = false;
        } else {
            return res.sendfail(new ClientError('Invalid value for recursive option(true or false)'));
        }

        console.log('list', req.user, srcUrl);
        fsService.list(srcUrl, options, function (err, tree) {
            if (err) {
                return res.sendfail(new ClientError(404, 'Failed to get the file list'));
            }
            return res.sendok(tree);
        });
    }
);

/**
 * Extended version of list api.
 * Requires READ permission.
 *
 * @method RESTful API listEx - /webida/api/fs/list/{fsid}/{path}
 * @param {String} fsid - fsid
 * @param {String} path - relative path
 * @param {String} options - {recursive, dirOnly, fileOnly, maxDepth}
 */
router.get('/webida/api/fs/listex/:fsid/*',
    authMgr.getUserInfo,
    function (req, res, next) {
        var uid = req.user ? req.user.uid : 0;
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:uid, action:'fs:listEx', rsc:rsc}, res, next);
    },
    function (req, res) {
        var srcUrl = 'wfs://' + req.params.fsid + Path.join('/', decodeURI(req.params[0]));
        var options = req.query;
        logger.info('listEx', srcUrl, options);

        fsService.list(srcUrl, options, function (err, tree) {
            if (err) {
                return res.sendfail(new ClientError(404, 'Failed to get the file list'));
            }
            return res.sendok(tree);
        });
    }
);

function _nodeStatToWebidaStat(filename, path, nodeStat) {
    return {
        name: filename,
        path: path,
        isFile: nodeStat.isFile(),
        isDirectory: nodeStat.isDirectory(),
        size: nodeStat.size,
        atime: nodeStat.atime,
        mtime: nodeStat.mtime,
        ctime: nodeStat.ctime
    };
}

/**
 * file stat
 *
 * @method RESTful API stat - /webida/api/fs/stat/{fsid}/?src={path}
 * @param {String} fsid - fsid
 * @param {String} path - relative path
 */
router.get('/webida/api/fs/stat/:fsid/*',
    authMgr.getUserInfo,
    function (req, res, next) {
        var uid = req.user ? req.user.uid : 0;
        var aclInfo = { uid:uid,
            action:'fs:stat',
            rsc:req.query.source,
            fsid:req.params.fsid};
        authMgr.checkAuthorize(aclInfo, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        if (!req.query || !req.query.source) {
            return res.sendfail(new ClientError(403, 'src path is empty'));
        }
        var source = decodeURI(req.query.source);
        var sourcePathList = source.split(';');
        var wstats = [];

        async.eachSeries(sourcePathList,
            function(sourcePath, next) {
                var srcUrl = 'wfs://' + fsid + Path.join('/', sourcePath);
                var rsc = new Resource(srcUrl);
                fsService.stat(rsc.localPath, function (err, stat) {
                    wstats.push(_nodeStatToWebidaStat(rsc.basename, rsc.pathname, stat));
                    return next();
                });
            },
            function (err) {
                if (err) { return res.sendfail(err, 'Failed to get stat'); }
                return res.sendok(wstats);
            }
        );
    }
);

/**
 * Read file
 * Requires READ permission.
 *
 * @method RESTful API readFile - /webida/api/fs/file/{fsid}/{path}
 * @param {String} fsid - fsid
 * @param {String} path - relative path
 */
router.get('/webida/api/fs/file/:fsid/*',
    authMgr.getUserInfo,
    function (req, res, next) {
        var uid = req.user ? req.user.uid : 0;
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:uid, action:'fs:readFile', rsc:rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var srcUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));
        logger.debug('readFile', {user:req.user, src : srcUrl});
        serveFile(req, res, srcUrl);
    }
);

function writeFile(wfsUrl, filePath, callback) {
    var rsc = new Resource(wfsUrl);
    var targetPath = rsc.localPath;

    logger.debug('writeFile ', {wfsUrl, filePath, targetPath} );

    if (!targetPath) {
        return callback(new Error('Invalid file path'));
    }

    function doWriteFile(callback) {
        var callbackCalled = false;
        var downloadedFileStream = fsService.createReadStream(filePath);
        var targetStream = fsService.createWriteStream(targetPath);
        downloadedFileStream.pipe(targetStream);
        targetStream.on('finish', function () {
            if (!callbackCalled) {
                return callback(null);
            }
        });
        targetStream.on('error', function (error) {
            logger.error('writeFile fail', error, filePath, targetPath, arguments);
            callbackCalled = true;
            if(error.code === 'ENOSPC'){
                // there is no space to write
                return callback('You have exceeded your quota limit.');
            } else {
                return callback('Failed to write file');
            }
        });
    }

    doWriteFile(callback);
}
exports.writeFile = writeFile;

/**
 * Write the file's data
 * Requires WRITE permission for the target directory or WRITE permission for the existing file.
 *
 * @method RESTful API writeFile - /webida/api/fs/file/{fsid}/{path}[?encodig={value}]
 * @param {String} fsid - fsid
 * @param {String} path - relative path
 * @param {File} file - File content is sent in file field of the form
 */
router.post('/webida/api/fs/file/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) {
        var fsid = req.params.fsid;
        var dest = decodeURI(req.params[0]);
        var path = (new WebidaFS(fsid)).getFSPath(dest);
        fsService.exists(path, function(exist) {
            if (dest[0] !== '/') {
                dest = Path.join('/', dest);
            }

            var rsc = fsid + dest;
            if (!exist) {
                rsc = Path.dirname(rsc);
            }

            authMgr.checkAuthorize({uid:req.user.uid, action:'fs:writeFile', rsc:'fs:'+rsc}, res, next);
        });
    },
    function (req, res, next) {
        var fsid = req.params.fsid;
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        db.lock.$findOne({wfsId:fsid, path:path}, function(err, context) {
            var lock = context.result();
            logger.debug('writeFile check lock - read lock object from db = ', lock);
            if (err) {
                logger.error('writeFile locking error ', err);
                return res.sendfail(err, 'Failed to write file. (failed to get lock info)');
            } else if (lock && req.user.userId !== lock.userId && !req.user.isAdmin) {
                return res.sendfail(new ClientError(409, 'Specified file is locked by'+lock.email));
            } else {
                logger.debug('writeFile check lock - not locked');
                return next();
            }
        });
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var pathStr = Path.join('/', decodeURI(req.params[0]));
        var wfsUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));
        var form;
        var fields = {};
        var uid = req.user && req.user.uid;
        var localPath = WebidaFS.getPathFromUrl(wfsUrl);
        logger.debug('writeFile - processing form', { user : req.user, wfs:wfsUrl});

        if (wfsUrl.indexOf(';') !== -1) {
            return res.sendfail(new ClientError(403, 'You can not use \';\' in the path'));
        }
        form = new formidable.IncomingForm();

        form
            .on('field', function (field, value) {
                logger.debug('writeFile - form processing : field = ', field, 'value = ', value);
                fields[field] = value;
            })
            .on('file', function (name, file) {
                logger.debug('writeFile - form processing : file =',file.filepath);
                if (name !== 'file') {
                    logger.error('Bad upload request form: ', file.path);
                    fsService.unlink(file.path, function (cleanErr) {
                        if (cleanErr) {
                            logger.warn('Write File clean error: ', cleanErr);
                        }
                        res.sendfail(new ClientError(400, 'Bad upload request format'));
                    });
                    return;
                }
                if (file.size >= config.services.fs.uploadPolicy.maxUploadSize) {
                    return res.status(413).send('Uploading file is too large: ' + file.size + ' bytes');
                }

                fsService.exists(localPath, function (exists) {
                    var topicSpecific = exists ? 'file.updated' : 'file.created';
                    writeFile(wfsUrl, file.path, function (err) {
                        fsService.unlink(file.path, function (cleanErr) {
                            if (cleanErr) {
                                logger.warn('Write File clean error: ', cleanErr);
                            }

                            if (err) {
                                logger.error('write file error: ', err);
                                return res.sendfail(err);
                            }
                            logger.debug('sessionID: ', fields.sessionID);
                            fsChangeNotifyTopics(pathStr, 'file.written', uid, fsid, fields.sessionID);
                            fsChangeNotifyTopics(pathStr, topicSpecific, uid, fsid, fields.sessionID);

                            flinkMap.updateFileLink(fsid, localPath, function (err, flinkInfo) {
                                if (!err) {
                                    logger.info('flink updated -- ', flinkInfo);
                                }
                            });
                            return res.send(utils.ok());
                        });
                    });
                });
            })
            .on('fileBegin', function (name, file) {
                logger.debug('fileBegin -' + name + ':' + JSON.stringify(file));
            })
            .on('error', function (err) {
                logger.error('Failed to upload with error:', err);
                return res.status(400).send(utils.fail('Failed to upload with error (' + err + ').'));
            })
            .on('aborted', function () {
                logger.info('Uploading is aborted.');
            })
            .on('end', function () {
                logger.debug('Finished to upload file to tmp dir.');
            });

        //form.uploadDir = process.env.TMP || process.env.TMPDIR || process.env.TEMP || '/tmp' || process.cwd();
        form.hash = false; //'sha1';
        form.keepExtensions = true;
        form.maxFieldSize = config.services.fs.uploadPolicy.maxUploadSize;

        // TODO This is not atomic operation. Consider using fs-ext.flock()
        form.parse(req);
    }
);

/**
 * Delete file
 * Requires WRITE permission.
 *
 * @method RESTful API deleteFile - /webida/api/fs/file/{fsid}/{path}[?recursive={value}]
 * @param {String} fsid - fsid
 * @param {String} path - relative path
 * @param {String} recursive - true / false [default=false]
 */
router['delete']('/webida/api/fs/file/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) {
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = req.params.fsid + path;
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:delete', rsc:'fs:'+rsc}, res, next);
    },
    function (req, res, next) { // check locked file
        var fsid = req.params.fsid;
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        db.lock.getLock({wfsId: fsid, path: path}, function (err, context) {
            var files = context.result();
            logger.info('delete', path, err, files);
            if (err) {
                return res.sendfail(new ServerError(500, 'get locked file check for move failed.'));
            } else if (files.length > 0) {
                return res.sendfail(new ClientError(400, 'Locked file exist.'));
            } else {
                return next(null);
            }
        });
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var uid = req.user && req.user.uid;
        var rootPath = (new WebidaFS(fsid)).getRootPath();
        var filename = Path.normalize(decodeURI(req.params[0]));
        if (filename[0] === '/') {
            filename = filename.replace('/', '');
        }

        var sessionID = req.body.sessionID;
        var notiPath = Path.join('/', filename);
        var recursive = req.body.recursive || 'false';
        if (recursive !== 'true' && recursive !== 'false') {
            return res.sendfail(new ClientError('Invalid value for recursive option(true or false)'));
        }

        var path = Path.resolve(rootPath, filename);
        // check whether the path can acccess to the app's root or not
        var relPath = Path.relative(rootPath, path);
        var outOfPath = relPath.substring(0, 2) === '..';
        if (outOfPath) {
            return res.sendfail(new ClientError(403, 'Need WRITE permission'));
        }

        fsService.stat(path, function (error, stats) {
            if (error) {
                return res.sendfail(new ClientError(404, 'No such file or directory'));
            }

            if (recursive === 'true') {
                flinkMap.removeLinkRecursive(fsid, path, function(/*err*/) {
                    fsService.remove(path, function (error) {
                        if (error) {
                            logger.error('delete recursive error', path, error);
                            return res.sendfail(new ServerError('Failed to delete path'));
                        }

                        fsChangeNotifyTopics(notiPath, 'dir.deleted', uid, fsid, sessionID);

                        res.sendok();
                    });
                });
            } else {
                if (stats.isFile()) {
                    flinkMap.removeFileLink(fsid, path, function (/*err, flinkInfo*/) {
                        fsService.unlink(path, function (error) {
                            if (error) {
                                logger.error('delete file error', path, error);
                                return res.sendfail(new ServerError('Failed to delete path'));
                            }

                            fsChangeNotifyTopics(notiPath, 'file.deleted', uid, fsid, sessionID);

                            res.sendok();
                        });
                    });
                } else if (stats.isDirectory()) {
                    fsService.rmdir(path, function (error) {
                        if (error) {
                            logger.error('delete dir error', path, error);
                            return res.sendfail(new ServerError('Failed to delete path'));
                        }

                        fsChangeNotifyTopics(notiPath, 'dir.deleted', uid, fsid, sessionID);

                        res.sendok();
                    });
                }
            }
        });
    }
);

function mkdir(rsc, callback) {
    fsService.exists(rsc.localPath, function (exists) {
        if (exists) {
            return callback(new Error('Directory already exists'));
        } else {
            return doMkdir(rsc, callback);
        }
    });
    function doMkdir(curRsc, cb) {
        fsService.exists(curRsc.localPath, function (exists) {
            if (exists) {
                return cb();
            }
            doMkdir(curRsc.getParent(), function (err) {
                if (err) { return cb(err); }
                fsService.mkdir(curRsc.localPath, cb);
            });
        });
    }
}

function createDirectory(rsc, recursive, callback) {
    if (!recursive) {
        fsService.exists(rsc.getParent().localPath, function (exists) {
            if (!exists) {
                return callback(new Error('Failed to create directory'));
            } else {
                mkdir(rsc, callback);
            }
        });
    } else {
        mkdir(rsc, callback);
    }
}
exports.createDirectory = createDirectory;

function findFirstExist(wfs, path, callback) {
    fsService.exists(wfs.getFSPath(path), function (exists) {
        if (exists) {
            return callback(null, path);
        } else if (path === '/' || path === '.') {
            return callback(new Error('Failed to find an existing parent directory'));
        } else {
            return findFirstExist(wfs, Path.dirname(path), callback);
        }
    });
}

/**
 * Create directory
 * Need WRITE permission for the parent directory
 *
 * @method RESTful API createDirectory - /webida/api/fs/directory/{fsid}/{path}[?recursive={"true"|"false"}]
 * @param {String} fsid - fsid
 * @param {String} path - relative path
 * @param {String} recursive - true / false [default=false]
 */
router.post('/webida/api/fs/directory/:fsid/*',
    authMgr.ensureLogin,
    multipartMiddleware,
    function (req, res, next) {
        var rsc;
        var wfs;
        var recursive;
        var fsid = req.params.fsid;
        var path = decodeURI(req.params[0]);

        /* normalize path */
        path = path && Path.normalize(path);
        /* ignore empty or root or parent path */
        if (!path || path === '/' || path.substring(0, 3) === '../') {
            return res.sendfail(new ClientError('Failed to create directory: Invalid path'));
        }
        recursive = req.body.recursive || 'false';
        if (recursive !== 'true' && recursive !== 'false') {
            return res.sendfail(new ClientError('Failed to create directory: Invalid recursive option'));
        }
        recursive = (recursive === 'true');

        logger.info('createDirectory', req.user.uid, fsid, path);

        /* start from parent directory */
        path = Path.dirname(path);
        wfs = new WebidaFS(fsid);
        if (!recursive) {
            fsService.exists(wfs.getFSPath(path), function (exists){
                if (!exists) {
                    return res.sendfail(new ClientError(400, 'Failed to created directory: Directory does not exsist'));
                } else {
                    rsc = 'fs:' + Path.join(fsid, path);
                    authMgr.checkAuthorize({uid: req.user.uid, action: 'fs:createDirectory', rsc: rsc}, res, next);
                }
            });
        } else {
            findFirstExist(wfs, path, function (err, result) {
                if (err) {
                    return res.send(new ClientError(400, 'Failed to create directory: Directory does not exist'));
                } else {
                    rsc = 'fs:' + Path.join(fsid, result);
                    authMgr.checkAuthorize({uid: req.user.uid, action: 'fs:createDirectory', rsc: rsc}, res, next);
                }
            });
        }
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var sessionID = req.body.sessionID;
        var path = Path.join('/', decodeURI(req.params[0]));
        fsService.mkdirs((new WebidaFS(fsid)).getFSPath(path), function (err) {
            if (err) {
                return res.sendfail(err, 'Failed to create directory: The operation failed');
            }
            var uid = req.user && req.user.uid;
            fsChangeNotifyTopics(path, 'dir.created', uid, fsid, sessionID);
            return res.sendok();
        });
    }
);

/**
 * copy
 * Need READ permission for the resource.
 * Need WRITE permission for the destination directory.
 *
 * @method RESTful API copy - /webida/api/fs/copy/<fsid>/?src=<src>&dest=<dest>&recursive=[false|true]
 */
router.post('/webida/api/fs/copy/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) { // check src read permission
        var path = req.body.src;
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = req.params.fsid + path;
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:readFile', rsc:'fs:'+rsc}, res, next);
    },
    function (req, res, next) { // check dest write permission
        var fsid = req.params.fsid;
        var path = (new WebidaFS(fsid)).getFSPath(req.body.dest);
        fsService.exists(path, function(exist) {
            path = req.body.dest;
            if (path[0] !== '/') {
                path = Path.join('/', path);
            }
            var rsc = fsid + path;
            if (!exist) {
                rsc = rsc.substring(0, rsc.lastIndexOf('/'));
            }
            authMgr.checkAuthorize({uid:req.user.uid, action:'fs:writeFile', rsc:'fs:'+rsc}, res, next);
        });
    },
    function (req, res) {
        var fsid = req.params.fsid;
        if (req.body.src === undefined || req.body.dest === undefined) {
            return res.sendfail(new ClientError('Invalid src or dest'));
        }
        var srcPath = Path.join('/', req.body.src);
        var srcUrl = 'wfs://' + fsid + srcPath;
        var destUrl = req.body.dest;
        var sessionID = req.body.sessionID;
        var destPath = Path.join('/', destUrl);
        if (!URI(destUrl).protocol()) {
            destUrl = 'wfs://' + fsid + destPath;
        }
        var recursive = req.body.recursive === 'true';

        if (destUrl.indexOf(';') !== -1) {
            return res.sendfail(new ClientError('You can not use \';\' in the path'));
        }

        fsService.copy(srcUrl, destUrl, recursive, function (err) {
            if (err) {
                return res.sendfail(err, 'Copy failed');
            }

            //noti
            var uid = req.user && req.user.uid;
            fsCopyNotifyTopics(srcPath, 'filedir.copied', uid, fsid, srcPath, destPath, sessionID);

            // for sec
            var srcLocalPath = WebidaFS.getPathFromUrl(srcUrl);
            var destLocalPath = WebidaFS.getPathFromUrl(destUrl);
            fsService.stat(srcLocalPath, function (error, stat) {
                if (error) {
                    logger.error('sec cp err - ', error);
                    res.sendok();
                } else {
                    if (stat.isDirectory()) {
                        flinkMap.updateLinkWhenDirCopy(fsid, srcLocalPath, destLocalPath, function (/*err*/) {
                            res.sendok();
                        });
                    } else {
                        flinkMap.copyFileLink(fsid, destLocalPath, function (/*err, flinkInfo*/) {
                            res.sendok();
                        });
                    }
                }
            });
        });
    }
);

/**
 * rename & move
 * Need WRITE permission for the resource.
 * Need WRITE permission for the destination directory.
 * TODO acl
 *
 * @method RESTful API rename - /webida/api/fs/rename/{fsid}/?oldpath={oldpath}&newpath={newpath}
 */
router.post('/webida/api/fs/rename/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) { // check src write permission
        var path = req.body.oldpath;
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:writeFile', rsc:rsc}, res, next);
    },
    function (req, res, next) { // check dest write permission
        var path = req.body.newpath;
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + Path.dirname(req.params.fsid + path);
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:writeFile', rsc:rsc}, res, next);
    },
    function (req, res, next) { // check locked file
        var fsid = req.params.fsid;
        var path = req.body.oldpath;
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        db.lock.getLock({wfsId: fsid, path: path}, function (err, context) {
            var files = context.result();
            logger.info('move', path, files);
            if (err) {
                return res.sendfail(new ServerError(500, 'get locked file check for move failed.'));
            } else if (files.length > 0) {
                return res.sendfail(new ClientError(400, 'Locked file exist.'));
            } else {
                return next(null);
            }
        });
    },
    function (req, res) {
        var fsid = req.params.fsid;
        if (req.body.oldpath === undefined || req.body.newpath === undefined) {
            // TOFIX change param names(oldpath,newpath) to (src,dest)
            return res.sendfail(new ClientError('Invalid oldpath or newpath'));
        }
        var destUrl = req.body.newpath;
        var sessionID = req.body.sessionID;

        var srcPath = Path.join('/', req.body.oldpath);
        var destPath = Path.join('/', destUrl);

        var srcUrl = 'wfs://' + fsid + srcPath;
        if (!URI(destUrl).protocol()) {
            destUrl = 'wfs://' + fsid + destPath;
        }

        if (destUrl.indexOf(';') !== -1) {
            return res.sendfail(new ClientError('You can not use \';\' in the path'));
        }
        // for sec
        var srcLocalPath = WebidaFS.getPathFromUrl(srcUrl);
        var destLocalPath = WebidaFS.getPathFromUrl(destUrl);
        fsService.stat(srcLocalPath, function (error, stat) {
            if (error) {
                logger.error(error);
                return res.sendfail(new ServerError('stat failure: ' + error.code));
            }
            if (stat.isDirectory()) {
                flinkMap.getFileList(srcLocalPath, function (err, oldFileList) {
                    fsService.move(srcUrl, destUrl, function (err) {
                        if (err) {
                            return res.sendfail(err, 'Move failed');
                        }

                        //noti
                        var uid = req.user && req.user.uid;
                        fsCopyNotifyTopics(srcPath, 'filedir.moved', uid, fsid, srcPath, destPath, sessionID);

                        flinkMap.updateLinkWhenDirMove(fsid, oldFileList, destLocalPath, function (/*err*/) {
                            //res.sendok();
                            authMgr.updatePolicyResource('fs:' + fsid + srcPath,
                                'fs:' + fsid + destPath,
                                req.user.token,
                                function(err) {
                                    if (err) {
                                        return res.sendfail(err, 'updatePolicyResource Failed.');
                                    }
                                    return res.sendok();
                                });
                        });
                    });
                });
            } else {
                fsService.move(srcUrl, destUrl, function (err) {
                    if (err) {
                        return res.sendfail(err, 'Move failed');
                    }

                    //noti
                    var uid = req.user && req.user.uid;
                    fsCopyNotifyTopics(srcPath, 'filedir.moved', uid, fsid, srcPath, destPath, sessionID);

                    flinkMap.updateFileLink(fsid, destLocalPath, function (/*err, flinkInfo*/) {
                        authMgr.updatePolicyResource('fs:' + fsid + srcPath,
                            'fs:' + fsid + destPath,
                            req.user.token,
                            function(err) {
                                if (err) {
                                    return res.sendfail(err, 'updatePolicyResource Failed.');
                                }
                                return res.sendok();
                            });
                    });
                });
            }
        });
    }
);

/**
 * Search keyword in files
 * Need Owner permission
 *
 * @method RESTful API search
 *      e.g. /webida/api/fs/search/{fsid}/{keyword}
 *          [?where={path}&ignorecase={value}&wholeword={value}&includefile={pattern}&excludedir={pattenr}]
 * @param {String} fsid - fsid
 * @param {String} keyword - search pattern
 * @param {String} where - direcotry or file's path [default='/']
 * @param {String} ignorecase - 'true' / 'false' [default='false']
 * @param {String} wholeword - 'true' / 'false' [default='false']
 * @param {String} excludedir - exclude directory pattern. If not specified, include all dirs.
 *                              This is applied before 'includefile' pattern.
 * @param {String} includefile - include file/dir regex pattern. If not specified, include all files and dirs.
 */
router.get('/webida/api/fs/search/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) {
        var path = req.query.where;
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:search', rsc:rsc}, res, next);
    },
    function (req, res) {
        // TODO ACL
        var fsid = req.params.fsid;

        var modifier = '';
        var regFile = null;
        var regExcludeDir = null;

        // keyword argument
        var keyword = req.params[0] ? decodeURI(req.params[0]) : null;
        if (!keyword || keyword.length === 0) {
            return res.sendfail(new ClientError('Invalid argument: keyword should be specified and cannot be empty'));
        }

        // ignorecase variable
        if (req.query.ignorecase && req.query.ignorecase !== 'true' && req.query.ignorecase !== 'false') {
            return res.sendfail(new ClientError('Invalid parameter: ignorecase allows only "true" or "false"'));
        }
        var ignorecase = req.query.ignorecase === 'true';
        if (ignorecase) {
            modifier += 'i';
        }

        //wholeword variable is true
        if (req.query.wholeword && req.query.wholeword !== 'true' && req.query.wholeword !== 'false') {
            return res.sendfail(new ClientError('Invalid parameter: ignorecase allows only "true" or "false"'));
        }
        var wholeword = req.query.wholeword === 'true';
        if (wholeword) {
            keyword = '(\\b)' + keyword + '(\\b)';
        }

        if (req.query.excludedir) {
            regExcludeDir = new RegExp(req.query.excludedir);
        }

        if (req.query.includefile) {
            regFile = new RegExp(req.query.includefile);
        }

        var where = req.query.where || '/';
        var targetRsc = new Resource('wfs://' + fsid + Path.join('/', where));

        var regKeyword = new RegExp(keyword, modifier);

        logger.info('search', targetRsc, req.query, regKeyword, regExcludeDir, regFile);

        fsService.search(targetRsc, regKeyword, regExcludeDir, regFile, function (err, result) {
            if (err) {
                return res.sendfail(err, 'Search failed');
            }
            return res.sendok(result);
        });
    }
);

/**
 * Replace keyword with replacement pattern in multi files
 * Need Owner permission
 * TODO acl
 *
 * @method RESTful API replace
 *
 * @param {String} fsid - fsid
 * @param {String} pattern - search pattern
 * @param {String} replacePattern - replace pattern
 * @param {String[]} where - direcotry or file's path list
 * @param {String} ignorecase - 'true' / 'false' [default='false']
 * @param {String} wholeword - 'true' / 'false' [default='false']
 */
router.post('/webida/api/fs/replace/:fsid',
    authMgr.ensureLogin,
    function (req, res) {
        // TODO ACL
        var fsid = req.params.fsid;
        var pattern = req.body.pattern;
        var replacePattern = req.body.replacePattern;
        var wholePattern;
        var filePaths = req.body.where.split(',').map(decodeURIComponent);
        var ignoreCase = req.body.ignorecase;
        var wholeWord = req.body.wholeword;
        var rootPath = (new WebidaFS(fsid)).getRootPath();
        var targetPaths = filePaths.map(function (filePath) {
            if (filePath[0] === '/') {
                filePath = filePath.substr(1);
            }
            return filePath;
        });

        // pattern argument
        if (!pattern || pattern.length === 0) {
            return res.sendfail(new ClientError('Invalid argument: pattern should be specified and cannot be empty'));
        }

        // ignorecase variable
        if (ignoreCase && ignoreCase !== 'true' && ignoreCase !== 'false') {
            return res.sendfail(new ClientError('Invalid parameter: ignorecase allows only "true" or "false"'));
        }
        ignoreCase = (ignoreCase === 'true');

        //wholeword variable is true
        if (wholeWord && wholeWord !== 'true' && wholeWord !== 'false') {
            return res.sendfail(new ClientError('Invalid parameter: wholeword allows only "true" or "false"'));
        }
        wholeWord = (wholeWord === 'true');

        logger.info('replace', pattern, replacePattern, targetPaths, ignoreCase, wholeWord);

        // for using in `sed` command '(' => '\\(', ')' => '\\)'
        pattern = pattern.replace(/([^\\]?)\(/g, '$1\\(').replace(/([^\\]?)\)/g, '$1\\)');
        if (wholeWord) {
            pattern = ('\\b' + pattern + '\\b');
        }
        // for using in `sed` command '$&' => '&', '$1' => '\\1'
        replacePattern = replacePattern.replace('$&', '&').replace(/\$([0-9]+)/g, '\\$1');
        wholePattern = 's/' + pattern + '/' + replacePattern + '/g' + (ignoreCase ? 'i' : '');

        fsService.replace(rootPath, targetPaths, wholePattern, function (err) {
            if (err) {
                return res.sendfail(err, 'Replace failed');
            }
            return res.sendok();
        });
    }
);

/**
 * Create / Export / Extract a archive file (zip)
 * Need Owner permission
 * TODO acl
 *
 * @method RESTful API search -
 *         /webida/api/fs/archive/{fsid}/?source='list1;list2;list3'&target='archive.zip'&mode=[create|extract|export]
 * @param {String} fsid - fsid
 * @param {Array} Create and Export mode: the list of source(multiple), Extract mode: the source file(single)
 * @param {String} target
 * @param {String} mode - create / extract / export
 */
router.get('/webida/api/fs/archive/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) { // check srclist read permission
        var aclInfo = {uid: req.user.uid, action: 'fs:archive', rsc: req.query.source, fsid: req.params.fsid};
        authMgr.checkAuthorize(aclInfo, res, next);
    },
    function (req, res, next) { // check dest write permission
        if (req.query.mode === 'export') {
            return next();
        }

        var path = req.query.target;
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid: req.user.uid, action: 'fs:archive', rsc: rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var rootPath = (new WebidaFS(fsid)).getRootPath();
        var source = req.query.source;
        var target = decodeURI(req.query.target);
        var mode = req.query.mode;

        source = source.split(';');
        var absolutePath = _.map(source, function (file) {
            if (file[0] === '/') {
                file = file.substr(1);
            }
            return Path.resolve(rootPath, file);
        });
        var absoluteTarget;

        if (mode === 'export') {
            // first generate export temp file name
            tmp.tmpName({template: '/tmp/tmp-XXXXXX'}, function _tempNameGenerated(err, path) {
                if (err) {
                    logger.error('Temp zip file name generate fail: ' + err);
                    return res.sendfail(new ServerError('Failed to generate temp zip file name'), 'Archive failed');
                }
                absoluteTarget = path + '.zip';

                // create zip file
                fsService.zip(absolutePath, absoluteTarget, function (err) {
                    if (err) {
                        logger.error('Zip file creation fail: ' + err);
                        return res.sendfail(err, 'Failed to create zip file');
                    }

                    // let browser download zip file
                    res.download(absoluteTarget, target, function (err) {
                        if (err) {
                            logger.error('Export download fail: ' + err);
                        }

                        // remove temp zip file
                        fsService.remove(absoluteTarget, function (err) {
                            if (err) {
                                logger.error('Temp result file remove fail: ' + err);
                            }
                        });
                    });
                });
            });
        } else if (mode === 'create') {
            if (target.indexOf(';') !== -1) {
                return res.sendfail(new ClientError('You can not use \';\' in the path'));
            }

            // create default zip file name.
            if (target === undefined) {
                // if the target path is undefined, default target path is archive.zip
                target = 'archive.zip';
            } else {
                if (target[0] === '/') {
                    target = target.substr(1);
                }
            }
            absoluteTarget = Path.resolve(rootPath, target);

            // create zip file
            fsService.zip(absolutePath, absoluteTarget, function (err) {
                if (err) {
                    logger.error('Zip file creation fail. ' + err);
                    return res.sendfail(err, 'Zip file creation fail');
                }
                res.sendok();
            });
        } else if (mode === 'extract') {
            if (target.indexOf(';') !== -1) {
                return res.sendfail(new ClientError('You can not use \';\' in the path'));
            }

            fsService.unzip(absolutePath, target, rootPath, function (err) {
                if (err) {
                    logger.error('Extract zip fail. ' + err);
                    return res.sendfail(err, 'Extract zip failed');
                }
                res.sendok();
            });
        } else {
            return res.sendfail(new ClientError('Invalid mode'));
        }
    }
);

/**
 * Test whether or not the given path exists.
 * Requires READ permission.
 *
 * @method RESTful API exists - /webida/api/fs/exists/{fsid}/{path}
 * @param {String} fsid - fsid
 * @param {String} path - file path
 */
router.get('/webida/api/fs/exists/:fsid/*',
    authMgr.getUserInfo,
    function (req, res, next) {
        var uid = req.user ? req.user.uid : 0;
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = req.params.fsid + path;
        authMgr.checkAuthorize({uid:uid, action:'fs:readFile', rsc:'fs:'+rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var pathUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));

        fsService.exists(new Resource(pathUrl).localPath, function (exist) {
            return res.sendok(exist);
        });
    }
);

/**
 * Get ACL for the given path
 * Requires READ permission.
 *
 * @method RESTful API getAcl - /webida/api/fs/acl/{fsid}/{path}
 * @param {String} fsid - fsid
 * @param {String} path - file path
 * @deprecated
 * TODO remove
 */
router.get('/webida/api/fs/acl/:fsid/*', authMgr.ensureLogin, function (req, res) {
    return res.sendok({});
});

/**
 * Set ACL for the given path
 * Requires WRITE permission.
 *
 * @method RESTful API setAcl - /webida/api/fs/acl/{fsid}/{path}?acl={acl}
 * @param {String} fsid - fsid
 * @param {String} path - file path
 * @param {String} acl - stringified acl object. eg. {"usrename1":"r","username2":"w","usrename3":"rw"}
 * @deprecated
 * TODO remove
 */
router.post('/webida/api/fs/acl/:fsid/*', authMgr.ensureLogin, function (req, res) {
    return res.sendok();
});

/**
 * Get metadata for the given path
 * Requires READ permission.
 *
 * @method RESTful API getMeta - /webida/api/fs/meta/{fsid}/{path}?name=<metaName>
 * @param {String} fsid - fsid
 * @param {String} path - file path
 * @param {String} name - name of the metadata
 * @deprecated
 * TODO remove
 */
router.get('/webida/api/fs/meta/:fsid/*',
    authMgr.getUserInfo,
    function (req, res, next) {
        var uid = req.user ? req.user.uid : 0;
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:uid, action:'fs:getMeta', rsc:rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var metaName = req.query.name;
        var pathUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));
        getMeta(pathUrl, metaName, function (err, val) {
            if (err) {
                return res.sendfail(err, 'Failed to get metadata');
            }
            return res.sendok(val);
        });
    }
);

/**
 * Set Meta for the given path
 * Requires WRITE permission.
 *
 * @method RESTful API setMeta - /webida/api/fs/meta/{fsid}/{path}?name={metaName}&data={data}
 * @param {String} fsid - fsid
 * @param {String} path - file path
 * @param {String} metaName - name of metadata
 * @param {String} data - stringified metadata object
 * @deprecated
 * // TODO remove
 */
router.post('/webida/api/fs/meta/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) {
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:setMeta', rsc:rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var wfsUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));
        var metaName = req.body.name;
        var newMeta = req.body.data;
        setMeta(wfsUrl, metaName, newMeta, function (err) {
            if (err) {
                return res.sendfail(err, 'Failed to set metadata');
            }
            return res.sendok();
        });
    }
);

/**
 * Serve temporary public alias
 *
 * /webida/alias/<alisKey>/<path>
 */
router.get(config.services.fs.fsAliasUrlPrefix + '/*', function (req, res) {
    var patt = /([^/]+)(.*)?/;
    var result = patt.exec(req.params[0]);
    if (!result || !result[1]) {
        return res.sendErrorPage(400, 'Invalid access');
    }
    var aliasKey = result[1];
    var subPath = result[2] || '';
    logger.info('Alias', req.params[0], aliasKey, subPath);
    fsAlias.getAliasInfo(aliasKey, function (err, aliasInfo) {
        if (err) {
            return res.sendErrorPage(500, 'Failed to get \'' + aliasKey + '\' alias info.');
        }
        if (!aliasInfo) {
            return res.sendErrorPage(404, 'Cannot find \'' + aliasKey + '\' alias. It may be expired.');
        }
        var wfsUrl = 'wfs://' + aliasInfo.wfsId + '/' + aliasInfo.path + '/' + subPath;
        logger.info('Serve alias', wfsUrl);
        serveFile(req, res, wfsUrl, true);
    });
});

/**
 * Add temporary public alias for a path
 * Need FS owner permission.
 *
 * @method RESTful API addAlias
 * @param {fsid} - fsid
 * @param {path} - resource path
 * @param {expireTime} - alias expire time in seconds
 * @return {aliasInfo} - aliasInfo
 aliasInfo
 {
     key: aliasKey,
     owner: owner,
     fsid: fsid,
     path: path,
     expireTime: expireTime,
     expireDate: expireDate,
     url: url
 }
 */
router.post('/webida/api/fs/alias/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) {
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:addAlias', rsc:rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var path = Path.join('/', decodeURI(req.params[0]));
        var expireTime = req.body.expireTime;
        var user = req.user;

        if (!expireTime) {
            return res.sendfail(new ClientError('Invalid parameters: expireTime should be specified'));
        }

        function doAddAlias() {
            fsAlias.addAlias(user.userId, fsid, path, expireTime, function (err, aliasInfo) {
                if (err) {
                    return res.sendfail(err, 'Failed to add alias');
                }
                res.sendok(aliasInfo);
            });
        }
        // check FS owner
        var fs = new WebidaFS(fsid);
        fs.getOwner(function (err, ownerId) {
            if (err) {
                return res.sendfail(err, 'Failed to delete filesystem');
            }
            if (ownerId !== user.userId) {
                return res.sendfail(new ClientError('Unauthorized Access: FS owner can make alias'));
            }
            doAddAlias();
        });
    }
);

/**
 * Delete alias
 * Need FS owner permission.
 *
 * @method RESTful API deleteAlias
 * @param {aliasKey} - aliasKey
 */
router['delete']('/webida/api/fs/alias/:aliasKey',
    authMgr.ensureLogin,
    function (req, res, next) {
        var aliasKey = decodeURI(req.params.aliasKey);
        if (!aliasKey) {
            return res.sendfail(new ClientError('Invalid parameter: aliasKey should be specified'));
        }
        fsAlias.getAliasInfo(aliasKey, function (err, aliasInfo) {
            if (err) {
                return res.sendfail(err, 'Failed to delete alias');
            }
            var rsc = 'fs:' + aliasInfo.wfsId + aliasInfo.path;
            authMgr.checkAuthorize({uid: req.user.uid, action: 'fs:deleteAlias', rsc: rsc}, res, next);
        });
    },
    function (req, res) {
        var aliasKey = decodeURI(req.params.aliasKey);
        if (!aliasKey) {
            return res.sendfail(new ClientError('Invalid parameter: aliasKey should be specified'));
        }
        fsAlias.getAliasInfo(aliasKey, function (err, aliasInfo) {
            if (err) {
                return res.sendfail(err, 'Failed to delete alias');
            }
            if (aliasInfo.ownerId !== req.user.userId) {
                return res.sendfail(new ClientError('Need FS owner permission'));
            }
            fsAlias.deleteAlias(aliasKey, function (err) {
                if (err) {
                    return res.sendfail(err, 'Failed to delete alias');
                }
                res.sendok();
            });
        });
    }
);

/**
 * Get alias info
 * Need FS owner permission.
 *
 * @method RESTful API getAliasInfo
 * @param {aliasKey} - aliasKey
 * @return {aliasInfo} - aliasInfo object if found. error if not found.
 aliasInfo
 {
     key: aliasKey,
     owner: owner,
     fsid: fsid,
     path: path,
     expireTime: expireTime,
     expireDate: expireDate,
     url: url
 }
 */
router.get('/webida/api/fs/alias/:aliasKey',
    authMgr.ensureLogin,
    function (req, res, next) {
        var aliasKey = decodeURI(req.params.aliasKey);
        if (!aliasKey) {
            return res.sendfail(new ClientError('Invalid parameter: aliasKey should be specified'));
        }
        fsAlias.getAliasInfo(aliasKey, function (err, aliasInfo) {
            if (err) {
                return res.sendfail(err, 'Failed to get alias info');
            }
            if (!aliasInfo) {
                return res.sendfail(new ClientError('Cannot find alias info'));
            }

            var rsc = 'fs:' + aliasInfo.wfsId + aliasInfo.path;
            authMgr.checkAuthorize({uid:req.user.uid, action:'fs:getAliasInfo', rsc:rsc}, res, next);
        });
    },
    function (req, res) {
        var aliasKey = decodeURI(req.params.aliasKey);
        if (!aliasKey) {
            return res.sendfail(new ClientError('Invalid parameter: aliasKey should be specified'));
        }
        fsAlias.getAliasInfo(aliasKey, function (err, aliasInfo) {
            if (err) {
                return res.sendfail(err, 'Failed to get alias info');
            }
            if (!aliasInfo) {
                return res.sendfail(new ClientError('Cannot find alias info'));
            }
            if (aliasInfo.ownerId !== req.user.userId) {
                return res.sendfail(new ClientError('Need FS owner permission'));
            }
            res.sendok(aliasInfo);
        });
    }
);

/**
 * Get fs usage
 * Need FS owner permission.
 *
 * @method RESTful API getQuotaUsage
 * @param {fsid} - fsid
 * @return {string} - usage in bytes
 */
router.get('/webida/api/fs/usage/:fsid',
    authMgr.ensureLogin,
    function (req, res, next) {
        var rsc = 'fs:' + req.params.fsid + '/*';
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:getQuotaUsage', rsc:rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var userId = req.user.userId;

        // check FS owner
        var fs = new WebidaFS(fsid);
        fs.getOwner(function (err, ownerId) {
            if (err) {
                return res.sendfail(err, 'Failed to get filesystem info:');
            }
            if (ownerId !== userId) {
                logger.info('usage failed: ', ownerId, userId);
                return res.sendfail(new ClientError('Need FS owner permission'));
            }
            linuxfs.getQuotaUsage(fsid, function (err, usage) {
                logger.info('usage', fsid, arguments);
                if (err) {
                    return res.sendfail(err, 'Failed to get fs uage');
                }
                return res.sendok(usage);
            });
        });
    }
);

/**
 * Get fs quota limit
 * Need FS owner permission.
 *
 * @method RESTful API getQuotaLimit
 * @param {fsid} - fsid
 * @return {string} - quota limit in bytes
 */
router.get('/webida/api/fs/limit/:fsid',
    authMgr.ensureLogin,
    function (req, res, next) {
        var rsc = 'fs:' + req.params.fsid + '/*';
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:getQuotaLimit', rsc:rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var userId = req.user.userId;

        // check FS owner
        var fs = new WebidaFS(fsid);
        fs.getOwner(function (err, ownerId) {
            if (err) {
                return res.sendfail(err, 'Failed to get filesystem info');
            }
            if (ownerId !== userId) {
                return res.sendfail(new ClientError('Need FS owner permission'));
            }
            linuxfs.getQuotaLimit(fsid, function (err, limit) {
                logger.info('limit', fsid, arguments);
                if (err) { return res.sendfail(err, 'Failed to get fs quota limit'); }
                res.sendok(limit);
            });
        });
    }
);

function addKsInfoDb(ownerId, fsid, alias, keypwd, keystorepwd, filename, cb) {
    var ksInfo = {
        wfsId: fsid,
        userId: parseInt(ownerId),
        alias: alias,
        keyPassword: keypwd,
        keyStorePassword: keystorepwd,
        fileName: filename
    };

    db.ks.$save(ksInfo, function (err) {
        if (err) {
            logger.error('failed to insert keystore into database', ksInfo, err);
            return cb(new ServerError('failed to insert user key into database:' + err.toString()));
        }
        cb(null, ksInfo);
    });
}

function removeKsInfoDb(ownerId, fsid, alias, filename, cb) {
    var ksInfo = {
        key: fsid,
        userId: parseInt(ownerId),
        alias: alias,
        fileName: filename
    };

    db.ks.$remove(ksInfo, function (err) {
        if (err) {
            logger.error('failed to remove keystore from database', ksInfo, err);
            return cb(new ServerError('failed to remove keystore from database:' + err.toString()));
        }
        cb(null, ksInfo);
    });
}

function checkExistKs(ownerId, fsid, alias, filename, cb) {
    var query = { key: fsid, userId: ownerId, alias: alias, fileName: filename } ;
    db.ks.$count(query, function(err, context) {
        var count = context.result();
        logger.info('count =', count);
        if (count > 0) {
            return cb(true);
        } else {
            return cb(false);
        }
    });
}

function checkExistFile(wfsUrl, cb) {
    var rsc = new Resource(wfsUrl);
    fsService.exists(rsc.localPath, function (exists) {
        cb(exists);
    });
}

function getKsList(userId, fsid, cb) {
    var query = { key: fsid, userId: userId } ;
    db.ks.$find(query, function(err, context) {
        var rs = context.result();
        logger.info('kslist =', rs);
        return cb(err, rs);
    });
}

var verifyKsReq = function (userId, fsid, jsKsInfo, filename, cb) {
    var keyInfo = JSON.parse(jsKsInfo);
    if (!keyInfo) {
        return cb(new ClientError('invalid key info'));
    }
    var alias = keyInfo.alias;
    if (!alias) {
        return cb(new ClientError('The alias for keystore file does not exist'));
    }
    checkExistKs(userId, fsid, alias, filename, function (isExist) {
        return (isExist) ? cb(new ClientError('The same keystore file is already exist')) : cb(null);
    });
};

function writeKsFile(req, res, cb) {
    var fsid = req.params.fsid;
    var keystorePath = '.keystore';
    var tmpFileName = req.params[0];
    var pathStr = fsid + Path.join('/', keystorePath, tmpFileName);
    var wfsDir = 'wfs://' + Path.dirname(pathStr);

    logger.info('dir path = ', wfsDir);
    logger.info('file path = ', pathStr);

    var wfsUrl = 'wfs://' + pathStr;
    checkExistFile(wfsUrl, function (exists) {
        if (exists) {
            return cb(new ClientError('file already exists'));
        }

        logger.info('writeFile', req.user, wfsUrl);

        if (wfsUrl.indexOf(';') !== -1) {
            return cb(new ClientError(403, 'You can not use \';\' in the path'));
        }

        var rscDir = new Resource(wfsDir);
        createDirectory(rscDir, true, function (err) {
            if (err) {
                logger.error('failed to create dir', err);
            }
            // TODO This is not atomic operation. Consider using fs-ext.flock()
            var isAborted = false;

            var form = new formidable.IncomingForm();
            var files = [];
            var fields = [];

            form
                .on('field', function(field, value) {
                    logger.debug('field = ', field, 'value = ',  value);
                    fields.push([field, value]);
                })
                .on('file', function(name, file) {
                    if (name !== 'file') {
                        var errMsg = 'Bad upload request format';
                        logger.error(errMsg + ':' + file.path);
                        res.header('Connection', 'close');
                        isAborted = true;
                        return cb(new ClientError(413, errMsg));
                    }
                    files.push([name, file]);
                })
                .on('fileBegin', function(name, file) {
                    logger.info('fileBegin -' + name + ':' + JSON.stringify(file));
                })
                .on('progress', function(bytesReceived, bytesExpected) {
                    // limits file size up to 100mb
                    if (bytesExpected >= config.services.fs.uploadPolicy.maxUploadSize) {
                        res.header('Connection', 'close');
                        var errMsg = 'Uploading file is too large.';
                        logger.error(errMsg);
                        return cb(new ClientError(413, errMsg));
                    }
                    logger.info('progress:' + bytesReceived + '/' + bytesExpected);
                })
                .on('error', function(err) {
                    var errMsg = 'Failed to upload with error (' +  err + ').';
                    logger.error(errMsg);
                    res.header('Connection', 'close');
                    if (err) {
                        return cb(new ClientError(400, errMsg));
                    }
                })
                .on('aborted', function() {
                    logger.info('Uploading is aborted.');
                })
                .on('end', function() {
                    logger.debug('Finished to upload file to tmp directory.');
                });

            form.hash = false;
            form.keepExtensions = true;

            form.parse(req, function(err, fields, files) {
                logger.info('parse files - ' + JSON.stringify(files));
                logger.info('parse fields - ' + JSON.stringify(fields));
                if (err) {
                    return cb(err, 'Failed to write file');
                }
                if (isAborted) {
                    logger.error('Request is aborted, delete temporary file: ', files.file.path);
                    fsService.unlink(files.file.path, function (cleanErr) {
                        if (cleanErr) {
                            logger.warn('Write File clean error: ', cleanErr);
                        }
                    });
                } else {
                    if (fields.length === 0) {
                        fsService.unlink(files.file.path, function (cleanErr) {
                            if (cleanErr) {
                                logger.warn('Write File clean error: ', cleanErr);
                            }
                            return cb(new ClientError('Additional fields does not exist'));
                        });
                    } else {
                        verifyKsReq(req.user.userId, fsid, fields.keyInfo, files.file.name, function(err) {
                            if (err) {
                                fsService.unlink(files.file.path, function (cleanErr) {
                                    if (cleanErr) {
                                        logger.warn('Write File clean error: ', cleanErr);
                                    }
                                    return cb(err);
                                });
                            } else {
                                writeFile(wfsUrl, files.file.path, function (err) {
                                    fsService.unlink(files.file.path, function (cleanErr) {
                                        if (cleanErr) {
                                            logger.warn('Write File clean error: ', cleanErr);
                                        }

                                        if (err) {
                                            return cb(err, 'Failed to write file');
                                        }
                                        return cb(null, null, files.file, fields);
                                    });
                                });
                            }
                        });
                    }
                }
            });
        });
    });
}


/**
 * Register keystore file
 *
 * @method RESTful API registerKeyStoreFile
 * @param {fsid} - fsid
 * @return {string} - succss or failure
 */
router.post('/webida/api/fs/mobile/ks/:fsid/*', authMgr.ensureLogin, function (req, res) {
    var fsid = req.params.fsid;

    writeKsFile(req, res, function (err, reason, file, fields) {
        if (err) {
            logger.error(err, reason);
            return res.sendfail(err, reason);
        } else {
            if (!fields) {
                return res.sendfail(new ClientError('key info does not exist'));
            }
            var keyInfo = JSON.parse(fields.keyInfo);
            logger.info('keyInfo = ', keyInfo);
            if (keyInfo.keypwd.length > 64 || keyInfo.keystorepwd.length > 64) {
                return res.sendfail(new ClientError('password length is too long.'));
            }
            addKsInfoDb(req.user.userId, fsid, keyInfo.alias, keyInfo.keypwd, keyInfo.keystorepwd, file.name,
                function (err, ksInfo) {
                    if (err) {
                        //TODO: remove uploaded files
                        res.sendfail(err);
                    } else {
                        res.sendok(ksInfo);
                    }
                });
        }
    });
});

function deleteKsFile(uid, fsid, filename, cb) {
    var rootPath = (new WebidaFS(fsid)).getRootPath();
    var filePath = '.keystore/' + filename;

    var path = Path.resolve(rootPath, filePath);
    // check whether the path can acccess to the app's root or not
    var relPath = Path.relative(rootPath, path);
    var outOfPath = relPath.substring(0, 2) === '..';
    if (outOfPath) {
        return cb(new ClientError(403, 'Need WRITE permission'));
    }

    fsService.stat(path, function (error, stats) {
        if (error) {
            return cb(new ClientError(404, 'No such file or directory'));
        }

        if (stats.isFile()) {
            fsService.unlink(path, function (error) {
                if (error) {
                    logger.error('delete file error', path, error);
                    return cb(new ServerError('Failed to delete path'));
                }
                return cb(null);
            });
        } else {
            return cb(new ServerError('No such file exist'));
        }
    });
}

/**
 * Delete keystore file
 *
 * @method RESTful API registerKeyStoreFile
 * @param {fsid} - fsid
 * @return {string} - succss or failure
 */
router.delete('/webida/api/fs/mobile/ks/:fsid', authMgr.ensureLogin, function (req, res) {
    var fsid = req.params.fsid;
    var uid = req.user && req.user.uid;
    var alias = req.body.alias;
    var filename = req.body.filename;

    logger.info('alias = ', alias);
    logger.info('filename = ', filename);

    checkExistKs(req.user.userId, fsid, alias, filename, function(isExist) {
        if (isExist) {
            deleteKsFile(uid, fsid, filename, function (err) {
                if (err) {
                    return res.sendfail(err);
                }
                removeKsInfoDb(req.user.userId, fsid, alias, filename, function (err, ksInfo) {
                    if (err) {
                        res.sendfail(err);
                    } else {
                        res.sendok(ksInfo);
                    }
                });
            });
        } else {
            return res.sendfail(new ClientError('No such file exist'));
        }
    });
});

/**
 * Get keystore info list
 *
 * @method RESTful API getKeystore info
 * @param {fsid} - fsid
 * @return {string} - keystore info
 */
router.get('/webida/api/fs/mobile/ks/:fsid', authMgr.ensureLogin, function (req, res) {
    var fsid = req.params.fsid;

    getKsList(req.user.userId, fsid, function (err, ksList) {
        if (err) {
            return res.sendfail(new ServerError('Can not get keystore informations'));
        }
        return res.sendok(ksList);
    });
});

router.get('/webida/api/fs/lockfile/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) {
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:writeFile', rsc:rsc}, res, next);
    },
    function(req, res) {
        var userId = req.user.userId;
        var email = req.user.email;
        var fsid = req.params.fsid;
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }

        db.lock.$findOne({wfsId:fsid, path:path}, function(err, context) {
            var lock = context.result();
            if(err){
                return res.sendfail(new ServerError(500, 'lockFile failed.'));
            } else if(lock) {
                var errMsg = 'Already locked by ' + JSON.stringify(lock);
                return res.sendfail(new ClientError(400, errMsg));
            } else {
                db.lock.$save({lockId: shortid.generate(), userId:userId, email:email, wfsId:fsid, path:path},
                    function(err) {
                        if(err){
                            return res.sendfail(new ServerError(500, 'lockFile failed.'));
                        } else {
                            db.user.$findOne({userId: userId}, function(err, context){
                                var user = context.result();
                                if(err){
                                    return res.sendfail(new ServerError(500, 'lockFile failed.'));
                                } else if(user) {
                                    fsChangeNotifyTopics(path, 'fs.lock', user.uid, req.params.fsid, req.query.sessionID);
                                    return res.sendok();
                                } else {
                                    return res.sendok();
                                }
                            });
                        }
                    });
            }
        });
    }
);

router.get('/webida/api/fs/unlockfile/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) {
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:unlockFile', rsc:rsc}, res, next);
    },
    function(req, res) {
        var fsid = req.params.fsid;
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        db.lock.$findOne({wfsId: fsid, path: path}, function(err, context) {
            var lock = context.result();
            logger.info('unlockfile check lock', err, lock);
            if (err) {
                return res.sendfail(new ServerError(500, 'unlockFile failed.'));
            } else if (lock) {
                db.lock.$remove({wfsId: fsid, path: path}, function(err) {
                    if (err) {
                        return res.sendfail(new ServerError(500, 'unlockFile failed.'));
                    }

                    db.user.$findOne({userId: lock.userId}, function(err, context){
                        var user = context.result();
                        if(err){
                            return res.sendfail(new ServerError(500, 'unlockFile failed.'));
                        } else if(user) {
                            fsChangeNotifyTopics(path, 'fs.unlock', user.uid, req.params.fsid, req.query.sessionID);
                            return res.sendok();
                        } else {
                            return res.sendok();
                        }
                    });
                });
            } else {
                return res.sendok('File is not locked.');
            }
        });
    }
);

router.get('/webida/api/fs/getlockedfiles/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) {
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid: req.user.uid, action: 'fs:readFile', rsc: rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        //path = new RegExp(path);
        db.lock.getLock({wfsId: fsid, path: path}, function(err, context) {
            var files = context.result();
            logger.info('getLockedFiles', path, files);
            if (err) {
                res.sendfail(new ServerError(500, 'getLockedFiles failed.'));
            } else {
                res.sendok(files);
            }
        });
    }
);

/**
 * update file link
 *
 * @method RESTful API update file link map
 * @param {fsid} - fsid
 * @param {fileid} - fileid
 * @param {filepath} - filepath
 * @return {string} - succss or failure
 */

router.post('/webida/api/fs/flink/:fsid/*', authMgr.ensureLogin, function (req, res) {
    var fsid = req.params.fsid;
    var filePath = decodeURI(req.params[0]);
    if (filePath[0] !== '/') {
        filePath = Path.join('/', filePath);
    }

    flinkMap.updateFileLink(fsid, filePath, function (err, flinkInfo) {
        if (err) {
            logger.error(err);
            return res.sendfail(err);
        } else {
            return res.sendok(flinkInfo);
        }
    });

});

/**
 * get file link
 *
 * @method RESTful API get file link from map
 * @param {fsid} - fsid
 * @param {fileid} - fileid
 * @param {filepath} - filepath
 * @return {string} - succss or failure
 */

router.get('/webida/api/fs/flink/:fsid/:fileid', authMgr.ensureLogin, function (req, res) {
    var fsid = req.params.fsid;
    var fileId = req.params.fileid;

    logger.info('fileid = ', fileId);
    flinkMap.getFileLink(fsid, fileId, function (err, flinkInfo) {
        if (err) {
            logger.error(err);
            return res.sendfail(err);
        } else {
            logger.info(flinkInfo);
            var tmp = flinkInfo[0].filepath;
            var start = tmp.indexOf(fsid, 0);
            if (start === -1) {
                return res.sendfail(new ServerError('failed to parse file path'));
            }
            start = tmp.indexOf('/', start + 1);
            if (start === -1) {
                return res.sendfail(new ServerError('failed to parse file path'));
            }
            flinkInfo[0].filepath = tmp.substring(start);
            return res.sendok(flinkInfo);
        }
    });
});

/**
 * get file link by path
 *
 * @method RESTful API get file link by path
 * @param {fsid} - fsid
 * @param {filePath} - file path
 * @return {string} - succss or failure
 */

router.get('/webida/api/fs/flinkbypath/:fsid/*', authMgr.ensureLogin, function (req, res) {
    var fsid = req.params.fsid;
    var wfsUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));

    var filePath = WebidaFS.getPathFromUrl(wfsUrl);
    logger.info('filePath = ', filePath);

    flinkMap.getFileLinkByPath(fsid, filePath, function (err, flinkInfo) {
        if (err) {
            logger.error(err);
            return res.sendfail(err);
        } else {
            logger.info(flinkInfo);
            var tmp = flinkInfo[0].filepath;
            var start = tmp.indexOf(fsid, 0);
            if (start === -1) {
                return res.sendfail(new ServerError('failed to parse file path'));
            }
            start = tmp.indexOf('/', start + 1);
            if (start === -1) {
                return res.sendfail(new ServerError('failed to parse file path'));
            }
            flinkInfo[0].filepath = tmp.substring(start);
            return res.sendok(flinkInfo);
        }
    });
});


