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

'use strict'

var logger = require('../../common/log-manager');



var eResult = {
    'succ' : 0,
    'fail' : 0xff
};

module.exports.eResult = eResult;


var NotifyError = {
    'succ' : { code : eResult.succ, msg : 'success' } ,
    'authInvalidToken' : { code : 1, msg : 'invalid token' }, 
    'authFailLoginNS' : { code : 2, msg : 'failed to login to notification server.' },
    'fail' : { code : eResult.fail, msg : 'failed' } 
};

module.exports.NotifyError = NotifyError;

var NotifyMsgType = {
    'auth' : 10000,
    'authAns' : 10001
};

var NotifyMsg = function (err, data) {
    this.errcode = err;
    this.data = data;
};

module.exports.NotifyMsg = NotifyMsg;

module.exports.getNotifyMsg = function (err, data) {
    var msg = new NotifyMsg(err, data);
    return msg;
};

var User = function (usn, nick, param) {
    this.usn = usn;
    this.nick = nick;
    this.email = email;
    this.param = param;
};

module.exports.User = User;


