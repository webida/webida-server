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
var cuid = require('cuid');
var dnode = require('dnode');
var HashMap = require('hashmap').HashMap;

var authMgr = require('../../common/auth-manager');
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');

var procMap = new HashMap();

var Cli = function (cli) {
    var self = this;
    this.info = cli;
    this.chlist = new Array();
    this.sendMsg = function (type, msg) {
        var proc = procMap.get(type);
        if (!proc) {
            logger.error('can\'t find message procedure with ', type);
            return false;    
        }
        logger.info('sendMsg type = ' + type + ', msg = ' + JSON.stringify(msg));
        proc(self.info, type, msg); 
    }

    this.getId = function () {
        return self.info.id;
    }
};


var CliMgr = function () {
    var self = this;
    this.cliMap = new HashMap();
    this.addCli = function (cli) {
        var tmp = self.cliMap.get(cli.id);
        if (tmp) {
            throw new Error('client is already exist');
        }
        var newCli = new Cli(cli);
        self.cliMap.set(cli.id, newCli); 
        logger.info('client is added = ', cli.id);
        return newCli;
    }

    this.removeCli = function (cli) {
        self.cliMap.remove(cli.id);
        logger.info('CliMgr:client is removed = ', cli.id);
    }

    this.findCli = function (id) {
        return self.cliMap.get(id);
    }

    this.getCliCount = function () {
        return self.cliMap.count();
    }

    this.clear = function () {
        self.cliMap.clear();
    }
}


var cliMgr = new CliMgr();

var User = function (user) {
    this.user = user;
    this.clilist = new HashMap();
    var self = this;
    this.addCli = function (cli) {
        var tmp = self.clilist.get(cli.info.id);
        if (tmp) {
            throw new Error('client is already exist');
        }
        self.clilist.set(cli.info.id, cli); 
        cli.user = self.user;
        logger.info('client is added = ', cli.info.id);
        return true;
    }

    this.removeCli = function (cli) {
        self.clilist.remove(cli.id);
        logger.info('User:client is removed = ', cli.id);
    }

    this.getCliCount = function () {
        return self.clilist.count();
    }

    this.clear = function () {
        self.clilist.clear();
    }
};

var UserMgr = function () {
    this.userList = new HashMap();
    var self = this; 

    this.add = function (user) {
        var tmp = self.userList.get(user.uid); 
        if (tmp)
            return false;
        self.userList.set(user.uid, user); 
        return true;
    } 
    
    this.remove = function (user) {
        self.userList.remove(user.uid);
    }

    this.login = function (user, cli) {
        var tmp = self.userList.get(user.uid); 
        if (tmp) {
            if (!tmp.addCli(cli)) {
                logger.error('fail to add client to user');
                return false;
            }
        } else {
            tmp = new User(user);
            if (!tmp.addCli(cli)) {
                logger.error('fail to add client to user');
                return false;
            }
            self.userList.set(user.uid, tmp);    
        }
        return true;
    }

    this.logout = function (user, cli) {
        var tmp = self.userList.get(user.uid); 
        if (!tmp) {
            logger.error('can not find user with uid = ', user.uid);
            return false;
        }

        tmp.removeCli(cli);
        var cnt = tmp.getCliCount();
        if (cnt == 0) {
            self.userList.remove(user.uid);
            logger.info('user is removed = ', user.uid);
        }
        return true;

    }

    this.dump = function () {
        logger.info('num of user = ', self.userList.count());
        self.userList.forEach(function (value, key) {
            logger.debug('key = ', key, ', user = ', JSON.stringify(value.user));
        });
    }
}

var userMgr = new UserMgr();


var Ch = function (id) {
    this.id = id;
    this.list = new Array();    
    var self = this;

    this.sub = function (cli) {
        self.list.push(cli);    
        cli.chlist.push(self.id);
        logger.info('sub ' + cli.info.id + ' is joined into the channel ' + self.id);
    }

    this.unsub = function (cli) {
        for (var i in self.list) {    
            var tmp = self.list[i];
            if (tmp.info.id === cli.info.id) { 
                delete self.list[i];
                logger.info('sub ' + cli.info.id + ' is leaved from the channel ' + self.id);
                break;
            }
        }
    }

    this.getCliList = function(except) {
        var arrCli = new Array();
        for (var idx in self.list) {
            var cli = self.list[idx];
                if (except.info.id !== cli.info.id && except.user.uid !== cli.user.uid) {
                var cliInfo = {
                    cli: cli.info,
                    user: cli.user
                };

                arrCli.push(cliInfo);
            }
        }
        return arrCli;
    }

    this.sendtocli = function (from, toCli, type, msg) {

        var payload = { 
            from : from, 
            notiType : type, 
            data : msg 
        };

        for (var idx in self.list) {
            var cli = self.list[idx];
            logger.info('cliinfoid = '+  cli.info.id + ' tocli id = ' +  JSON.stringify(toCli));
            if (cli.info.id === toCli.id) {
                cli.sendMsg(type, payload);            
            }
        }
    }

    this.broadcast = function (from, type, msg) {

        var payload = { 
            from : from, 
            notiType: type, 
            data : msg 
        };

        for (var idx in self.list) {
            var cli = self.list[idx];
            cli.sendMsg(type, payload);            
        }
    }

    this.sysNotify = function (msg) {
        var payload = { 
            notiType: 'sysNtf', 
            data : msg 
        };

        for (var idx in self.list) {
            var cli = self.list[idx];
            cli.sendMsg('sysNtf', payload);            
        }
    }


    this.dump = function () {
        logger.info('num of subscriber = ', self.list.length);
        for (var idx in self.list) {
            logger.debug('subscriber = ', JSON.stringify(self.list[idx].info.id));
        }
    }
};


var ChMgr = function () {
    this.chMap = new HashMap;
    var self = this;
    this.addCh = function (name, ch) {
        var tmp = self.chMap.get(name);
        if (tmp) {
            logger.error('The channel is already exist - ', ch.id);
            return false;
        }
        self.chMap.set(name, ch);
    }

    this.removeCh = function (name) {
        self.chMap.remove(name);
        logger.info('channel is removed with name = ', name); 
    }

    this.getCh = function (name) {
        var tmp = self.chMap.get(name);
        if (!tmp) {
            logger.debug('has no channel with id - ', name);
            return null;
        }
        return tmp;
    }

    this.logoutCli = function (cli) {
        for (var i in cli.chlist) {
            var chid = cli.chlist[i];
            var ch = self.getCh(chid);
            if (!ch) {
                logger.error('cannot find channel with id', chid);
            } else {
                ch.unsub(cli);
            }
        }
    }
};


var chMgr = new ChMgr();

//
// msg proc list
//

function procEnter(user, cli, cb) {
    logger.info('login...');
    try {
        var newCli = cliMgr.addCli(cli);
        var b = userMgr.login(user, newCli); 
        userMgr.dump();
        return cb(b ? 0 : 1);}
    catch (e) {
        cliMgr.removeCli(cli);
        logger.error(e);
        return cb(e);
    }
    return cb(b ? 0 : 1);
}

function procLeave(user, cli, cb) {
    logger.info('logout...');
    if (!user || !cli) {
        return cb(1);
    }
    var tmp = cliMgr.findCli(cli.id);
    if (!tmp) {
        return cb(1);
    }
    chMgr.logoutCli(tmp);
    cliMgr.removeCli(cli);
    var b = userMgr.logout(user, cli);
    return cb(b ? 0 : 1);
}

function subscribe(user, cli, topic) {
    logger.info('subscribe...');
    var ch = chMgr.getCh(topic); 
    if (!ch) {
        ch = new Ch(topic);
        chMgr.addCh(topic, ch);
    }
    
    var tmp = cliMgr.findCli(cli.id);
    if (!tmp) {
        return false;
    } 
    ch.sub(tmp);

    var arrList = ch.getCliList(tmp);
    //logger.info('cliist = ', JSON.stringify(arrList));
    if (arrList.length > 0) {
        var msgData = {
            topic: topic,
            eventType: 'userlist',
            userlist: arrList
        };
        var payload = { 
            notiType: 'userNtf', 
            data : msgData 
        };

        tmp.sendMsg('userNtf', payload);
    }

    var msgInfo = {
        topic: topic,
        eventType: 'join'
    };
    //logger.info('msgInfo = ', msgInfo);
    //ch.dump();
    ch.broadcast(user, 'userNtf', msgInfo);

    return true;
}

function unsubscribe(user, cli, topic) {
    logger.info('unsubscribe...');
    if (!user || !cli) {
        return false;
    }
    var tmp = cliMgr.findCli(cli.id);
    if (!tmp) {
        return false;
    }
    var ch = chMgr.getCh(topic); 
    if (!ch) {
        ch.unsub(tmp);
    }
    return true;    
}

function procSub(user, cli, info, cb) {
    logger.info('procSub');
    if (!subscribe(user, cli, info.topic)) {
        return cb(1);
    }
    return cb(0);
}

function procSub2(user, cli, info, cb) {
    logger.info('procSub2');
    for (var i in info.topiclist) {    
        var topic = info.topiclist[i];
        if (!topic) {
            logger.error('invalid topic info');
            return cb(1);
        }
        subscribe(user, cli, topic);
    }
    return cb(0);
}

function procUnsub(user, cli, info, cb) {
    logger.info('procUnsub');
    if (!unsubscribe(user, cli, info)) {
        return cb(1);
    }
    return cb(0);
}

function procUnsub2(user, cli, info, cb) {
    logger.info('procUnsub');
    for (var i in info.topiclist) {    
        var topicInfo = info.topiclist[i];
        if (!topicInfo) {
            logger.error('invalid topic info');
            return cb(1);
        }
        unsubscribe(user, cli, topicInfo);
    }

    return cb(0);
}


function procPub(user, cli, info, cb) {
    logger.info('procPub');
    var ch = chMgr.getCh(info.topic); 
    if (!ch) {
        ch = new Ch(info.topic);
        chMgr.addCh(info.topic, ch);
    }
    user.cli = cli;
    ch.broadcast(user, 'userNtf', info);
    return cb(0);
}

function procSysNoti(info, cb) {
    var ch = chMgr.getCh(info.topic); 
    if (!ch) {
        return cb(1);
    }
    logger.info('sysNtf - ', info);
    ch.sysNotify(info);
    return cb(0);
}

function procSysNoti2(topics, info, cb) {
    for (var i in topics) {
        var topic = topics[i];     
        var ch = chMgr.getCh(topic); 
        if (!ch) {
            continue;
        }
        info.topic = topic;
        logger.info('sysNtf2 - ', info);
        ch.sysNotify(info);    
    }
    //return cb(0);
}

function procRegister(name, cb) {
    procMap.set(name, cb);
    logger.info('message registered with (name = ', name);
}

var ntfServer = dnode({
    enter : procEnter,
    leave : procLeave,
    sub : procSub,
    sub2 : procSub2,
    unsub : procUnsub,
    unsub2 : procUnsub2,
    pub : procPub, 
    sysnoti : procSysNoti, 
    sysnoti2 : procSysNoti2, 
    register : procRegister
});




module.exports.start = function (port) {
    ntfServer.listen(port);
}



