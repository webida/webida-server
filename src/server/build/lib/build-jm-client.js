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

var jmClient = function(ip, port) {
    this.ip = ip;
    this.port = port;
    this.taskCount = 0;
    this.remote = null;
    var that = this;
    function connect() {
        console.log('connecting'+ ip + ':' + port);
        var netClient = net.connect(port);
        var dnodeClient = dnode({name:function(cb){cb('client')}});
        dnodeClient.on('remote',function(remote){
            logger.info('connected - ', remote);
            onConnect(remote);
        })
        netClient.pipe(dnodeClient).pipe(netClient);
        netClient.on('error', reconnect);
        netClient.on('end', reconnect);
        function reconnect() {
            console.info('build-jm-client: try to reconnect')
            setTimeout(connect, 2000)
        }
    } 
    var onConnect = function(remote) {
        that.remote = remote;
    } 

    function tryconnect() {
        connect();
    }
    var reconnect = function(remote) {
        console.log('build-jm-client: try to reconnect')
        setTimeout(tryconnect, 2000)
    }
    connect(that.port, this);
}

jmClient.prototype.ref = function () {
    this.taskCount++;
    return this;
}

jmClient.prototype.unref = function() {
    this.taskCount--;
}


//
//jmCliMgr
//

var jmCliMgr = function() {
    console.info('@@@@@@@@@@@@@@@@@@ jmCliMgr @@@@@@@@@@@@@@@@@@2');
    this.clilist = new Array();
    this.minIndex = 0;
}

jmCliMgr.prototype.getIdle = function () {
    return this.clilist[0].ref();            
}
    
jmCliMgr.prototype.addClient = function (cli) {
  this.clilist.push(cli);
}

jmCliMgr.prototype.buildTask = function(task, cb) {
    var idle = this.getIdle();
    console.info(idle);
    if (!idle) {
        return false; //cb(99, 'there is no active job manager');
    }
    idle.remote.buildTask(task, cb);
    return true;
}

jmCliMgr.prototype.rebuildTask = function(task, cb) {
    var idle = this.getIdle();
    console.info(idle);
    if (!idle) {
        return false; //cb(99, 'there is no active job manager');
    }
    idle.remote.rebuildTask(task, cb);
    return true;
}

jmCliMgr.prototype.cleanTask = function(task, cb) {
    var idle = this.getIdle();
    console.info(idle);
    if (!idle) {
        return false; //cb(99, 'there is no active job manager');
    }

    idle.remote.cleanTask(task, cb);
    return true;
}


var xxx = new jmCliMgr;
module.exports.jmCliMgr = xxx; //jmCliMgr;

module.exports.connect  = function(ip, port) {
    var cli = new jmClient(ip, port);
    console.info(jmCliMgr);
    xxx.addClient(cli);
}


