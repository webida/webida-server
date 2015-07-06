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

var async = require('async');
//var db = require('mongojs').connect(conf.db.fsDb, ['wfs']);
var fs = require('fs');
var path = require('path');
var linuxfs = require('./fs/lib/linuxfs/' + conf.services.fs.linuxfs);

var db = require('./common/db-manager')('wfs', 'system');
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
    /*db.wfs.find({}, {_id:0}, function (err, infos) {
        if (err) {
            return callback('Failed to get filesystem infos');
        }

        async.each(infos, function(info, cb) {
            linuxfs.deleteFS(info.fsid, cb);
        }, function(err) {
            console.log('delete linuxFS', err);
            return callback(err);
        });
    });*/
}

function deleteFiles(callback) {
    console.log('delete Files');
    var src = conf.services.fs.fsPath;
    var dest = path.normalize(conf.services.fs.fsPath + '/../uninstalled-' + Date.now());

    fs.mkdir(dest, function(err) {
        if (err && err.errno !== 47) {
            console.log('mkdir failed.', err);
            return callback('Failed to create uninstalled directory');
        }

        fs.rename(src, dest, function(err) {
            console.log('delete files', err);
            if (err && err.errno !== 34) {
                return callback(err);
            }

            fs.mkdir(src, function (err) {
                if (err && err.errno !== 47) {
                    console.log('mkdir failed.', err);
                    return callback('Failed to create uninstalled directory');
                }

                return callback(null);
            });
        });
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
        dao.system.dropGcmInfoTable()
    ], callback);
    /*db.dropDatabase(function(err) {
        console.log('drop database webida_fs', err);
        return callback(err);
    });*/
}

async.waterfall([
    deleteLinuxFS,
    deleteFiles,
    deleteMongoTable
], function (err/*, results*/) {
    if (err) {
        console.error('uninstall failed.', err, err.stack);
    } else {
        console.log('uninstall successfully completed.');
    }
    process.exit();
});
