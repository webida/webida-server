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

var HashMap = function(){  
    this.map = new Array();
};  

HashMap.prototype = {  
    put : function(key, value){  
        this.map[key] = value;
    },  
    get : function(key){  
        return this.map[key];
    },  
    getAll : function(){  
        return this.map;
    },  
    clear : function(){  
        this.map = new Array();
    },  
    getKeys : function(){  
        var keys = new Array();  
        for(i in this.map){  
            keys.push(i);
        }  
        return keys;
    }
};


var notifyMgr = (function() {
    function msg_Ready(conn, msg) {
        updateLog('ready - ' + JSON.stringify(msg));
        conn.sendMsg('auth', conn.user);   
    }

    function msg_authAns(conn, msg) {
        updateLog('authAns - ' + JSON.stringify(msg));
        var subInfo = { 'id': 'group_1111', 'name': 'file' }; 
        conn.sendMsg('sub', subInfo);
    }

    function msg_subAns(conn, msg) {
        updateLog('subAns - ' + JSON.stringify(msg));
        var info = { 'id': 'group_1111', 'msg': 'test is the notification message' }; 
        conn.sendMsg('pub', info);
    }

    function msg_pubAns(conn, msg) {
        updateLog('pubAns - ' + JSON.stringify(msg));
    }

    function msg_userNtf(conn, msg) {
        updateTalkShow(msg);
    }

    function msg_sysNtf(conn, msg) {
        updateSysNoti(msg);
        updateLog('system ntf - - ' + JSON.stringify(msg));
    }

    var msgMap = [
        { name: 'ready', func: msg_Ready },
        { name: 'authAns', func: msg_authAns },
        { name: 'subAns', func: msg_subAns },
        { name: 'pubAns', func: msg_pubAns },
        { name: 'userNtf', func: msg_userNtf },
        { name: 'sysNtf', func: msg_sysNtf }
    ];

    var connMap = new HashMap();
    var init = function (user, host) {
        console.log(JSON.stringify(user));
        var conn = new Conn(user, host, msgMap);    
        connMap.put(user.nick, conn);
    };

    var sub = function (user, info) {
        var conn = connMap.get(user.nick);    
        conn.sendMsg('sub', info);    
    }

    var pub = function (user, info) {
        var conn = connMap.get(user.nick);    
        conn.sendMsg('pub', info);    
    }

    return {
        init: init,
        sub: sub,
        pub: pub
    };

})();

