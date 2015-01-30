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

var cuid = require('cuid');
var HashMap = require('hashmap').HashMap;
var NtfCommon = require('./notify-common');
var extend = require('./inherit').extend;
var connMsg = require('./conn-msg');
var logger = require('../../common/log-manager');
var authMgr = require('../../common/auth-manager');


var User = NtfCommon.User;
var Err = NtfCommon.NorifyError;
var _MSG = NtfCommon.getNotifyMsg;

var sid = cuid();

var Cli = function (id) {
    this.sid = sid;
    this.id = id;
};

var Client = function (sock, msgProc, mgr) {
    var that = this;
    this.sock = sock;
    this.user = null;
    this.mgr = mgr;
    this.id = cuid();
    this.info = new Cli(this.id);

    msgProc(that, sock);

    this.sendMsg = function (type, msg) {
        if (!that.sock)
            return false;
        logger.debug('send to client: type = ' + type + ', msg = ' + JSON.stringify(msg));
        that.sock.emit(type, msg);
        return true;
    }
};

module.exports.Client = Client;

var ClientMgr = function () {
    this.cliMap = new HashMap();
    this.unauthCliMap = new HashMap();
    this.userMap = new HashMap();
    var self = this;

    this.clear = function () {
        self.cliMap.clear();
        self.unauthCliMap.clear();
        self.userMap.clear();
        logger.info('clear user list');
    }

    this.addUnauth = function (cli) {
        self.unauthCliMap.set(cli.id, cli);
    }

    this.leave = function (cli, isAuth) {
        if (isAuth) {
            self.cliMap.remove(cli.id);
            logger.info('ClientMgr: auth client leaved - ' + JSON.stringify(cli.id));
        } else {
            self.unauthCliMap.remove(cli.id);
            logger.info('ClientMgr: unauth client leaved - ' + JSON.stringify(cli.id));
        }
    }

    this.authorized = function (cli) {
        self.unauthCliMap.remove(cli.id);
        self.cliMap.set(cli.id, cli);
        logger.info('ClientMgr: client authorized - ', JSON.stringify(cli.id));
    }

    this.find = function (cli) {
        logger.info('cli -', cli);
        var tmp = self.cliMap.get(cli.id);
        if (!tmp) {
            logger.error('can\'t find client: ' + JSON.stringify(cli) + Error.stack);
            return null; 
        }
        return tmp;
    }

    this.sendToClient = function (cli, type, msg) {
        var tmp = self.find(cli);
        if (tmp) {
            return tmp.sendMsg(type, msg);
        }
    } 
};



module.exports.ClientMgr = ClientMgr;


