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

var path = require('path');
var fs = require('fs');
var qfs = require('q-io/fs');
var async = require('async');
var Q = require('q');
var _ = require('underscore');

var exec = require('child_process').exec;
var util = require('util');
var logger = require('../../../common/log-manager');
var config = require('../../../common/conf-manager').conf;
var WebidaFS = require('../webidafs').WebidaFS;

var db = require('../webidafs-db').getDb();
//var wfsConfCol = db.collection('wfs_conf');

var XFS_UTIL = path.join(__dirname, 'xfs_util.sh');

function getNewProjectId() {
    var deferred = Q.defer();
    db.transaction([
        db.sequence.updateSequence({space: 'wfs'}),
        function (context, next) {
            db.sequence.getSequence({space: 'wfs'}, function (err, context) {
                var result = context.result();
                if (err) {
                    return next(err);
                } else {
                    if (result[0].seq > result[0].maxSeq) {
                        return next('The number of project reached the max limit.');
                    } else {
                        context.data('seq', result[0].seq);
                        return next(null);
                    }
                }
            }, context);
        }
    ], function (err, context) {
        if (err) {
            logger.info('Failed to get new projectid', err);
            return deferred.reject('Failed to get new projectid');
        } else {
            logger.info('getNewProjectId', context.data('seq'));
            deferred.resolve(context.data('seq'));
        }
    });

    /*wfsConfCol.findAndModify({
        query: {name: 'wfs_conf'},
        update: {$inc: {maxProjectId: 1}},
        new: true,
        upsert: true
    }, function (err, newWfsConf, lastErrorObject) {
        if (err || !newWfsConf) {
            logger.info('Failed to get new projectid', err, newWfsConf, lastErrorObject);
            return deferred.reject('Failed to get new projectid');
        }
        logger.info('getNewProjectId', newWfsConf);
        deferred.resolve(newWfsConf.maxProjectId);
    });*/
    return deferred.promise;
}
exports.getNewProjectId = getNewProjectId;

function addProject(fsid, rootPath) {
    return getNewProjectId().then(function (projid) {
        var cmd = XFS_UTIL + ' add "' + rootPath + '" "' + fsid + '" ' + projid;
        var cmdProc = exec(cmd, function (err, stdout, stderr) {
            logger.info('addProject', cmd, arguments);
            if (err) {
                return new Error('Failed addProject');
            }
        });
    });
}
exports.addProject = addProject;

function delProject(fsid) {
    var defer = Q.defer();
    var cmd = XFS_UTIL + ' remove "' + fsid + '"';
    var cmdProc = exec(cmd, function (err, stdout, stderr) {
        logger.info('delProject', cmd, arguments);
        if (err) {
            return defer.reject(new Error('Failed delProject'));
        }
        defer.resolve();
    });
    return defer.promise;
}
exports.delProject = delProject;

function initProject(fsid) {
    var defer = Q.defer();
    var wfs = new WebidaFS(fsid);
    var cmd = 'sudo xfs_quota -xc "project -s ' + fsid + '"';
    var cmdProc = exec(cmd, function (err, stdout, stderr) {
        logger.info('initProject', cmd, arguments);
        if (err) {
            return defer.reject(new Error('Failed initProject'));
        }
        defer.resolve();
    });
    return defer.promise;
}

function createFS(fsid, callback) {
    var defer = Q.defer();
    var rootPath = path.resolve((new WebidaFS(fsid)).getRootPath(), '.');
    qfs.makeTree(rootPath).then(function () {
        return addProject(fsid, rootPath);
    }).then(function () {
        return initProject(fsid);
    }).then(function () {
        return setQuotaLimit(fsid, config.services.fs.fsPolicy.fsQuotaInBytes);
    }).then(function () {
        handleCallback(callback);
        defer.resolve();
    }).fail(function (e) {
        console.log('xfs.createFS failed', e);
        handleCallback(callback, e);
        defer.reject(e);
    });
    return defer.promise;
}
exports.createFS = createFS;

function deleteFS(fsid, callback) {
    // Do nothing here and remove it from batch job
    var defer = Q.defer();
    delProject(fsid).then(function () {
        handleCallback(callback);
        defer.resolve();
    }).fail(function (e) {
        console.log('xfs.deleteFS failed', e);
        handleCallback(callback, e);
        defer.reject(e);
    });
    return defer.promise;
}
exports.deleteFS = deleteFS;

function doesSupportQuota() {
    return true;
}
exports.doesSupportQuota = doesSupportQuota;

function getQuotaInfo(fsid, callback) {
    function parseLine(line) {
        var result = {};
        var arr = _.compact(line.split(/\s/));
        if (arr.length < 6) {
            return null;
        }
        result.projid = arr[0];
        result.used = parseInt(arr[1], 10) * 1024;
        result.soft = parseInt(arr[2], 10) * 1024;
        result.hard = parseInt(arr[3], 10) * 1024;
        return result;
    }
    function parseResult(tableStr) {
        var lines = tableStr.split('\n');
        var info;
        for (var i = 0; i < lines.length; i++) {
            info = parseLine(lines[i]);
            if (info && info.projid === fsid) {
                return info;
            }
        }
        return null;
    }
    var defer = Q.defer();
    var cmd = 'sudo xfs_quota -xc "report -N"';
    var cmdProc = exec(cmd, function (err, stdout, stderr) {
        logger.info('getQuotaInfo', cmd, arguments);
        if (err) {
            logger.error('Failed getQuotaInfo', err);
            handleCallback(callback, err);
            return defer.reject(err);
        }
        var result = parseResult(stdout);
        logger.info('getQuotaInfo info', fsid, result);
        if (!result) {
            var err = 'Cannot find quota info';
            logger.error(err);
            handleCallback(callback, err);
            return defer.reject(err);
        }
        handleCallback(callback, null, result);
        defer.resolve(result);
    });
    return defer.promise;
}
exports.getQuotaInfo = getQuotaInfo;

function getQuotaLimit(fsid, callback) {
    var defer = Q.defer();
    getQuotaInfo(fsid).then(function (info) {
        handleCallback(callback, null, info.hard);
        defer.resolve(info.hard);
    }).fail(function (e) {
        handleCallback(callback, e);
        defer.reject(e);
    });
    return defer.promise;
}
exports.getQuotaLimit = getQuotaLimit;

function setQuotaLimit(fsid, limitBytes, callback) {
    var defer = Q.defer();
    var wfs = new WebidaFS(fsid);
    var cmd = util.format('sudo xfs_quota -xc "limit -p bhard=%s %s"', limitBytes, fsid);
    var cmdProc = exec(cmd, function (err, stdout, stderr) {
        logger.info('setQuotaLimit', cmd, arguments);
        if (err) {
            logger.error('Failed setQuotaLimit', err);
            handleCallback(callback, err);
            return defer.reject(err);
        }
        handleCallback(callback);
        defer.resolve();
    });
    return defer.promise;
}
exports.setQuotaLimit = setQuotaLimit;

function getQuotaUsage(fsid, callback) {
    var defer = Q.defer();
    getQuotaInfo(fsid).then(function (info) {
        handleCallback(callback, null, info.used);
        defer.resolve(info.used);
    }).fail(function (e) {
        handleCallback(callback, e);
        defer.reject(e);
    });
    return defer.promise;
}
exports.getQuotaUsage = getQuotaUsage;

function handleCallback(callback) {
    if (typeof callback === "function") {
        var args = Array.prototype.slice.call(arguments);
        args.shift();

        callback.apply(null, args);
    }
}
