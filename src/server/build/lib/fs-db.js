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

var db = require('../../common/db-manager')('user', 'keyStore');
var dao = db.dao;

exports.getDb = function () {
    return dao.keyStore;
};

exports.getKsInfo = function (uid, alias, callback) {
    dao.user.$findOne({uid: uid}, function (err, context) {
        var user = context.result();
        if (err) {
            callback(err);
        } else if (user) {
            dao.keyStore.$find({userId: user.userId, alias: alias}, function(err, context){
                callback(err, context.result());
            });
        } else {
            callback('Unkown User: ' + uid);
        }
    });
};

