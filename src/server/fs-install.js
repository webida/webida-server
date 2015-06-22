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

var dataMapperConf = require('./conf/data-mapper-conf.json');
var dataMapper = require('data-mapper').init(dataMapperConf);
var schemaDao = dataMapper.dao('system');
var Transaction = dataMapper.Transaction;

new Transaction([
    schemaDao.createWfsTable(),
    schemaDao.createGcmInfoTable(),
    schemaDao.createWfsDelTable(),
    schemaDao.createKeyStoreTable(),
    schemaDao.createLockTable(),
    schemaDao.createDownloadLinkTable(),
    schemaDao.createAliasTable()
]).start(function (err) {
    if (err) {
        console.log('Creating FS tables failed.');
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

