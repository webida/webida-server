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

var db = require('./common/db-manager')('system');
var dao = db.dao;

db.transaction([
    dao.system.dropTokenTable(),
    dao.system.dropCodeTable(),
    dao.system.dropClientTable(),
    dao.system.dropSequenceTable(),
    dao.system.dropPolicySubjectTable(),
    dao.system.dropPolicyTable(),
    dao.system.dropSubjectTable(),
    dao.system.dropGroupUserTable(),
    dao.system.dropGroupTable(),
    dao.system.dropTempKeyTable(),
    dao.system.dropUserTable()
], function (err) {
    if (err) {
        console.log('uninstall failed.', err);
    } else {
        console.log('uninstall successfully completed.');
    }
    process.exit();
});

