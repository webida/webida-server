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

var appMgr = require('./app/lib/app-manager');
var logger = require('./common/log-manager');

// Install system apps in DB
var UID_WEBIDA_ACCOUNT = 100000;
appMgr.init(UID_WEBIDA_ACCOUNT, function(err) {
    if(err) {
	logger.debug('Failed to initialize AppMgr', err, err.stack);
	process.exit(1);
    } else {
	logger.info('AppMgr is initialized successfully');
	process.exit();
    }
});

