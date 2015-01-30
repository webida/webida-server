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
    this.connect = function (cb2, cb) {
        console.log('connecting');
        if (that.cb === null) {
            that.cb = cb;
        }
        if (that.cb2 === null) {
            that.cb2 = cb2;
        }
        var netClient = net.connect(port);
        var d = dnode();
        d.on('remote', function(remote){
            logger.info('connected - ', remote);
            that.remote = remote;
            that.cb(that)
            //onConnect(remote);
        })
        
        netClient.pipe(d).pipe(netClient);
        netClient.on('error', function () {
            logger.error('dnode error');
            if (that.cb2) {
                that.cb2();
            }
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
            logger.info('try to reconnect')
            setTimeout(that.connect, 2000)
        }
       
    } 
    var onConnect = function(remote) {
        that.remote = remote;
        that.mgr.onConnected(that);
    } 

    //connect(that.port, this);
}

Client.prototype.ref = function () {
    this.taskCount++;
    return this;
}

Client.prototype.unref = function() {
    this.taskCount--;
}

//
// CliMgr
//
var CliMgr = function() {
    this.clilist = new Array();
    this.minIndex = 0;
    var self = this;
    this.connect  = function(ip, port, cb2, cb) {
        var cli = new Client(self, ip, port);
        self.addClient(cli);
        cli.connect(cb2, cb);
    }    
}

CliMgr.prototype.getIdle = function () {
    return this.clilist[0]; //.ref();            
}
    
CliMgr.prototype.addClient = function (cli) {
   this.clilist.push(cli);
}

CliMgr.prototype.login = function(user, cli, cb) {
    var idle = this.getIdle();
    if (!idle) {
        logger.error('invalid ntf server');
        return false;
    }
    idle.remote.enter(user, cli, cb);
    return true;
}

CliMgr.prototype.logout = function(user, cli, cb) {
    var idle = this.getIdle();
    if (!idle) {
        logger.error('invalid ntf server');
        return false;
    }
    idle.remote.leave(user, cli, cb);
    return true;
}

CliMgr.prototype.sub = function(user, cli, info, cb) {
    var idle = this.getIdle();
    if (!idle) {
        logger.error('invalid ntf server');
        return false;
    }

    idle.remote.sub(user, cli, info, cb);
    return true;
}

CliMgr.prototype.sub2 = function(user, cli, info, cb) {
    var idle = this.getIdle();
    if (!idle) {
        logger.error('invalid ntf server');
        return false;
    }

    idle.remote.sub2(user, cli, info, cb);
    return true;
}

CliMgr.prototype.unsub = function(user, cli, info, cb) {
    var idle = this.getIdle();
    if (!idle) {
        logger.error('invalid ntf server');
        return false;
    }

    idle.remote.unsub(user, cli, info, cb);
    return true;
}

CliMgr.prototype.unsub2 = function(user, cli, info, cb) {
    var idle = this.getIdle();
    if (!idle) {
        logger.error('invalid ntf server');
        return false;
    }

    idle.remote.unsub2(user, cli, info, cb);
    return true;
}

CliMgr.prototype.pub = function(user, cli, info, cb) {
    var idle = this.getIdle();
    if (!idle) {
        logger.error('invalid ntf server');
        return false;
    }

    idle.remote.pub(user, cli, info, cb);
    return true;
}

CliMgr.prototype.register = function(name, cb) {
    var idle = this.getIdle();
    if (!idle) {
        logger.error('invalid ntf server');
        return false;
    }

    idle.remote.register(name, cb);
    return true;
}

CliMgr.prototype.onConnected = function (cli) {


}


var xxx = new CliMgr;
module.exports.CliMgr = xxx; //CliMgr;



