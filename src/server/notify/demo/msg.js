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

/**
* @module msg
* @fileoverview webida - notify library
*
* Contact:
*   @author: Daiyoung Kim <daiyoung777.kim@samsung.com>
*
* @version: 0.1.0
* @since: 2014.07.17
*
* Src:
*   app-library/src/webida/notify.js
*/

define(['webida-lib/webida-0.3',
        'dojo/topic',
        'https://conn.webida.net/socket.io/socket.io.js'
        ],
        function (webida, topicMgr, sio) {

        'use strict';

        var User = function (nick, email, uid, token) {
        this.nick = nick;
        this.email = email;
        this.uid = uid;
        this.token = token;
        };

        var Conn = function (user, host, msgMap) {
        var self = this;
        this.user = user;
        this.msgMap = msgMap;
        this.sock = sio.connect(host);
        this.sock.off = this.sock.removeListener;

        this.on = function (name, func) {
            self.sock.off(name);
            self.sock.on(name, func.bind(null, self));
        };

        this.off = function (name) {
            self.sock.off(name);
        };

        function registerMsgMap(arrMap, cli, sock) {
            for (var i = 0; i < arrMap.length; i++) {
                sock.on(arrMap[i].name, arrMap[i].func.bind(
                            null, cli));
            }
        }

        if (msgMap) {
            registerMsgMap(msgMap, self, self.sock);
        }

        this.sock.on('connect', function () {
                console.log('connected to the notify-server');
                });

        this.sock.on('disconnect', function () {
                console.log('disconnected');
                });

        this.disconnect = function () {
            self.sock.disconnect();
            console.log('try disconnecting...');
        };

        this.sendMsg = function (type, msg) {
            self.sock.emit(type, msg);
        };
        };


        var HashMap = function () {
            this.map = new Array();
        };

        HashMap.prototype = {
            put: function (key, value) {
                this.map[key] = value;
            },
            get: function (key) {
                return this.map[key];
            },
            getAll: function () {
                return this.map;
            },
            clear: function () {
                this.map = new Array();
            },
            getKeys: function () {
                var keys = new Array();
                for (var i in this.map) {
                    keys.push(i);
                }
                return keys;
            }
        };


        var loginCallback;

        function msg_Ready(conn, msg) {
            console.log('ready - ' + JSON.stringify(msg));
            conn.sendMsg('auth', conn.user);
        }

        function msg_authAns(conn, msg) {
            console.log('authAns - ' + JSON.stringify(msg));
            if (loginCallback) {
                loginCallback();
            }
        }

        function msg_subAns(conn, msg) {
            console.log('subAns - ' + JSON.stringify(msg));
        }

        function msg_pubAns(conn, msg) {
            console.log('pubAns - ' + JSON.stringify(msg));
        }

        function msg_userNtf(conn, msg) {
            console.log('user ntf - ' + JSON.stringify(msg));

            if (!msg.data.topic) {
                console.error('invalid topic:' + JSON.stringify(msg));
                return;
            }

            topicMgr.publish(msg.data.topic, msg.data);
        }

        function msg_sysNtf(conn, msg) {
            console.log('system ntf - - ' + JSON.stringify(msg));

            if (!msg.data.topic) {
                console.error('invalid topic:' + JSON.stringify(msg));
                return;
            }

            topicMgr.publish(msg.data.topic, msg.data);
        }

        var msgMap = [
            {
                name: 'ready',
                func: msg_Ready
            }, 
            {
                name: 'authAns',
                func: msg_authAns
            }, 
            {
                name: 'subAns',
                func: msg_subAns
            }, 
            {
                name: 'pubAns',
                func: msg_pubAns
            }, 
            {
                name: 'userNtf',
                func: msg_userNtf
            }, 
            {
                name: 'sysNtf',
                func: msg_sysNtf
            }
        ];

        var connMap = new HashMap();

        var init = function (user, host, cb) {
            console.log(JSON.stringify(user));
            var conn = new Conn(user, host, msgMap);
            connMap.put(user.uid, conn);
            loginCallback = cb;
        };

        var sub = function (user, topic, cb) {
            var subInfo = {
                'topic': topic
            };
            var conn = connMap.get(user.uid);
            if (!conn)
                return false;
            conn.sendMsg('sub', subInfo);
            topicMgr.subscribe(topic, cb);
            return true;
        };

        var sub2 = function (user, topicArray) {

        };

        var unsub = function (user, topic) {
            var subInfo = {
                'topic': topic
            };
            var conn = connMap.get(user.uid);
            if (!conn)
                return false;
            conn.sendMsg('unsub', subInfo);
            return true;

        };

        var unsub2 = function (user, topicArray) {
            var subInfo = {
                'topiclist': topicArray
            };
            var conn = connMap.get(user.uid);
            if (!conn)
                return false;
            conn.sendMsg('unsub2', subInfo);
            return true;
        };

        var pub = function (user, topic, msg) {
            var pubInfo = {
                'topic': topic,
                'data': msg
            };
            var conn = connMap.get(user.uid);
            if (!conn)
                return false;
            conn.sendMsg('pub', pubInfo);
            return true;
        };

        var sendToDevice = function (user, deviceId, msg) {

        };

        var sendToUser = function (user, targetUid, msg) {

        };

        var sendToPeer = function (user, peerId, msg) {

        };

        var broadcastToPeer = function (user, peerId, msg) {

        };

        var sendToUsers = function () {};

        return {
init: init,
          sub: sub,
          sub2: sub2,
          unsub2: unsub2,
          pub: pub,
          sendToDevice: sendToDevice,
          sendToUser: sendToUser,
          sendToUsers: sendToUsers
        };

});
