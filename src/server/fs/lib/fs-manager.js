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
//var Fs = require('fs');
var Fs = require('graceful-fs');
var send = require('send');
var FsExtra = require('fs-extra');
//var FileQueue = require('filequeue');
var express = require('express');
var walkdir = require('walkdir');
var async = require('async');
var _ = require('underscore');
var tmp = require('tmp');
var shortid = require('shortid');
var spawn = require('child_process').spawn;
var mkdirp = require('mkdirp');
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



//var ACL_ATTR = 'user.wfs.acl';
var META_ATTR_PREFIX = 'user.wfs.meta.';

var app = express();

var router = new express.Router();
module.exports.router = router;

module.exports.close = function () {
    //require('./webidafs-db').close();
};

module.exports.setLinuxFS = function (linuxFsModule) {
    linuxfs = linuxFsModule;
};

//authMgr.init(config.db.fsDb);
ntf.init('127.0.0.1', config.ntf.port, function () {
    logger.debug('connected to ntf');
});


function getFsinfosByUid(userId, callback) {
    db.wfs.$find({ownerId: userId}, function (err, context) {
        var infos = context.result();
        if (err) {
            return callback(new ServerError('Failed to get filesystem infos'));
        }
        return callback(null, infos);
    });
}
exports.getFsinfosByUid = getFsinfosByUid;

function getWfsByFsid(fsid, callback) {
    if (!fsid) {
        return callback(new Error('fsid is null'));
    }

    db.wfs.findOne({fsid: fsid}, function (err, context) {
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

function fsChangeNotify(topic, op, opuid, fsid, path) {
    var opData = {
        eventType: op,
        opUid: opuid,
        fsId: fsid,
        path: path
    };

    var msgData = {
        topic: topic,
        msgType: 'system',
        data: opData
    };

    ntf.sysnoti(msgData, function (/*err*/) {
        logger.info('notified - ', msgData);
    });

}


function fsCopyNotify(topic, op, opuid, fsid, srcPath, destPath) {

    var opData = {
        eventType: op,
        opUid: opuid,
        fsId: fsid,
        srcPath: srcPath,
        destPath: destPath
    };

    var msgData = {
        topic: topic,
        eventType: 'fs.change',
        data: opData
    };

    ntf.sysnoti(msgData, function (/*err*/) {
        logger.info('notified - ', msgData);
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

    var localPath = getPathFromUrl(wfsUrl);
    logger.debug('sec: local path = ', localPath);
    Fs.stat(localPath, function (error/*, stat*/) {
        if (error) {
            logger.error('sec exec err - ', error);
            if (cb) {
                cb();
            }
        } else {
            // temp logic
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

        db.wfs.$findOne({fsid: fsid}, function(err, context){
            var wfsInfo = context.result();
            if(err){
                return callback(err);
            } else if(wfsInfo) {
                var regPath = new RegExp(path);
                db.lock.$find({wfsId:wfsInfo.wfsId, path:regPath}, function(err, context) {
                    var files = context.result();
                    logger.info('checkLock', fsid, path, cmdInfo, regPath, files);
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

        /*var regPath = new RegExp(path);
        db.lock.$find({fsid:fsid, path:regPath}, {_id:0}, function(err, files) {
            logger.info('checkLock', fsid, path, cmdInfo, regPath, files);
            if (err) {
                return callback(new ServerError('Check lock failed.'));
            } else if (files.length > 0) {
                return callback(new ClientError('Locked file exist.'));
            } else {
                return callback(null);
            }
        });*/
    } else {
        return callback(null);
    }
}
module.exports.checkLock = checkLock;

/**
 * Resource class representing a resource(file, dir) in Webida FS
 * @class
 */
function Resource(wfsUrl) {
    this.uri = URI(wfsUrl);
    this.fsid = this.uri.host();
    this.wfs = new WebidaFS(this.fsid);
    this.pathname = decodeURI(this.uri.pathname());
    this.basename = Path.basename(this.pathname);
    this.localPath = getPathFromUrl(wfsUrl);
}
Resource.prototype.equals = function (rsc2) {
    return this.uri.equals(rsc2.uri);
};
Resource.prototype.exists = function (callback) {
    Fs.exists(this.localPath, callback);
};
Resource.prototype.stat = function (callback) {
    var self = this;
    Fs.stat(self.localPath, callback);
};
Resource.prototype.wstat = function (callback) {
    var self = this;
    self.stat(function (err, stat) {
        if (err) { return callback(err); }
        var wstat = nodeStatToWebidaStat(self.basename, self.pathname, stat);
        callback(null, wstat);
    });
};
Resource.prototype.getParent = function () {
    var parentUri = this.uri.clone().segment(-1, '');
    var parent = new Resource(parentUri);
    if (parent.equals(this)) {
        return null;
    }
    return parent;
};
Resource.prototype.findExistentParent = function (callback) {
    var parent = this.getParent();
    if (!parent) {
        return callback(new Error('Cannot find parent'));
    }
    parent.exists(function (exists) {
        if (exists) {
            return callback(null, parent);
        }
        parent.findExistentParent(callback);
    });
};
exports.Resource = Resource;

/**
 * Get local fs path from WFS URL.
 * This checks protocol/fsid/out-of-fs problems.
 */
function getPathFromUrl(wfsUrl) {
    var wfsUrlObj = URI(wfsUrl);
    //logger.debug('getPathFromUrl parsed url', wfsUrlObj);
    if (wfsUrlObj.protocol() !== 'wfs') {
        logger.info('Invalid protocol', wfsUrlObj);
        return null;
    }
    var fsid = wfsUrlObj.host();
    if (!fsid) {
        logger.info('Invalid fsid');
        return null;
    }
    var rootPath = (new WebidaFS(fsid)).getRootPath();
    var isRelativePath = wfsUrlObj.pathname[0] === '.';
    if (isRelativePath) {
        logger.info('Invalid pathname');
        return null;
    }
    return Path.normalize(Path.join(rootPath, decodeURI(wfsUrlObj.pathname())));
}
exports.getPathFromUrl = getPathFromUrl;

/**
 * Get Metadata
 */
function getMeta(srcUrl, metaName, callback) {
    var srcpath = getPathFromUrl(srcUrl);
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
    var srcpath = getPathFromUrl(srcUrl);
    var attrName = META_ATTR_PREFIX + metaName;
    var str = JSON.stringify(val);
    attr.setAttr(srcpath, attrName, str, callback);
}
exports.setMeta = setMeta;

function removeMeta(srcUrl, metaName, callback) {
    var srcpath = getPathFromUrl(srcUrl);
    var attrName = META_ATTR_PREFIX + metaName;
    attr.removeAttr(srcpath, attrName, callback);
}
exports.removeMeta = removeMeta;

/**
 * Get ACL
 * @param srcUrl {String} - source url
 * @param callback
 * @returns ACL list. Empty list if not exists.
 */
function getAcl(srcUrl, callback) {
    /*
    var srcpath = getPathFromUrl(srcUrl);
    attr.getAttr(srcpath, ACL_ATTR, function (err, val) {
        if (err) {
            return callback(err);
        }
        logger.debug('getAcl acl', srcUrl, val, typeof val, val[0], val.length);
        try {
            var acl = JSON.parse(val);
            callback(null, acl);
        } catch (e) {
            //logger.debug('getAcl exception', e, e.stack, val, val.length);
            callback(null, {});
        }
    });
    */
    callback(null, {});
}
exports.getAcl = getAcl;

function setAcl(srcUrl, acl, callback) {
    /*
    var srcpath = getPathFromUrl(srcUrl);

    function cb(err) {
        if (err) {
            return callback(new Error('Failed to set attribute'));
        }
        callback();
    }
    if (!acl) {
        // remove attr if acl is null
        attr.removeAttr(srcpath, ACL_ATTR, cb);
    } else {
        // TODO validate acl
        var aclStr = JSON.stringify(acl);
        attr.setAttr(srcpath, ACL_ATTR, aclStr, cb);
    }
    */
    callback();
}
exports.setAcl = setAcl;

function isPublicReadable(acl) {
    return acl['@PUBLIC'] && acl['@PUBLIC'].indexOf('r') > -1;
}
exports.isPublicReadable = isPublicReadable;

function isPublicWritable(acl) {
    return acl['@PUBLIC'] && acl['@PUBLIC'].indexOf('w') > -1;
}
exports.isPublicWritable = isPublicWritable;

function isAllUsersReadable(acl) {
    return acl['@ALLUSERS'] && acl['@ALLUSERS'].indexOf('r') > -1;
}
exports.isAllUsersReadable = isAllUsersReadable;

function isAllUsersWritable(acl) {
    return acl['@ALLUSERS'] && acl['@ALLUSERS'].indexOf('w') > -1;
}
exports.isAllUsersWritable = isAllUsersWritable;

/**
 * @param uid {String} - user id. If it's falsy value, check public access
 * @param srcUrl {FSUrl} - Resource url
 * @param callback {callback}
 */
function canRead(uid, srcUrl, callback) {
    /*
    logger.debug('canRead', arguments);
    var wfs = WebidaFS.getInstanceByUrl(srcUrl);
    wfs.getOwner(function (err, owner) {
        if (err) { return callback(err); }
        if (owner === uid) {
            return callback(null, true);
        }
        getAcl(srcUrl, function (err, acl) {
            if (err) { return callback(err); }
            if (isPublicReadable(acl)) {
                return callback(null, true);
            }
            if (!uid) {
                return callback(null, false);
            }
            if (isAllUsersReadable(acl)) {
                return callback(null, true);
            }
            var ace = acl[uid];
            if (!ace) {
                return callback(null, false);
            }
            var hasReadPermission = ace.indexOf('r') > -1;
            return callback(null, hasReadPermission);
        });
    });
    */
    return callback(null, true);
}
exports.canRead = canRead;

/**
 * @param uid {String} - user id. If it's falsy value, check public access
 * @param srcUrl {FSUrl} - Resource url
 * @param callback {callback}
 */
function canWrite(uid, srcUrl, callback) {
    /*
    logger.debug('canWrite', arguments);
    var rsc = new Resource(srcUrl);
    rsc.exists(function (exists) {
        if (exists) {
            return hasWritePermission(srcUrl, callback);
        } else {
            // check acl of the nearest existent parent directory
            rsc.findExistentParent(function (err, parent) {
                if (err || !parent) {
                    return callback(null, false);
                }
                return hasWritePermission(parent.uri.toString(), callback);
            });
        }
    });

    function hasWritePermission(srcUrl, cb) {
        rsc.wfs.getOwner(function (err, owner) {
            if (err) { return cb(err); }
            if (owner === uid) {
                return cb(null, true);
            }
            getAcl(srcUrl, function (err, acl) {
                if (err) { return cb(err); }
                if (isPublicWritable(acl)) {
                    return cb(null, true);
                }
                if (!uid) {
                    return cb(null, false);
                }
                if (isAllUsersWritable(acl)) {
                    return cb(null, true);
                }
                var ace = acl[uid];
                if (!ace) {
                    return cb(null, false);
                }
                var hasWritePerm = ace.indexOf('w') > -1;
                return cb(null, hasWritePerm);
            });
        });
    }
    */
    return callback(null, true);
}
exports.canWrite = canWrite;

function isOwner(uid, srcUrl, callback) {
    var wfs = WebidaFS.getInstanceByUrl(srcUrl);
    wfs.getOwner(function (err, owner) {
        if (err) {
            return callback(err);
        }
        if (owner === uid) {
            return callback(null, true);
        }
        return callback(null, false);
    });
}
exports.isOwner = isOwner;

function canReadAcl(uid, srcUrl, callback) {
    canRead(uid, srcUrl, callback);
}
exports.canReadAcl = canReadAcl;

function canWriteAcl(uid, srcUrl, callback) {
    canWrite(uid, srcUrl, callback);
}
exports.canWriteAcl = canWriteAcl;

function canReadMeta(uid, srcUrl, callback) {
    canRead(uid, srcUrl, callback);
}
exports.canReadMeta = canReadMeta;

function canWriteMeta(uid, srcUrl, callback) {
    canWrite(uid, srcUrl, callback);
}
exports.canWriteMeta = canWriteMeta;


function copy(srcUrl, destUrl, recursive, callback) {
    logger.debug('FS: copy ', srcUrl, '->', destUrl);
    var srcpath = getPathFromUrl(srcUrl);
    var destpath = getPathFromUrl(destUrl);
    if (!srcpath || !destpath) {
        return callback(new Error('invalid path'));
    }
    // TODO check target writable permission

    // check whether same file or not
    if (srcpath === destpath) {
        return callback(new Error('source and target files are the same file'));
    }

    // copy
    Fs.exists(srcpath, function (exists) {
        if (exists) {
            if (recursive) {
                FsExtra.copy(srcpath, destpath, function (error) {
                    if (error) {
                        return callback(error);
                    }
                    callback();
                });
            } else {
                Fs.stat(srcpath, function (error, stat) {
                    if (error) {
                        return callback(error);
                    }

                    if (stat.isDirectory()) {
                        callback(new Error('not a file'));
                    } else {
                        var readStream = Fs.createReadStream(srcpath);
                        var writeStream = Fs.createWriteStream(destpath);
                        readStream.pipe(writeStream);

                        readStream.on('end', function () {
                            return callback();
                        });

                        writeStream.on('error', function (error) {
                            return callback(error);
                        });
                    }
                });
            }
        } else {
            callback(new Error('no such file or directory'));
        }
    });
}
exports.copy = copy;

function move(srcUrl, destUrl, callback) {
    var srcpath = getPathFromUrl(srcUrl);
    var destpath = getPathFromUrl(destUrl);
    if (!srcpath || !destpath) {
        return callback(new Error('invalid path'));
    }
    // TODO check target writable permission

    // check whether same file or not
    if (srcpath === destpath) {
        return callback(new Error('source and target files are the same file'));
    }

    // move
    Fs.exists(srcpath, function (exists) {
        if (exists) {
            Fs.rename(srcpath, destpath, function (error) {
                if (error) {
                    return callback(error);
                }
                return callback();
            });
        } else {
            return callback(new Error('no such file or directory'));
        }
    });
}
exports.move = move;

function nodeStatToWebidaStat(filename, path, nodeStat) {
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

function nodeListToWebidaList(filename, path, nodeStat) {
    return {
        name: filename,
        isFile: nodeStat.isFile(),
        isDirectory: nodeStat.isDirectory()
    };
}

// options : {recursive, dirOnly, fileOnly}
function listDir(wfsUrl, options, callback) {
    var rsc = new Resource(wfsUrl);
    //console.log('list rsc', wfsUrl, rsc);
    var path = rsc.localPath;
    var rootPath = rsc.wfs.getRootPath();

    function wstat(p, cb) {
        Fs.lstat(p, function (err, stats) {
            if (err) {
                return cb(err);
            }
            // Ignore resource that is not a file or directory(eg. symbolic links)
            if (!stats.isFile() && !stats.isDirectory()) {
                return cb(null, null);
            }
            if (options.dirOnly && !stats.isDirectory()){
                return cb(null, null);
            }
            if (options.fileOnly && !stats.isFile()) {
                return cb(null, null);
            }
            var filename = Path.basename(p);
            var relativePath = Path.relative(rootPath, p);
            var ws = nodeListToWebidaList(filename, '/' + relativePath, stats);

            if (options.recursive && stats.isDirectory()) {
                Fs.readdir(p, function (err, files) {
                    if (err) {
                        return cb(err);
                    }
                    files = _.map(files, function (filename) {
                        return Path.join(p, filename);
                    });
                    list(files, function (err, results) {
                        if (err) {
                            return cb(err);
                        }
                        ws.children = results;
                        return cb(null, ws);
                    });
                });
            } else {
                cb(null, ws);
            }
        });
    }

    function list(paths, callback) {
        var wstats = [];
        async.each(paths,
            function (path, cb) {
                wstat(path, function (err, wst) {
                    if (err) { return cb(err); }
                    if (wst) {
                        wstats.push(wst);
                    }
                    // ignore not meaningful wstat
                    return cb();
                });
            },
            function (err) {
                if (err) { return callback(err); }
                callback(null, wstats);
            }
        );
    }
    Fs.lstat(path, function (err, stats) {
        if (err) {
            return callback(err);
        }

        if (stats.isDirectory()) {
            Fs.readdir(path, function (err, files) {
                files = _.map(files, function (filename) {
                    return Path.join(path, filename);
                });
                return list(files, callback);
            });
        } else {
            // other than dirs are not allowed in Webida FS
            callback(new Error('Not a directory'));
        }
    });
}
exports.listDir = listDir;

function exists(pathUrl, callback) {
    var path = getPathFromUrl(pathUrl);
    if (!path) {
        return callback(false);
    }

    Fs.exists(path, function (exists) {
        return callback(exists);
    });
}
exports.exists = exists;

function createZip(absolutePath, absoluteTarget, callback) {
    async.waterfall([
        function (cb) {
            // error check : source and target same
            if (_.contains(absolutePath, absoluteTarget)) {
                cb(new Error('Source and target path must be different.'));
            }

            // error check : source exist
            async.every(absolutePath, Fs.exists, function (exists) {
                if (exists) {
                    cb();
                } else {
                    cb(new Error('Invalid path is included'));
                }
            });
        },
        function (cb) {
            // error check : target exist
            Fs.exists(absoluteTarget, function (exists) {
                if (exists) {
                    cb(new Error(Path.basename(absoluteTarget) + ' already exists'));
                } else {
                    cb();
                }
            });
        },
        function (cb) {
            // make a zipfile
            var zip = function (path, cb2) {
                var dirname = Path.dirname(path);
                var basename = Path.basename(path);

                spawn('zip', ['-rq', absoluteTarget, basename], {
                    cwd: dirname
                }).on('close', function (code) {
                    if (code !== 0) {
                        cb2('zip failed at ' + basename);
                    } else {
                        cb2(null);
                    }
                });
            };

            async.eachSeries(absolutePath, zip, function (err) {
                if (err) {
                    return cb(new Error('Zip file createion fail.'));
                }

                Fs.exists(absoluteTarget, function (exists) {
                    if (exists) {
                        cb(null);
                    } else {
                        return cb(new Error(Path.basename(absoluteTarget) + ' does not exist'));
                    }
                });
            });
        }
    ], function(err) {
        if (err) {
            console.error(err);
            callback(err);
        } else {
            callback(null);
        }
    });
}
exports.createZip = createZip;

function extractZip(absolutePath, target, rootPath, callback) {
    async.waterfall([
        function(cb) {
            // checks whether the specified source path is invalid.
            if (absolutePath.length > 1) {
                cb(new Error('only one zipfile should be speicfied'));
            }

            absolutePath = absolutePath[0];

            // error check : source exist
            Fs.exists(absolutePath, function (exists) {
                if (exists) {
                    cb();
                } else {
                    cb(new Error(Path.relative(rootPath, absolutePath) + ' does not exist'));
                }
            });
        },
        function(cb) {
            if (target === undefined) {
                // if the target path is undefined,
                //   the default target path specifies the dirname of source path + '/archive'
                target = Path.dirname(absolutePath) + '/archive';
                cb();
            } else {
                if (target[0] === '/') {
                    target = Path.resolve(rootPath, target.substr(1));
                }

                // if target path not exist then make directory
                Fs.exists(target, function (exists) {
                    if (exists) {
                        cb();
                    } else {
                        FsExtra.mkdirs(target, function (err) {
                            if (err) {
                                cb(err);
                            } else {
                                cb();
                            }
                        });
                    }
                });
            }
        },
        function(cb) {
            var sourceRelativePath = Path.relative(rootPath, absolutePath);
            var targetRelativePath = Path.relative(rootPath, target);

            // -o options is overwrite.
            // -d options extract the specified directory.
            spawn('unzip', ['-oq', sourceRelativePath, '-d', targetRelativePath], {
                stdio: [0, 1, 2], // use parent's stdio
                cwd: rootPath
            }).on('close', function (code) {
                if (code !== 0) {
                    cb(new Error('unzip failed ' + code));
                }

                cb();
            });
        }
    ], function (err) {
        if (err) {
            console.error(err);
            callback(err);
        } else {
            callback(null);
        }
    });
}
exports.extractZip = extractZip;

/*
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
            linuxfs.createFS(fsid, function (err) {
                if (err) {
                    next(err);
                } else {
                    next(null, fsinfo);
                }
            });
        }
    ], function (err) {
        if (err) {
            logger.error('createFS failed', fsinfo, err);
            callback(err);
        } else {
            callback(null, fsinfo);
        }
    });

    /*function rollbackDb(fsinfo, cb) {
        db.wfs.$remove(fsinfo, cb);
    }

    db.wfs.$save(fsinfo, function (err) {
        if (err) {
            logger.error('doAddNewFS failed', fsinfo, err);
            return callback(new ServerError('doAddNewFS failed:' + err.toString()));
        }
        linuxfs.createFS(fsid, function (err) {
            if (err) {
                logger.error('createFS failed', fsinfo, err);
                rollbackDb(fsinfo, function (dberr) {
                    logger.error('createFS:rollbackDb failed', fsinfo, dberr);
                    return callback(err);
                });
            } else {
                callback(null, fsinfo);
            }
        });
    });*/
}
exports.doAddNewFS = doAddNewFS;

function addNewFS(user, owner, callback) {
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
                getFsinfosByUid(user.userId, function (err, fsinfos) {
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
        }],
        callback);
}
exports.addNewFS = addNewFS;

function doDeleteFS(fsid, cb) {
    db.wfs.$remove({fsid: fsid}, function(err){
    //db.wfs.remove({fsid: fsid}, function (err) {
        // TODO rollback
        if (err) { return cb(err); }
        linuxfs.deleteFS(fsid, cb);
    });
}
/*
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
    async.waterfall([
        function (next) {
            var wfs = new WebidaFS(fsid);
            if (!user.isAdmin) {
                wfs.getOwner(function (err, owner) {
                    if (err) {
                        return next(new Error('Failed to get filesystem info:' + err));
                    }
                    if (owner !== user.uid) {
                        return next(new Error('Unauthorized Access'));
                    }
                    next();
                });
            } else {
                next();
            }
        },
        function (next) {
            return doDeleteFS(fsid, next);
        },
        function (next) {
            // Save deleted fs log to a collection. Batch job will use this for actual fs deletion.
            var deletedFsinfo = {wfsId: fsid, fsid: fsid};
            db.wfsDel.$save(deletedFsinfo, function(){
            //db.wfs_del.save(deletedFsinfo, function (/*err*/) {
                // Ignore this db error because it's not critical to system and batch job will detect it.
                next();
            });
        }],
        callback);
}
exports.deleteFS = deleteFS;

function serveFile(req, res, srcUrl, serveErrorPage) {
    var sendError = serveErrorPage ? res.sendErrorPage : res.sendfail;
    var path = getPathFromUrl(srcUrl);
    if (!path) {
        return sendError(new ClientError('Invalid file path'));
    }
    Fs.stat(path, function (error, stats) {
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

/* Get filesystem info
 * @param {String} fsid
 * @returns {Object} fsinfo - {owner: <user id>, fsid: <fsid>}
 */
router.get('/webida/api/fs/:fsid',
    authMgr.verifyToken,
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

/* Get all filesystem infos for owner
 * @param {String} uid
 * @returns {Object} fsinfos - [{owner: <user id>, fsid: <fsid>}]
 */
router.get('/webida/api/fs',
    authMgr.verifyToken,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'fssvc:getMyFSInfos', rsc:'fssvc:*'}, res, next);
    },
    function (req, res) {
    var uid = req.user.uid;
    getFsinfosByUid(req.user.userId, function (err, fsinfos) {
        if (err) {
            logger.info('allfsinfos err', err, uid);
            return res.sendfail(err, 'Failed to get filesystem info');
        } else if (!fsinfos) {
            logger.info('no fs info for', uid);
            res.sendok(new Array([]));
        } else {
            logger.info('allfsinfos success', uid, fsinfos);
            res.sendok(fsinfos);
        }
    });
});

/* Create new filesystem
 *
 * @param {String} owner - owner uid who will be the owner of the newly created filesystem
 * @returns {Object} result - {result:'ok'|'fail', fsinfo: {owner: <user id>, fsid: <fsid>}}
 */
router.post('/webida/api/fs',
    authMgr.verifyToken,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'fssvc:addMyFS', rsc:'fssvc:*'}, res, next);
    },
    function (req, res) {
        var user = req.user; // requester
        var owner = req.body.owner; // owner uid
        if (!owner) {
            return res.sendfail(new ClientError('Owner is not specified'));
        }

        logger.info('addNewFS start', user, owner);
        addNewFS(user, owner, function (err, fsinfo) {
            if (err) {
                logger.info('addNewFS fail', err);
                return res.sendfail(err, 'Failed to create new filesystem');
            }
            var policy = {name: 'DefaultFS', action: ['fs:*'], resource: ['fs:' + fsinfo.fsid + '/*']};
            authMgr.createPolicy(policy, user.token, function (err, policy) {
                if (err || !policy) {
                    logger.info('addNewFS createDefaultFSPolicy fail', err, policy);
                    return res.sendfail(err, 'Failed to create new filesystem');
                }
                logger.debug('assignPolicy', policy);
                authMgr.assignPolicy(user.uid, policy.pid, user.token, function(err) {
                    if (err) {
                        logger.info('addNewFS assignPolicy fail', err);
                        return res.sendfail(err, 'Failed to create new filesystem');
                    }

                    logger.info('addNewFS success', fsinfo);
                    res.sendok(fsinfo);
                });
            });
        });
    }
);

/* Delete filesystem
 * Need FS owner permission.
 * TODO acl
 *
 * @param {String} fsid
 */
router.delete('/webida/api/fs/:fsid',
    authMgr.verifyToken,
    function (req, res, next) {
        authMgr.checkAuthorize({uid:req.user.uid, action:'fssvc:deleteFS', rsc:'fssvc:*'}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var user = req.user;

        deleteFS(user, fsid, function (err) {
            if (err) {
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
        listDir(srcUrl, options, function (err, tree) {
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
 * @param {String} options - {recursive, onlydir, onlyfile}
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

        listDir(srcUrl, options, function (err, tree) {
            if (err) {
                return res.sendfail(new ClientError(404, 'Failed to get the file list'));
            }
            return res.sendok(tree);
        });
    }
);

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
        authMgr.checkAuthorizeMulti(aclInfo, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var uid = req.user && req.user.uid;
        //var rootPath = (new WebidaFS(fsid)).getRootPath();
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
                canRead(uid, srcUrl, function (err, readable) {
                    logger.info('stat canRead', arguments);
                    if (err) {
                        return next(err);
                    }
                    if (!readable) {
                        return next(new ClientError(403, 'Need READ permission'));
                    }
                    rsc.wstat(function (err, wstat) {
                        wstats.push(wstat);
                        return next();
                    });
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

        logger.info('readFile', req.user, srcUrl);
        var uid = req.user && req.user.uid;
        canRead(uid, srcUrl, function (err, readable) {
            logger.info('readFile canRead', arguments);
            if (err) {
                return res.sendfail(err, 'Failed to get the user permission');
            }
            if (!readable) {
                return res.sendfail(new ClientError(403, 'Need READ permission'));
            }
            serveFile(req, res, srcUrl);
        });
    }
);

function writeFile(wfsUrl, filePath, callback) {
    logger.info('writeFile', wfsUrl, filePath);
    var rsc = new Resource(wfsUrl);
    var targetPath = rsc.localPath;

    logger.info('targetPath = ', targetPath);

    if (!rsc.localPath) {
        return callback(new Error('Invalid file path'));
    }

    function doWriteFile(callback) {
        var callbackCalled = false;
        var downloadedFileStream = Fs.createReadStream(filePath);
        var targetStream = Fs.createWriteStream(targetPath);
        downloadedFileStream.pipe(targetStream);
        targetStream.on('finish', function () {
            if (!callbackCalled) {
                return callback(null);
            }
        });
        targetStream.on('error', function (error) {
            logger.error('writeFile fail', error, filePath, targetPath, arguments);
            //logger.info('writeFile fail', filePath, targetPath, arguments);
            callbackCalled = true;
            if(error.code === 'ENOSPC'){
                // there is no space to write
                return callback('You have exceeded your quota limit.');
            } else {
                return callback('Failed to write file');
            }
        });
    }

    Fs.exists(targetPath, function (exists) {
        if (exists) {
            doWriteFile(callback);
        } else {
            doWriteFile(function (err) {
                if (err) { return callback(err); }
                getAcl(rsc.getParent().uri.toString(), function (err, acl) {
                    if (err) { return callback(err); }
                    setAcl(rsc.uri, acl, function (err) {
                        if (err) { return callback(err); }
                        return callback(err);
                    });
                });
            });
        }
    });
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
    authMgr.verifyToken,
    function (req, res, next) {
        var fsid = req.params.fsid;
        var dest = decodeURI(req.params[0]);
        var path = (new WebidaFS(fsid)).getFSPath(dest);
        Fs.exists(path, function(exist) {
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
        db.lock.$findOne({fsid:fsid, path:path}, function(err, context) {
            var lock = context.result();
            logger.info('writeFile check lock', err, lock);
            if (err) {
                return res.sendfail(err, 'Failed to write file.(failed to get lock info)');
            } else if (lock && req.user.userId !== lock.userId && !req.user.isAdmin) {
                return res.sendfail(new ClientError(409, 'Specified file is locked by'+lock.email));
            }
            return next();
        });
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var pathStr = Path.join('/', decodeURI(req.params[0]));
        var wfsUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));
        logger.info('writeFile', req.user, wfsUrl);
        var uid = req.user && req.user.uid;

        if (wfsUrl.indexOf(';') !== -1) {
            return res.sendfail(new ClientError(403, 'You can not use \';\' in the path'));
        }

        var isAborted = false;

        var form = new formidable.IncomingForm();
        var files = [];
        var fields = [];

        form
            .on('field', function(field, value) {
                logger.info('field = ', field, 'value = ',  value);
                fields.push([field, value]);
            })
            .on('file', function(name, file) {
                if (name !== 'file') {
                    var errmsg = 'Bad upload request format';
                    logger.error(errmsg + ':' + file.path);
                    res.header('Connection', 'close');
                    isAborted = true;
                    return res.sendfail(new ClientError(413, errmsg));
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
                    var errmsg = 'Uploading file is too large.';
                    logger.error(errmsg);
                    return res.sendfail(new ClientError(413, errmsg));
                }
                logger.info('progress:' + bytesReceived + '/' + bytesExpected);
            })
            .on('error', function(err) {
                var errmsg = 'Failed to upload with error (' +  err + ').';
                logger.error(errmsg);
                res.header('Connection', 'close');
                if (err) {
                    return res.status(400).send(utils.fail(errmsg));
                }
            })
            .on('aborted', function() {
                logger.info('Uploading is aborted.');
            })
            .on('end', function() {
                logger.info('Finished to upload file to tmp dir.');
        });

        //form.uploadDir = process.env.TMP || process.env.TMPDIR || process.env.TEMP || '/tmp' || process.cwd();
        form.hash = false; //'sha1';
        form.keepExtensions = true;

        canWrite(uid, wfsUrl, function (err, writable) {
            // TODO This is not atomic operation. Consider using fs-ext.flock()
            logger.info('writeFile canWrite', arguments);
            if (err) {
                return res.sendfail(err, 'Failed to get the user permission');
            }
            if (!writable) {
                return res.sendfail(new ClientError(403, 'Need WRITE permission'));
            }

            form.parse(req, function(err, fields, files) {
                logger.info('parse - ' + JSON.stringify(files));

                if (err) {
                    return res.sendfail(err, 'Failed to write file');
                }

                if (isAborted) {
                    logger.error('Request is aborted, delete temporary file: ', files.file.path);
                    Fs.unlink(files.file.path, function (cleanErr) {
                        if (cleanErr) {
                            logger.warn('Write File clean error: ', cleanErr);
                        }
                    });
                } else {
                    writeFile(wfsUrl, files.file.path, function (err) {
                        Fs.unlink(files.file.path, function (cleanErr) {
                            if (cleanErr) {
                                logger.warn('Write File clean error: ', cleanErr);
                            }

                            if (err) {
                                return res.sendfail(err);
                            }
                            logger.debug('sessionID: ', fields.sessionID);
                            fsChangeNotifyTopics(pathStr, 'file.written', uid, fsid, fields.sessionID);

                            // sec
                            var localPath = getPathFromUrl(wfsUrl);
                            flinkMap.updateFileLink(fsid, localPath, function (err, flinkInfo) {
                                //if (err) {
                                    //logger.debug(err);
                                //} else {
                                if(!err){
                                    logger.info('flink updated -- ', flinkInfo);
                                }
                            });
                            return res.send(utils.ok());
                        });
                    });
                }
            });
        });
    }
);



/**
 * Delete file
 * Requires WRITE permission.
 * TODO acl
 *
 * @method RESTful API deleteFile - /webida/api/fs/file/{fsid}/{path}[?recursive={value}]
 * @param {String} fsid - fsid
 * @param {String} path - relative path
 * @param {String} recursive - true / false [default=false]
 */
router['delete']('/webida/api/fs/file/:fsid/*',
    authMgr.verifyToken,
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
        path = new RegExp(path);
        db.lock.$find({fsid:fsid, path:path}, function(err, context) {
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

        Fs.stat(path, function (error, stats) {
            if (error) {
                return res.sendfail(new ClientError(404, 'No such file or directory'));
            }

            if (recursive === 'true') {
                flinkMap.removeLinkRecursive(fsid, path, function(/*err*/) {
                    FsExtra.remove(path, function (error) {
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
                        Fs.unlink(path, function (error) {
                            if (error) {
                                logger.error('delete file error', path, error);
                                return res.sendfail(new ServerError('Failed to delete path'));
                            }

                            fsChangeNotifyTopics(notiPath, 'file.deleted', uid, fsid, sessionID);

                            res.sendok();
                        });
                    });
                } else if (stats.isDirectory()) {
                    Fs.rmdir(path, function (error) {
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
    rsc.exists(function (exists) {
        if (exists) {
            return callback(new Error('Directory already exists'));
        } else {
            return doMkdir(rsc, callback);
        }
    });
    function doMkdir(curRsc, cb) {
        curRsc.exists(function (exists) {
            if (exists) {
                return cb();
            }
            var parent = curRsc.getParent();
            doMkdir(parent, function (err) {
                if (err) { cb(err); }
                Fs.mkdir(curRsc.localPath, function (err) {
                    if (err) { cb(err); }
                    getAcl(parent.uri, function (err, acl) {
                        if (err) { cb(err); }
                        setAcl(curRsc.uri, acl, function (err) {
                            if (err) { cb(err); }
                            cb(null);
                        });
                    });

                });
            });
        });
    }
}

function createDirectory(uid, rsc, recursive, callback) {
    function doCreateDirectory() {
        canWrite(uid, rsc.uri, function (err, writable) {
            logger.info('createDir canWrite', arguments);
            if (err) { return callback(err); }
            if (!writable) {
                return callback(new Error('Need WRITE permission'));
            }
            mkdir(rsc, function (err) {
                if (err) { return callback(err); }
                return callback();
            });
        });
    }
    if (!recursive) {
        rsc.getParent().exists(function (exists) {
            if (!exists) {
                return callback(new Error('Failed to create directory'));
            } else {
                doCreateDirectory();
            }
        });
    } else {
        doCreateDirectory();
    }
}
exports.createDirectory = createDirectory;

function findFirstExist(parent, callback) {
    Fs.exists(parent, function (exists) {
        if (exists) {
            return callback(null, parent);
        } else {
            return findFirstExist(Path.dirname(parent), callback);
        }
    });
}

/**
 * Create directory
 * Need WRITE permission for the parent directory
 * TODO acl
 *
 * @method RESTful API createDirectory - /webida/api/fs/file/{fsid}/{path}[?recursive={"true"|"false"}]
 * @param {String} fsid - fsid
 * @param {String} path - relative path
 * @param {String} recursive - true / false [default=false]
 */
router.post('/webida/api/fs/directory/:fsid/*',
    authMgr.verifyToken,
    multipartMiddleware,
    function (req, res, next) {
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        path = req.params.fsid + path;
        logger.info('createDirectory', req.user.uid, 'wfs://'+path);
        var recursive = req.body.recursive || 'false';
        logger.info('recursive ===', recursive);

        if (recursive !== 'true' && recursive !== 'false') {
            return res.sendfail(new ClientError('Invalid value for recursive option(true or false)'));
        }
        recursive = recursive === 'true';

        if (!recursive) {
            var rsc = new Resource('wfs://'+path);
            logger.info('createDirectory acl check', rsc.uri);
            rsc.getParent().exists(function (exists) {
                if (!exists) {
                    return res.send(400, 'Failed to create directory: Directory does not exist');
                } else {
                    authMgr.checkAuthorize({uid:req.user.uid, action:'fs:createDirectory', rsc:'fs:'+path}, res, next);
                }
            });
        } else {
            findFirstExist(getPathFromUrl('wfs://'+path), function(err, result) {
                if (err) {
                    return res.send(400, 'Failed to create directory: findFirstExist');
                } else {
                    path = 'fs:' + req.params.fsid + '/' + result;
                    authMgr.checkAuthorize({uid:req.user.uid, action:'fs:createDirectory', rsc:path}, res, next);
                }
            });
        }
    },
    function(req, res) {
        var sessionID = req.body.sessionID;
        var strPath = Path.join('/', decodeURI(req.params[0]));
        var rsc = 'wfs://' + req.params.fsid + strPath;
        mkdirp(getPathFromUrl(rsc), function (err) {
            if (err) {
                return res.sendfail(err, 'Failed to create directory: mkdirp');
            }
            var uid = req.user && req.user.uid;
            var fsid = req.params.fsid;
            fsChangeNotifyTopics(strPath, 'dir.created', uid, fsid, sessionID);
            return res.sendok();
        });
    }
);

/**
 * copy
 * Need READ permission for the resource.
 * Need WRITE permission for the destination directory.
 * TODO acl
 *
 * @method RESTful API copy - /webida/api/fs/copy/<fsid>/?src=<src>&dest=<dest>&recursive=[false|true]
 */
router.post('/webida/api/fs/copy/:fsid/*',
    authMgr.verifyToken,
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
        Fs.exists(path, function(exist) {
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

        copy(srcUrl, destUrl, recursive, function (err) {
            if (err) {
                return res.sendfail(err, 'Copy failed');
            }

            //noti
            var uid = req.user && req.user.uid;
            fsCopyNotifyTopics(srcPath, 'filedir.copied', uid, fsid, srcPath, destPath, sessionID);

            // for sec
            var srcLocalPath = getPathFromUrl(srcUrl);
            var destLocalPath = getPathFromUrl(destUrl);
            Fs.stat(srcLocalPath, function (error, stat) {
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
    authMgr.verifyToken,
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
        path = new RegExp(path);
        db.lock.$find({fsid:fsid, path:path}, function(err, context) {
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
        var srcLocalPath = getPathFromUrl(srcUrl);
        var destLocalPath = getPathFromUrl(destUrl);
        Fs.stat(srcLocalPath, function (error, stat) {
            if (error) {
                logger.error(error);
                return res.sendfail(new ServerError('stat failure: ' + error.code));
            }
            if (stat.isDirectory()) {
                flinkMap.getFileList(srcLocalPath, function (err, oldFileList) {
                    move(srcUrl, destUrl, function (err) {
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
                move(srcUrl, destUrl, function (err) {
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

                    //res.sendok();
                });
            }
        });
    }
);

function checkBinary (path, cb) {
    var buffer = new Buffer(100);
    function check(buf, len) {
        var NULL = 0;
        for (var i = 0; i < len; i = i + 1) {
            if (buf[i] === NULL) {
                return true;
            }
        }
        return false;
    }
    Fs.open(path, 'r', function (err, fd) {
        if (err) {
            logger.error(err, new Error());
            return cb(err);
        }
        Fs.read(fd, buffer, 0, buffer.length, null, function (err, bytesRead/*, buf*/) {
            if (err) {
                logger.error(err, new Error());
                return cb(err);
            }
            Fs.close(fd);
            cb(null, check(buffer, bytesRead));
        });
    });
}

function search(targetRsc, regKeyword, regExcludeDir, regFile, callback) {
    var rootPath = targetRsc.wfs.getRootPath();
    var walker = walkdir(targetRsc.localPath);
    var q;
    var lists = [];
    var searchEndCode = 'SEARCH_END_CODE!!';
    var isSearchEnded = false;

    function searcher(path, cb) {
        if (path === searchEndCode) {
            isSearchEnded = true;
            return cb();
        }
        checkBinary(path, function (err, isBinary) {
            if (!isBinary) {
                Fs.readFile(path, 'utf8', function (err, str) {
                    if (err) { return cb(err); }
                    var match = [];
                    str.split(/\r*\n/).forEach(function (text, line) {
                        if (!regKeyword.test(text)) {
                            return;
                        }
                        match.push({
                            line: line + 1,
                            text: text
                        });
                    });

                    if (match.length) {
                        lists.push({
                            filename: '/' + Path.relative(rootPath, path),
                            match: match
                        });
                    }
                    cb();
                });
            } else {
                cb();
            }
        });
    }

    function errorHandler(err) {
        logger.error('err', err, new Error().stack);
        q.kill();
        walker.end();
        callback(err);
    }

    q = async.queue(searcher, 2);

    q.drain = function() {
        if (isSearchEnded) {
            return callback(null, lists);
        }
    };

    walker.on('file', function (file) {
        // TOFIX performance issue. This lists even ignored dirs. It's much better not to list ignored dirs in the first.
        if (regExcludeDir !== null && regExcludeDir.test(Path.dirname(file))) {
            return;
        }
        if (regFile !== null && !regFile.test(file)) {
            return;
        }
        q.push(file, function (err) {
            if (err) { errorHandler(err); }
        });
    });
    walker.on('end', function () {
        q.push(searchEndCode);
    });
    walker.on('error', errorHandler);
}
exports.search = search;

/**
 * Search keyword in files
 * Need Owner permission
 * TODO acl
 *
 * @method RESTful API search - /webida/api/fs/search/{fsid}/{keyword}[?where={path}&ignorecase={value}&wholeword={value}&includefile={pattern}&excludedir={pattenr}]
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
    authMgr.verifyToken,
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
        //var rootPath = (new WebidaFS(fsid)).getRootPath();

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

        search(targetRsc, regKeyword, regExcludeDir, regFile, function (err, result) {
            if (err) {
                return res.sendfail(err, 'Search failed');
            }
            return res.sendok(result);
        });
    }
);

/**
 * Create / Export / Extract a archive file (zip)
 * Need Owner permission
 * TODO acl
 *
 * @method RESTful API search -
 *                 /webida/api/fs/archive/{fsid}/?source='list1,list2'&target='archive.zip'&mode=[create|extract|export]
 * @param {String} fsid - fsid
 * @param {Array} Create and Export mode: the list of source(multiple), Extract mode: the source file(single)
 * @param {String} target
 * @param {String} mode - create / extract / export
 */
router.get('/webida/api/fs/archive/:fsid/*',
    authMgr.verifyToken,
    function (req, res, next) { // check srclist read permission
        var aclInfo = {uid:req.user.uid, action:'fs:archive', rsc:req.query.source, fsid:req.params.fsid};
        authMgr.checkAuthorizeMulti(aclInfo, res, next);
    },
    function (req, res, next) { // check dest write permission
        if (req.query.mode === 'export')
            return next();

        var path = req.query.target;
        if (path[0] !== '/')
            path = Path.join('/', path);
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:archive', rsc:rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var rootPath = (new WebidaFS(fsid)).getRootPath();
        var source = req.query.source;
        var target = req.query.target;
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
                    console.error('Temp zip file name generate fail: ' + err);
                    return res.sendfail(new ServerError('Failed to generate temp zip file name'), 'Archive failed');
                }
                absoluteTarget = path + '.zip';

                // create zip file
                createZip(absolutePath, absoluteTarget, function (err) {
                    if (err) {
                        console.error('Zip file creation fail: ' + err);
                        return res.sendfail(err, 'Failed to create zip file');
                    }

                    // let browser download zip file
                    res.download(absoluteTarget, target, function (err) {
                        if (err) {
                            console.error('Export download fail: ' + err);
                        }

                        // remove temp zip file
                        FsExtra.remove(absoluteTarget, function (err) {
                            if (err) {
                                console.error('Temp result file remove fail: ' + err);
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
            createZip(absolutePath, absoluteTarget, function (err) {
                if (err) {
                    console.error('Zip file creation fail. ' + err);
                    return res.sendfail(err, 'Zip file creation fail');
                }
                res.sendok();
            });
        } else if (mode === 'extract') {
            if (target.indexOf(';') !== -1) {
                return res.sendfail(new ClientError('You can not use \';\' in the path'));
            }

            extractZip(absolutePath, target, rootPath, function (err) {
                if (err) {
                    console.error('Extract zip fail. ' + err);
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
        var uid = req.user && req.user.uid;
        var pathUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));

        canRead(uid, pathUrl, function (err, readable) {
            console.log('exists canRead', arguments);
            if (err) {
                return res.sendfail(err, 'Failed to get the user permission');
            }
            if (!readable) {
                return res.sendfail(new ClientError(403, 'Need READ permission'));
            }
            exists(pathUrl, function (exist) {
                return res.sendok(exist);
            });
        });
    }
);

/**
 * Get ACL for the given path
 * Requires READ permission.
 * TODO : deprecate
 *
 * @method RESTful API getAcl - /webida/api/fs/acl/{fsid}/{path}
 * @param {String} fsid - fsid
 * @param {String} path - file path
 */
router.get('/webida/api/fs/acl/:fsid/*', authMgr.verifyToken, function (req, res) {
    var fsid = req.params.fsid;
    var pathUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));
    canReadAcl(req.user.uid, pathUrl, function (err, canRead) {
        if (err) {
            return res.sendfail(err, 'Failed to get the user permission');
        }
        if (!canRead) {
            return res.sendfail(new ClientError(403, 'Need READ permisson'));
        }
        getAcl(pathUrl, function (err, acl) {
            if (err) {
                return res.sendfail(err, 'Failed to get ACL');
            }
            return res.sendok(acl);
        });
    });
});

/**
 * Set ACL for the given path
 * Requires WRITE permission.
 * TODO : deprecate
 *
 * @method RESTful API setAcl - /webida/api/fs/acl/{fsid}/{path}?acl={acl}
 * @param {String} fsid - fsid
 * @param {String} path - file path
 * @param {String} acl - stringified acl object. eg. {"usrename1":"r","username2":"w","usrename3":"rw"}
 */
router.post('/webida/api/fs/acl/:fsid/*', authMgr.verifyToken, function (req, res) {
    var fsid = req.params.fsid;
    var pathUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));
    var newAcl = JSON.parse(req.body.acl);
    canWriteAcl(req.user.uid, pathUrl, function (err, canWrite) {
        if (err) {
            return res.sendfail(err, 'Failed to get the user permission');
        }
        if (!canWrite) {
            return res.sendfail(new ClientError(403, 'Need WRITE permission'));
        }
        setAcl(pathUrl, newAcl, function (err) {
            if (err) {
                return res.sendfail(err, 'Failed to set ACL');
            }
            return res.sendok();
        });
    });
});

/**
 * Get metadata for the given path
 * Requires READ permission.
 *
 * @method RESTful API getMeta - /webida/api/fs/meta/{fsid}/{path}?name=<metaName>
 * @param {String} fsid - fsid
 * @param {String} path - file path
 * @param {String} name - name of the metadata
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
        var uid = req.user && req.user.uid;
        var metaName = req.query.name;
        var pathUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));
        canReadMeta(uid, pathUrl, function (err, canRead) {
            if (err) {
                return res.sendfail(err, 'Cannot read metadata');
            }
            if (!canRead) {
                return res.sendfail(new ClientError(403, 'Need READ permission'));
            }
            getMeta(pathUrl, metaName, function (err, val) {
                if (err) {
                    return res.sendfail(err, 'Failed to get metadata');
                }
                return res.sendok(val);
            });
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
 */
router.post('/webida/api/fs/meta/:fsid/*',
    authMgr.verifyToken,
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
        canWriteMeta(req.user.uid, wfsUrl, function (err, canWrite) {
            if (err) {
                return res.sendfail(err, 'Failed to get the user permission');
            }
            if (!canWrite) {
                return res.sendfail(new ClientError(403, 'Need WRITE permission'));
            }
            setMeta(wfsUrl, metaName, newMeta, function (err) {
                if (err) {
                    return res.sendfail(err, 'Failed to set metadata');
                }
                return res.sendok();
            });
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
        //return res.sendfail(new ClientError('Invalid access'));
    }
    var aliasKey = result[1];
    var subPath = result[2] || '';
    logger.info('Alias', req.params[0], aliasKey, subPath);
    fsAlias.getAliasInfo(aliasKey, function (err, aliasInfo) {
        if (err) {
            return res.sendErrorPage(500, 'Failed to get \'' + aliasKey + '\' alias info.');
            //return res.sendfail(err, 'Failed to get alias info');
        }
        if (!aliasInfo) {
            return res.sendErrorPage(404, 'Cannot find \'' + aliasKey + '\' alias. It may be expired.');
            //return res.sendfail(new ClientError(404, 'Not Found'));
        }
        var wfsUrl = 'wfs://' + aliasInfo.fsid + '/' + aliasInfo.path + '/' + subPath;
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
    authMgr.verifyToken,
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
        fs.getOwner(function (err, owner) {
            if (err) {
                return res.sendfail(err, 'Failed to delete filesystem');
            }
            if (owner !== user.uid) {
                return res.sendfail(new ClientError('Unauthorized Access: FS owner can make alias'));
            }
            doAddAlias();
        });
    }
);

/**
 * Delete alias
 * Need FS owner permission.
 * TODO acl
 *
 * @method RESTful API deleteAlias
 * @param {aliasKey} - aliasKey
 */
router['delete']('/webida/api/fs/alias/:aliasKey',
    authMgr.verifyToken,
    function (req, res, next) {
        var aliasKey = decodeURI(req.params.aliasKey);
        if (!aliasKey) {
            return res.sendfail(new ClientError('Invalid parameter: aliasKey should be specified'));
        }
        fsAlias.getAliasInfo(aliasKey, function (err, aliasInfo) {
            if (err) {
                return res.sendfail(err, 'Failed to delete alias');
            }
            var rsc = 'fs:' + aliasInfo.fsid + aliasInfo.path;
            authMgr.checkAuthorize({uid:req.user.uid, action:'fs:deleteAlias', rsc:rsc}, res, next);
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
            if (aliasInfo.owner !== req.user.uid) {
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
 * TODO acl
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
    authMgr.verifyToken,
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

            var rsc = 'fs:' + aliasInfo.fsid + aliasInfo.path;
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
            if (aliasInfo.owner !== req.user.uid) {
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
    authMgr.verifyToken,
    function (req, res, next) {
        var rsc = 'fs:' + req.params.fsid + '/*';
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:getQuotaUsage', rsc:rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var uid = req.user.uid;

        // check FS owner
        var fs = new WebidaFS(fsid);
        fs.getOwner(function (err, owner) {
            if (err) {
                return res.sendfail(err, 'Failed to get filesystem info:');
            }
            if (owner !== uid) {
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
    authMgr.verifyToken,
    function (req, res, next) {
        var rsc = 'fs:' + req.params.fsid + '/*';
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:getQuotaLimit', rsc:rsc}, res, next);
    },
    function (req, res) {
        var fsid = req.params.fsid;
        var uid = req.user.uid;

        // check FS owner
        var fs = new WebidaFS(fsid);
        fs.getOwner(function (err, owner) {
            if (err) {
                return res.sendfail(err, 'Failed to get filesystem info');
            }
            if (owner !== uid) {
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
    rsc.exists(function (exists) {
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
        var uid = req.user && req.user.uid;

        if (wfsUrl.indexOf(';') !== -1) {
            return cb(new ClientError(403, 'You can not use \';\' in the path'));
        }

        var rscDir = new Resource(wfsDir);
        createDirectory(uid, rscDir, true, function (err) {
            if (err) {
                logger.error('failed to create dir', err);
            }
            canWrite(uid, wfsUrl, function (err, writable) {
                // TODO This is not atomic operation. Consider using fs-ext.flock()
                logger.info('writeFile canWrite', arguments);
                if (err) {
                    return cb(err, 'Failed to get user permission');
                }
                if (!writable) {
                    return cb(new ClientError(403, 'Need WRITE permission'));
                }
                var isAborted = false;

                var form = new formidable.IncomingForm();
                var files = [];
                var fields = [];

                form
                    .on('field', function(field, value) {
                        logger.info('field = ', field, 'value = ',  value);
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
                        logger.info('Finished to upload file to tmp directory.');
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
                        Fs.unlink(files.file.path, function (cleanErr) {
                            if (cleanErr) {
                                logger.warn('Write File clean error: ', cleanErr);
                            }
                        });
                    } else {
                        if (fields.length === 0) {
                            Fs.unlink(files.file.path, function (cleanErr) {
                                if (cleanErr) {
                                    logger.warn('Write File clean error: ', cleanErr);
                                }
                                return cb(new ClientError('Additional fields does not exist'));
                            });
                        } else {
                            verifyKsReq(req.user.userId, fsid, fields.keyInfo, files.file.name, function(err) {
                                if (err) {
                                    Fs.unlink(files.file.path, function (cleanErr) {
                                        if (cleanErr) {
                                            logger.warn('Write File clean error: ', cleanErr);
                                        }
                                        return cb(err);
                                    });
                                } else {
                                    writeFile(wfsUrl, files.file.path, function (err) {
                                        Fs.unlink(files.file.path, function (cleanErr) {
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
    });
}


/**
 * Register keystore file
 *
 * @method RESTful API registerKeyStoreFile
 * @param {fsid} - fsid
 * @return {string} - succss or failure
 */

router.post('/webida/api/fs/mobile/ks/:fsid/*', authMgr.verifyToken, function (req, res) {
    var fsid = req.params.fsid;
    var uid = req.user && req.user.uid;

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

    Fs.stat(path, function (error, stats) {
        if (error) {
            return cb(new ClientError(404, 'No such file or directory'));
        }

        if (stats.isFile()) {
            Fs.unlink(path, function (error) {
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

router.delete('/webida/api/fs/mobile/ks/:fsid', authMgr.verifyToken, function (req, res) {
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

router.get('/webida/api/fs/mobile/ks/:fsid', authMgr.verifyToken, function (req, res) {
    var fsid = req.params.fsid;
    var uid = req.user && req.user.uid;

    getKsList(req.user.userId, fsid, function (err, ksList) {
        if (err) {
            return res.sendfail(new ServerError('Can not get keystore informations'));
        }
        return res.sendok(ksList);
    });
});

router.get('/webida/api/fs/lockfile/:fsid/*',
    authMgr.verifyToken,
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
                        db.user.$findOne({userId: lock.userId}, function(err, context){
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

        /*db.lock.$save({lockId: shortid.generate(), userId:userId, email:email, wfsId:fsid, path:path}, function(err) {
            if (err) {
                if (err.code === 11000) {
                    db.lock.$findOne({wfsId:fsid, path:path}, function(err, lock) {
                        var errMsg = 'Already locked by ' + JSON.stringify(lock);
                        return res.sendfail(new ClientError(400, errMsg));
                    });
                } else {
                    return res.sendfail(new ServerError(500, 'lockFile failed.'));
                }
            } else {
                fsChangeNotifyTopics(path, 'fs.lock', uid, req.params.fsid, req.query.sessionID);
                return res.sendok();
            }
        });*/
    }
);


router.get('/webida/api/fs/unlockfile/:fsid/*',
    authMgr.verifyToken,
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
        db.lock.$findOne({key:fsid, path:path}, function(err, context) {
            var lock = context.result();
            logger.info('unlockfile check lock', err, lock);
            if (err) {
                return res.sendfail(new ServerError(500, 'unlockFile failed.'));
            } else if (lock) {
                db.lock.$remove({key:fsid, path:path}, function(err) {
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
    authMgr.verifyToken,
    function (req, res, next) {
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        var rsc = 'fs:' + req.params.fsid + path;
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:readFile', rsc:rsc}, res, next);
    },
    function(req, res) {
        var fsid = req.params.fsid;
        var path = decodeURI(req.params[0]);
        if (path[0] !== '/') {
            path = Path.join('/', path);
        }
        path = new RegExp(path);
        db.lock.$find({key:fsid, path:path}, function(err, context) {
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

router.post('/webida/api/fs/flink/:fsid/*', authMgr.verifyToken, function (req, res) {
    var fsid = req.params.fsid;
    //var uid = req.user && req.user.uid;


    flinkMap.updateFileLink(fsid, filepath, function (err, flinkInfo) {
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

router.get('/webida/api/fs/flink/:fsid/:fileid', authMgr.verifyToken, function (req, res) {
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
            //flinkInfo[0].origpath = tmp;
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

router.get('/webida/api/fs/flinkbypath/:fsid/*', authMgr.verifyToken, function (req, res) {
    var fsid = req.params.fsid;
    var wfsUrl = 'wfs://' + fsid + Path.join('/', decodeURI(req.params[0]));

    var filePath = getPathFromUrl(wfsUrl);
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
            //flinkInfo[0].origpath = tmp;
            return res.sendok(flinkInfo);
        }
    });
});

