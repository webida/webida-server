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

var _ = require('underscore');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var logger = require('../../../common/log-manager');
var config = require('../../../common/conf-manager').conf;

var WebidaFS = require('../webidafs').WebidaFS;
var defaultLinuxFS = require('./default');

function doesSupportQuota() {
    return true;
}
exports.doesSupportQuota = doesSupportQuota;

/**
 * @param {function} callback - 
 *                  (error,
 *                   {qgroupid: <qgroupid>,
 *                   rfer: <current usage>, // in bytes
 *                   excl: <current exclusive usage>, // in bytes
 *                   max_rfer: <quota limit>} // in bytes
 *                  )
 */
function getQuotaInfo(fsid, callback) {
    function parseResult(tableStr) {
        var result = {};
        var arr = _.compact(tableStr.split(/\s/));
        result[arr[0]] = arr[8];
        result[arr[1]] = parseInt(arr[9], 10);
        result[arr[2]] = parseInt(arr[10], 10);
        result[arr[3]] = parseInt(arr[11], 10);
        return result;
    }
    var wfs = new WebidaFS(fsid);
    var rootPath = wfs.getRootPath();
    var cmd = 'sudo btrfs qgroup show -rf "' + rootPath + '"';
    exec(cmd, function (err, stdout) {
        logger.info('getQuotaInfo', cmd, arguments);
        if (err) {
            return callback(new Error('Failed to get current usage:' + fsid));
        }
        callback(null, parseResult(stdout));
    });
}
exports.getQuotaInfo = getQuotaInfo;

function setQuotaLimit(fsid, limitBytes, callback) {
    var wfs = new WebidaFS(fsid);
    var rootPath = wfs.getRootPath();
    var cmd = 'sudo btrfs qgroup limit ' + limitBytes + ' "' + rootPath + '"';
    exec(cmd, function (err) {
        logger.info('setQuota', cmd, arguments);
        if (err) {
            return callback(new Error('Failed to set quota:' + fsid));
        }
        callback();
    });
}
exports.setQuotaLimit = setQuotaLimit;

function getQuotaUsage(fsid, callback) {
    getQuotaInfo(fsid, function (err, qinfo) {
        if (err) {
            return callback(new Error('Failed to get quota info'));
        }
        callback(null, qinfo.rfer);
    });
}
exports.getQuotaUsage = getQuotaUsage;

function getQuotaLimit(fsid, callback) {
    getQuotaInfo(fsid, function (err, qinfo) {
        if (err) {
            return callback(new Error('Failed to get quota info'));
        }
        /* jshint camelcase: false */
        callback(null, qinfo.max_rfer);
    });
}
exports.getQuotaLimit = getQuotaLimit;

function createFS(fsid, callback) {
    var wfs = new WebidaFS(fsid);
    var rootPath = wfs.getRootPath();
    var cmd = 'btrfs';
    var args = ['subvolume', 'create', rootPath];
    var cmdProc = spawn(cmd, args);
    logger.info('createFS btrfs command', fsid, cmd, args);

    cmdProc.stdout.on('data', function (data) {
        logger.info('STDOUT', fsid, cmdProc.pid, data.toString());
    });
    cmdProc.stderr.on('data', function (data) {
        logger.info('STDERR', fsid, cmdProc.pid, data.toString());
    });
    cmdProc.on('exit', function (code, signal) {
        logger.info('EXIT', fsid, cmdProc.pid, code, signal);
        if (code === 0) {
            setQuotaLimit(fsid, config.fsPolicy.fsQuotaInBytes, callback);
        } else {
            callback(new Error('EXIT with error'));
        }
    });
}
exports.createFS = createFS;

exports.deleteFS = defaultLinuxFS.deleteFS;
