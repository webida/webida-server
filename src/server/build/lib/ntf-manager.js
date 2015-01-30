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
var sio = require('socket.io');
var HashMap= require('hashmap').HashMap;

var cuid = require('cuid');

var logger = require('../../common/log-manager');

var app = express();

var taskMap = new HashMap();
var taskStateMap = new HashMap();

var httpServer = http.createServer(app).listen(5007, function (req, res) {
    logger.info('notify server has been started');
});

var io = sio.listen(httpServer);

function flushStatus2(arrMsg, cli) {
    for (var i=0; i< arrMsg.length; i++) {
        cli.emit('status', { status: arrMsg[i] });
    }
    arrMsg.length = 0;

}

function flushStatus(taskId, cli) {
    var arrMsg = taskStateMap.get(taskId); 
    if (!arrMsg || arrMsg.length == 0) {
        return;   
    }

    flushStatus2(arrMsg, cli);
}

io.sockets.on('connection', function(client) {
    logger.info('client connected:', client.id);

    client.emit('ready', { msg: 'Welcome to the notify server!!'});
    
    client.on('getBuildStatus', function(task) {
        logger.info('getBuildStatus = ' + JSON.stringify(task));
        logger.info('taskId = ' + JSON.stringify(task.taskId));
        var dummy = taskMap.get(task.taskId);
        if (!dummy) {
            var errMsg = 'invalid task id';
            logger.error(errMsg);
            client.emit('invalid', errMsg);
            return;
        }
        client.taskId = task.taskId;
        taskMap.set(task.taskId, client); 
        flushStatus(task.taskId, client); 
    });

    client.on('disconnect', function() {
        logger.info('client(' + client.id + ') is disconnected');
        logger.info('task(' + client.taskId + ') will be removed due to disconnecting');
        taskMap.remove(client.taskId); 
        taskStateMap.remove(client.taskId); 
    });

});

module.exports.registerTask = function (taskId) {
    //TODO : need to clean the unused task id
    taskMap.set(taskId, 'dummy'); 
    taskStateMap.set(taskId, new Array());
}

module.exports.ntf_to_client = function (taskId, msg, cb) {
    var cli = taskMap.get(taskId);
    if (!cli) {
        var errMsg = 'client does not exist';
        logger.error(errMsg);
        return cb(1, errMsg);
    }
    var arrMsg = taskStateMap.get(taskId); 
    if (!arrMsg) {
        arrMsg = new Array();   
    }
    arrMsg.push(msg);
    console.log('msg length = ', arrMsg.length);
    if (cli === 'dummy') {
        logger.info('dummy----------------------');
        return cb(0);
    }

    flushStatus2(arrMsg, cli);
    cb(0);
}

module.exports.stop = function () {
    logger.info('stopping ntf-manager ...');
    if (httpServer) {
        httpServer.close();
    }
}


