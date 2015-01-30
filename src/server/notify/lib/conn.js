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

var Path = require('path');
var express = require('express');
var http = require('http');
var HashMap= require('hashmap').HashMap;

var cuid = require('cuid');

var authMgr = require('../../common/auth-manager');
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;

var ntf = require('./ntf-client');
var ClientMgr = require('./client-manager').ClientMgr;
var Client = require('./client-manager').Client;
var connMsg = require('./conn-msg');
var app = express();
var cliMgr = new ClientMgr();

connMsg.setNtfSvr(ntf.CliMgr);


module.exports.onClientConnected = function (sock, cb) {
    logger.info('client connected:', sock.id);

    var cli = new Client(sock, connMsg.msgProc, cliMgr);
    cliMgr.addUnauth(cli);
    cli.sendMsg('ready', { msg: 'Welcome to notify server!!'}); 

    cb(cli);
}

module.exports.onClientDisconnected = function (cli) {
    //cliMgr.leave(cli);
}


/*
io.sockets.on('connection', function(sock) {
    logger.info('client connected:', sock.id);

    var cli = new Client(sock, connMsg.msgProc, cliMgr);
    cliMgr.addUnauth(cli);
    cli.sendMsg('ready', { msg: 'Welcome to notify server!!'}); 
    
});
*/

var onUserNtf = function (toCli, type, msg) {
    logger.debug('user notify to client:', msg);
    cliMgr.sendToClient(toCli, type, msg);
}

var onSysNtf = function (toCli, type, msg) {
    logger.debug('system notify to client');
    cliMgr.sendToClient(toCli, type, msg);
}


var onDisconnectNtf = function () {
    cliMgr.clear();
}

ntf.CliMgr.connect('127.0.0.1', config.ntf.port, onDisconnectNtf, function (cli) {
    ntf.CliMgr.register('userNtf', onUserNtf);
    ntf.CliMgr.register('sysNtf', onSysNtf);
});

//ntf.CliMgr.register('notify', onNotify);


