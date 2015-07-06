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

var dataMapperConf = require('../conf/data-mapper-conf.json');
var dataMapper = require('data-mapper').init(dataMapperConf);
var Transaction = dataMapper.Transaction;

function DBManager(daos) {
    this.dao = {};
    if (daos && daos.length > 0) {
        for (var i = 0, n = daos.length; i < n; i++) {
            var daoName = daos[i];
            if (typeof daoName === 'string') {
                this.dao[daoName] = dataMapper.dao(daoName);
            }
        }
    }
}

DBManager.prototype.transaction = function (tasks, callback) {
    new Transaction(tasks).start(callback);
};

DBManager.use = function () {
    return new DBManager(arguments);
};

module.exports = DBManager.use;