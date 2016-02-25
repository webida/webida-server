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

var conf = require('./common/conf-manager').conf;
var exec = require('child_process').exec;
var async = require('async');
var fs = require('fs');
var path = require('path');
var linuxfs = require('./fs/lib/linuxfs/' + conf.services.fs.linuxfs);

var db = require('./common/db-manager')('wfs', 'system', 'sequence');
var dao = db.dao;

function deleteLinuxFS(callback) {
    console.log('delete LinuxFS');
    dao.wfs.$find(function (err, context) {
        var infos = context.result();
        if (err) {
            return callback(err);
        }

        async.each(infos, function (info, cb) {
            linuxfs.deleteFS(info.key, cb);
        }, function (err) {
            console.log('delete linuxFS', err);
            return callback(err);
        });
    });
}

function deleteFiles(callback) {
    console.log('delete Files');
    var src = conf.services.fs.fsPath;
    var dest = path.normalize(conf.services.fs.fsPath + '/../uninstalled-' + Date.now());

    function _remove(file) {
        var cmdRemove = 'rm -rf ' + src + '/' + file

        console.log('... delete file: ' + file);
        exec(cmdRemove, function (err) {
            if (err) {
                return callback(err);
            }
        });
    }

    function _move(file) {
        var srcPath = src + '/' + file;
        var destPath = dest + '/' + file;

        fs.mkdir(destPath, function(err) {
            var cmdCopy = 'cp -a ' + srcPath + '/. ' + destPath;

            if (err && err.errno !== 47) {
                console.log('mkdir failed.', err);
                return callback('Failed to create uninstalled directory');
            }

            // ~/fs/* copy to ~/../uninstalled-*
            exec(cmdCopy, function (err) {
                if (err) {
                    return callback(err);
                }
                _remove(file)
            });
        });
    }

    fs.mkdir(dest, function (err) {
        if (err && err.errno !== 47) {
            console.log('mkdir failed.', err);
            return callback('Failed to create uninstalled directory');
        }

        fs.readdir(src, function (err, files) {
            if(err) {
                return callback('Failed to read ' + src + 'directory');
            }

            console.log('Move all fs/* files to ' + dest + ' directory');
            files.forEach(function (file) {
                _move(file);
            });
            callback();
        });
    });
}

function deleteDockerContainer(callback) {
    var cmd = 'docker rm -f $(docker ps -a -q)';

    console.log('remove docker container');
    exec(cmd, function (err) {
        callback(err);
    });
}

function deleteMongoTable(callback) {
    console.log('delete Tables');
    db.transaction([
        dao.system.dropAliasTable(),
        dao.system.dropDownloadLinkTable(),
        dao.system.dropLockTable(),
        dao.system.dropKeyStoreTable(),
        dao.system.dropWfsDelTable(),
        dao.system.dropWfsTable(),
        dao.system.dropGcmInfoTable(),
        function (context, next) {
            dao.sequence.$remove({space:'wfs'}, function (err) {
                if (err) {
                    next(err);
                }
                next();
            }, context);
        }
    ], callback);
}

async.waterfall([
    deleteLinuxFS,
    deleteFiles,
    deleteDockerContainer,
    deleteMongoTable
], function (err/*, results*/) {
    if (err) {
        console.error('uninstall failed.', err, err.stack);
    } else {
        console.log('uninstall successfully completed.');
    }
    process.exit();
});
