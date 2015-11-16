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

var NtfCommon = require('./notify-common');
var logger = require('../../common/log-manager');
var authMgr = require('../../common/auth-manager');

var User = NtfCommon.User;
var Err = NtfCommon.NotifyError;
var _MSG = NtfCommon.getNotifyMsg;


var ntfSvr = null;

module.exports.setNtfSvr = function (ntf) {
    ntfSvr = ntf;
}

var onAuth = function (cli, msg) {
    logger.info('cli = ' + cli.id);
    logger.info('auth = ' + JSON.stringify(msg));
    authMgr.getUserInfoByToken(msg.token, function(err, user) {
        if (err) {
            cli.sendMsg('authAns', _MSG(Err.authInvalidToken, null));
        } else {
            logger.info('client authorized: user - ', user);
            //logger.info('client authorized: cli - ', cli);
            user.nick = msg.nick
            user.email = msg.email;
            cli.user = user;
           
            ntfSvr.login(user, cli.info, function (err) {
                logger.info('return = ', err);
                if (err) {
                    cli.sendMsg('authAns', _MSG(Err.authFailLoginNS, null));
                } else {
                    cli.mgr.authorized(cli);
                    cli.sendMsg('authAns', _MSG(Err.succ, user));
                }
            }); 
        }
    });
};

var onDisconnect = function (cli) {
    if (cli.user === null) {
        cli.mgr.leave(cli, false);
    }

    logger.info('disconect = ' + JSON.stringify(cli.user));
    logger.info('client(' + cli.sock + ') is disconnected');
    ntfSvr.logout(cli.user, cli.info, function (err) {
        cli.mgr.leave(cli, true);
    });
};

var onSub = function (cli, msg) {
    ntfSvr.sub(cli.user, cli.info, msg, function (err) {
        if (err) {
            cli.sendMsg('subAns', _MSG(Err.fail, msg));
        } else {
            cli.sendMsg('subAns', _MSG(Err.succ, msg));
        }
    });
};

var onSub2 = function (cli, msg) {
    ntfSvr.sub2(cli.user, cli.info, msg, function (err) {
        if (err) {
            cli.sendMsg('subAns', _MSG(Err.fail, msg));
        } else {
            cli.sendMsg('subAns', _MSG(Err.succ, msg));
        }
    });
};

var onUnsub = function (cli, msg) {
    ntfSvr.unsub(cli.user, cli.info, msg, function (err) {
        if (err) {
            cli.sendMsg('subAns', _MSG(Err.fail, msg));
        } else {
            cli.sendMsg('subAns', _MSG(Err.succ, msg));
        }
    });
};

var onUnsub2 = function (cli, msg) {
    ntfSvr.unsub2(cli.user, cli.info, msg, function (err) {
        if (err) {
            cli.sendMsg('subAns', _MSG(Err.fail, msg));
        } else {
            cli.sendMsg('subAns', _MSG(Err.succ, msg));
        }
    });
};


var onPub = function (cli, msg) {
    ntfSvr.pub(cli.user, cli.info, msg, function (err) {
        if (err) {
            cli.sendMsg('pubAns', _MSG(Err.fail, msg));
        } else {
            cli.sendMsg('pubAns', _MSG(Err.succ, msg));
        }
    });
}

var onSendToUser = function (cli, msg) {

}

var msgMap = [
    { name: 'auth', func : onAuth },
    { name: 'disconnect', func : onDisconnect },
    { name: 'sub', func: onSub },
    { name: 'sub2', func: onSub2 },
    { name: 'unsub', func: onUnsub },
    { name: 'unsub2', func: onUnsub2 },
    { name: 'pub', func: onPub },
    { name: 'sendtouser', func: onSendToUser }
];

function registerMsgMap(arr, cli, sock) {
   for (var i=0; i<arr.length; i++) {
        sock.on(arr[i].name, arr[i].func.bind(null, cli));
    } 
}


var msgProc = function (cli, sock) {
    registerMsgMap(msgMap, cli, sock);
        
}

module.exports.msgProc = msgProc;



