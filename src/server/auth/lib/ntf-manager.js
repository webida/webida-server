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

var authMgr = require('../../common/auth-manager');
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

var dnode = require('dnode');
var net = require('net');

var Client = function(mgr, ip, port) {
    this.mgr = mgr;
    this.ip = ip;
    this.port = port;
    this.taskCount = 0;
    this.cb = null;
    this.cb2 = null;
    this.remote = null;
    var that = this;
    this.connect = function (cb) {
        console.log('connecting');
        if (that.cb === null) {
            that.cb = cb;
        }

        var netClient = net.connect(port);
        var d = dnode();
        d.on('remote', function(remote) {
            logger.info('connected - ', remote);
            that.remote = remote;
            that.cb(that);
        });

        netClient.pipe(d).pipe(netClient);
        netClient.on('error', function () {
            reconnect();
        });
        netClient.on('end', function () {
            logger.error('dnode end');
            if (that.cb2) {
                that.cb2();
            }
            reconnect();
        });
        function reconnect() {
            //logger.info('try to reconnect');
            setTimeout(that.connect, 10000);
        }

    }
}

//
// NtfMgr
//
var NtfMgr = function() {
    var inst;
    var self = this;

    this.init = function (ip, port, cb) {
        if (!inst) {
            inst = new Client(self, ip, port);
            inst.connect(cb);
        }
    }

    this.getInst = function () {
        return inst;
    }
}

NtfMgr.prototype.sysnoti = function(info, cb) {
    var cli = this.getInst();
    if (!cli) {
        logger.error('invalid ntf server');
        return false;
    }

    if (!cli.remote) {
        return false;
    }
    cli.remote.sysnoti(info, cb);
    return true;
}

NtfMgr.prototype.sysnoti2 = function(topics, info, cb) {
    var cli = this.getInst();
    if (!cli) {
        logger.error('invalid ntf server');
        return false;
    }

    if (!cli.remote) {
        return false;
    }

    cli.remote.sysnoti2(topics, info, cb);
    return true;
}


var xxx = new NtfMgr;
module.exports.NtfMgr = xxx;


