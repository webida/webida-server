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

//var async = require('async');
//var mysql = require('mysql');
//var conf = require('./common/conf-manager').conf;
//var conn = mysql.createConnection(conf.db.mysqlDb);
//var mongojs = require('mongojs');
//var db = mongojs(conf.db.authDb);

var dataMapperConf = require('../../conf/data-mapper-conf.json');
var dataMapper = require('data-mapper').init(dataMapperConf);
var schemaDao = dataMapper.dao('system');
var Transaction = dataMapper.Transaction;

/*conn.connect(function (err) {
    if (err) {
        console.log('[uninstall] error mysql connecting: ' + err.stack);
    }
    console.log('[uninstall] connected as id ' + conn.threadId);
});*/

/*var mysqlTables = [
    'webida_group',
    'webida_groupuser',
    'webida_policy',
    'webida_rsccheck',
    'webida_user',
    'webida_userpolicy',
    'webida_usertype'
];

function deleteMySQLTable(callback) {
    async.each(mysqlTables, function(table, cb) {
        conn.query('DROP TABLE '+table, function(err){
            console.log('deleteMySQLTable drop table', table, err);
            return cb(err);
        });
    }, function(err) {
        console.log('deleteMySQLTable completed', err);
        return callback(err);
    });
}

function deleteMongoTable(callback) {
    db.dropDatabase(function(err) {
        console.log('drop database webida_auth', err);
        return callback(err);
    });
}*/

new Transaction([
    schemaDao.dropTokenTable(),
    schemaDao.dropCodeTable(),
    schemaDao.dropClientTable(),
    schemaDao.dropSequenceTable(),
    schemaDao.dropPolicySubjectTable(),
    schemaDao.dropPolicyTable(),
    schemaDao.dropSubjectTable(),
    schemaDao.dropGroupUserTable(),
    schemaDao.dropGroupTable(),
    schemaDao.dropTempKeyTable(),
    schemaDao.dropUserTable()
]).start(function(err){
    if(err){
        console.log('uninstall failed.', err);
    } else {
        console.log('uninstall successfully completed.');
    }
    process.exit();
});

/*async.series([
    deleteMySQLTable,
    deleteMongoTable
], function(err*//*, results*//*) {
    if (err) {
        console.log('uninstall failed.', err);
    } else {
        console.log('uninstall successfully completed.');
    }
    process.exit();
});*/


