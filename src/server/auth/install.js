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
var auth = require('./lib/user-manager');

/*
 * 1. Create "webida" account.
 * 2. Create personal access token belong "webida" account.
 * 3. Register the system apps to client db.
 * 4. Create the mysql table for acl.
 *    4-1. webida_user;        // user account db
 *    4-2. webida_group;       // group db
 *    4-3. webida_groupuser;   // user-group relation db
 *    4-4. webida_usertype;    // id type(user or group) db
 *    4-5. webida_userpolicy;  // id-policy relation db
 *    4-6. webida_policy;      // policy db
 *    4-7. webida_rsccheck;    // policy cache db to speedup the authorization check time
 */
auth.init(function (err) {
    if(err) {
        console.log('Failed to initialize auth server', err, err.stack);
        process.exit(1);
    } else {
        console.log('Auth server is initialized successfully');
        process.exit();
    }
});

