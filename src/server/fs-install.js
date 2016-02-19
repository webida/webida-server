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
var fsMgr = require('./fs/lib/fs-manager');

var db = require('./common/db-manager')('system', 'sequence');
var dao = db.dao;

db.transaction([
    dao.system.createWfsTable(),
    dao.system.createGcmInfoTable(),
    dao.system.createWfsDelTable(),
    dao.system.createKeyStoreTable(),
    dao.system.createLockTable(),
    dao.system.createDownloadLinkTable(),
    dao.system.createAliasTable(),
    function (context, next) {
        dao.sequence.$save({space:'wfs', currentSeq: 0}, next);
    }
], function (err) {
    if (err) {
        console.log('Creating FS tables failed.\n' + err.message);
        process.exit(1);
    }
    fsMgr.doAddNewFS(100000, 'xkADkKcOW', function (err, fsinfo) {
        if (err || !fsinfo) {
            console.log('Creating webida FS for template engine failed.');
            process.exit(1);
        } else {
            fsMgr.doAddNewFS(100000, 'gJmDsuhUN', function (err, fsinfo) {
                if (err || !fsinfo) {
                    console.log('Creating webida FS for wikidia failed.');
                    process.exit(1);
                } else {
                    console.log('FS server is initialized successfully');
                    process.exit();
                }
            });
        }
    });
});

