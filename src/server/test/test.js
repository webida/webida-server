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

var assert = require('assert');

var db = require('../common/db-manager')('user');
var dao = db.dao;

process.env.WEBIDA_DIR = '../';
process.env.PWD = '../';

dao.user.addUser({id: 0, name: 'username', phone: '111-222-3333'}, function (err, result) {
    if (!err) {
        assert.equal(result.affectedRows, 1);
        assert.equal(result.insertId, 0);
        dao.user.deleteUserById({id: 0}, function (err, result) {
            if (!err) {
                assert.equal(result.affectedRows, 1);
            } else {
                console.error(err);
            }
        });
    } else {
        console.error(err);
    }
});
