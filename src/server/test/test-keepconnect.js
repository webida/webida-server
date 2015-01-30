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

/* Chrome and firefox have 2min http timeout.
 * Using utils.keepConnect keeps the connection for longer time.
 */
var http = require('http');
var utils = require('../lib/utils');
var connect = require('connect');
var app = connect()
    .use(utils.keepConnect())
    .use(function (req, res) {
        console.log('req', new Date());
        setTimeout(function () {
            console.log('res', new Date());
            res.end('end');
        }, 180 * 1000);
    });
http.createServer(app).listen(8001);

