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

var conf = require('webida-server-lib/lib/conf-manager').conf;

var async = require('async');
var fs = require('fs');
var path = require('path');
var linuxfs = require('./lib/linuxfs/' + conf.linuxfs);

var db = require('../common/db-manager')('wfs', 'system');
var dao = db.dao;

function deleteLinuxFS(callback) {
    dao.wfs.$find(function (err, context) {
        var infos = context.result();
        if (err) {
            return callback('Failed to get filesystem infos');
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
    var src = conf.fsPath;
    var dest = path.normalize(conf.fsPath + '/../uninstalled-' + Date.now());

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

            fs.mkdir(src, function(err) {
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
    db.transaction([
        dao.system.dropAliasTable(),
        dao.system.dropDownloadLinkTable(),
        dao.system.dropLockTable(),
        dao.system.dropKeyStoreTable(),
        dao.system.dropWfsDelTable(),
        dao.system.dropWfsTable(),
        dao.system.dropGcmInfoTable()
    ], callback);
}

async.series([
    deleteLinuxFS,
    deleteFiles,
    deleteMongoTable
], function (err/*, results*/) {
    if (err) {
        console.log('uninstall failed.', err);
    } else {
        console.log('uninstall successfully completed.');
    }

    process.exit();
});
