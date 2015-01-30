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

var User = function (nick, email, token) {
    this.nick = nick;
    this.email = email;
    this.token = token;
}

var Conn = function (user, host, msgMap) {
    var self = this;
    this.user = user;
    this.msgMap = msgMap;
    //this.sock = io.connect(host, { 'force new connection': true });  
    this.sock = io.connect(host);  
    this.sock.off = this.sock.removeListener;

    this.on = function (name, func) {
        self.sock.off(name);
        self.sock.on(name, func.bind(null, self));
    }

    this.off = function (name) {
        self.sock.off(name);
    }

    function registerMsgMap(arrMap, cli, sock) {
        for (var i=0; i < arrMap.length; i++) {
            sock.on(arrMap[i].name, arrMap[i].func.bind(null, cli));
        }
    }

    if (msgMap) {
        registerMsgMap(msgMap, self, self.sock);
    }

    this.sock.on('connect', function () {
        console.log('connected to the notify-server');
        //updateUserList(self.user.nick);
    });

    this.sock.on('disconnect', function() {
        console.log('disconnected');
    });                                                        

    this.disconnect = function () {
        self.sock.disconnect();
        console.log('try disconnecting...');
    }

    this.sendMsg = function (type, msg) {
        self.sock.emit(type, msg);   
    }
}



