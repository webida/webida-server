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

var logger = require('./log-manager');


var nSvr = function (svc, svrName, conf) {
    this.svc = svc;
    this.name = svrName;
    this.config = conf;

    logger.log('debug','## based server (%s) created', svrName);
};


nSvr.prototype.start = function () {

}


nSvr.prototype.stop = function () {

}

nSvr.prototype.onStarted = function () {

}


nSvr.prototype.onStopped = function () {

}


exports.nSvr = nSvr;


