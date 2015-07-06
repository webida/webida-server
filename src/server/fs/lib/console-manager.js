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

'use strict';

var childProc = require('child_process');
var fsMgr = require('./fs-manager');
var Resource = fsMgr.Resource;
var ptyjs = require('pty.js');
var path = require('path');
var _ = require('lodash');
//var express = require('express.io');
var express = require('express');
var shortid = require('shortid');

var socketio = require('socket.io');
var ss = require('socket.io-stream');

var authMgr = require('../../common/auth-manager');
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

var execTable = {};
var ipHostTable = {
    'privateNetworkReserved': '0.0.0',  // 10.0.0.0
    'broadcastReserved': '255.255.255', // 10.255.255.255
    'gatewayReserved': '0.0.1' // 10.0.0.1
};
var usedIpHostAddr = {
    '0.0.0': null,
    '255.255.255': null,
    '0.0.1': null
};
var ipHostLastUsed = '0.0.1';     // 0.0.2 ~ 255.255.254
function removeProc(proc) {
    logger.debug('Remove proc', proc.pid);
    proc.removeAllListeners();
    if (proc._timeoutId) {
        clearTimeout(proc._timeoutId);
    }
    delete execTable[proc.pid];
    delete usedIpHostAddr[ipHostTable[proc.pid]];
    delete ipHostTable[proc.pid];
}
function addProc(proc, ipHostAddr, timeout) {
    logger.debug('Add proc', proc.pid);
    proc._stdout = '';
    proc._stderr = '';
    if (timeout) {
        proc._timeoutId = setTimeout(function () {
            logger.debug('Timeout proc', proc.pid);
            proc.kill();
        }, config.services.fs.exec.timeoutSecs * 1000);
    }
    execTable[proc.pid] = proc;
    usedIpHostAddr[ipHostAddr] = null;
    ipHostTable[proc.pid] = ipHostAddr;
}

function termProc(pid) {
    // TOFIX do not use sudo
    childProc.exec('sudo kill ' + pid, function () {
        removeProc(execTable[pid]);
    });
    //ptys[k].kill('SIGKILL');
}

/* cleanup all process on execTable */
process.on('exit', function () {
    for (var pid in execTable) {
        if (execTable.hasOwnProperty(pid)) {
            logger.debug('terminate', pid);
            termProc(pid);
        }
    }
});

function startProc(cwdRsc, cmd, args, ipHostAddr, callback) {
    logger.debug('Exec start', cmd, args);

    // TODO env will be removed
    var env = _.clone(process.env);
    env.HOME = cwdRsc.wfs.getRootPath();
    env.PATH = path.resolve(__dirname, '../bin') + ':' + env.PATH;

    /* execute command */
    var proc = childProc.spawn(cmd, args, {
        cwd: cwdRsc.localPath,
        detached: false,
        env: env
    });

    addProc(proc, ipHostAddr, true);

    proc.stdout.on('data', function (data) {
        proc._stdout += data;
    });

    proc.stderr.on('data', function (data) {
        proc._stderr += data;
    });

    proc.on('exit', function (code) {
        logger.debug('Exec close', proc.pid, 'code:'+code, 'stdout:'+proc._stdout, 'stderr:'+proc._stderr);
        removeProc(proc);
        /*
        if (code === 0) {
            return callback(code, proc._stdout, proc._stderr);
        }
        */
        if (code === null) {
            return callback(new Error('Abnormal exit'), proc._stdout, proc._stderr);
        }
        callback(null, proc._stdout, proc._stderr, code);
    });

    proc.on('error', function (err) {
        logger.debug('Exec error', proc.pid, err, proc._stdout, proc._stderr);
        removeProc(proc);
        if (err.errno === 'EPERM') {
            callback(new ClientError('Exec timeout'), proc._stdout, proc._stderr);
        } else {
            callback(new ServerError('Exec failed'), proc._stdout, proc._stderr);
        }
    });
}

function makeLxcCommand(fsPath, ipHostAddr, lxcCommandArgs) {
    var name = config.services.fs.lxc.containerNamePrefix + '-' + shortid.generate();
    var confPath = config.services.fs.lxc.confPath;

    var args = [
        '-n', name,
        '-f', confPath,
        '-s', 'lxc.rootfs=' + config.services.fs.lxc.rootfsPath,
        '-s', 'lxc.mount.entry=' + fsPath + ' fs none rw,bind 0 0',
        '-s', 'lxc.network.ipv4=10.'+ ipHostAddr +'/8',
        '-s', 'lxc.network.ipv4.gateway=10.0.0.1',
        '--'];
    return args.concat(lxcCommandArgs);
}

function getAvailableIPHostAddress(){
    function getNext(prevIpHost){
        var splitedIp = prevIpHost.split('.');
        for(var i = splitedIp.length-1, carried=true; i >= 0; i--){
            if(carried){
                splitedIp[i]++;
                carried = false;
            }
            if(splitedIp[i] > 255){
                splitedIp[i] = 0;
                carried = true;
                if(i === 0){
                    splitedIp.fill(0);
                }
            }
        }
        return splitedIp.join('.');
    }

    var next = getNext(ipHostLastUsed);
    while (next in usedIpHostAddr) {
        next = getNext(next);
    }
    ipHostLastUsed = next;
    return next;
}

function exec(cwdUrl, cmdInfo, callback) {
    function escapeShellCmdComponent(cmd) {
        return '"' + cmd.replace(/(["$`\\])/g, '\\$1') + '"';
    }

    var cwdRsc = new Resource(cwdUrl);
    /* request.info is command information
    * info.cmd : command
    * info.args : command arguments
    */
    var cmd = cmdInfo.cmd;
    if (!cmd) {
        return callback('Command is not specified.');
    }

    if (config.services.fs.lxc.useLxc) {
        var cwdLxcPath = path.join('/fs', cwdRsc.pathname);
        var cmdArgsStr = _.map(cmdInfo.args, escapeShellCmdComponent).join(' ');
        var cmdInLxc = 'cd "' + cwdLxcPath + '"; ' + cmd + ' ' + cmdArgsStr;
        var lxcCommandArgs = ['su', config.services.fs.lxc.userid, '-c', cmdInLxc];
        var fsPath = cwdRsc.wfs.getRootPath();
        var ipHostAddr = getAvailableIPHostAddress();
        var args = ['/usr/bin/lxc-execute'].concat(makeLxcCommand(fsPath, ipHostAddr, lxcCommandArgs));

        // TODO do not use sudo.  use userlevel container.
        logger.debug('args:', args);
        startProc(cwdRsc, 'sudo', args, ipHostAddr, callback);
    } else {
        startProc(cwdRsc, cmd, cmdInfo.args, null, callback);
    }
}

function registerTerminalService(httpServer) {
    if (!config.services.fs.lxc.useLxc) {
        logger.debug('No LXC configuration. Terminal service cannot be run.');
        return;
    }
    var io = socketio(httpServer);

    var customResponse = Object.create(express.response);
    io.use(function (socket, next) {
        var req = socket.request;
        req.parsedUrl = require('url').parse(req.url);
        req.query = require('querystring').parse(req.parsedUrl.query);
        logger.debug('io.use: ', req.url, req.headers);
        customResponse.send = function (result) {
            logger.debug('custom send:', arguments, this);
            if (this.statusCode >= 400) {
                next(new Error(result));
            } else {
                next();
            }
        };
        authMgr.ensureLogin(req, customResponse, next);
    });
    io.of('pty').on('connection', function (socket) {
        ss(socket).on('new', function (stream, options) {
            var req = socket.request;
            var async = require('async');
            var fsid = req.query.fsid;
            var userId = req.user.userId;
            async.waterfall([
                function (next) {
                    /* get wfs by fsid */
                    fsMgr.getWfsByFsid(fsid, next);
                },
                function (wfs, next) {
                    /* get wfs owner */
                    wfs.getOwner(_.partialRight(next, wfs));
                },
                function (ownerId, wfs, next) {
                    /* check wfs access permission */
                    if (ownerId === userId) {
                        return next(null, wfs);
                    }
                    return next(new Error('User(' + userId + ') has no permission to FS(' + fsid + ')'));
                },
                function (wfs, next) {
                    /* execute terminal lxc */
                    var lxcCommandArgs = ['su', config.services.fs.lxc.userid, '-l'];
                    var fsPath = wfs.getRootPath();
                    var ipHostAddr = getAvailableIPHostAddress();
                    var args = ['/usr/bin/lxc-execute'].concat(makeLxcCommand(fsPath, ipHostAddr, lxcCommandArgs));
                    var cmd = 'sudo';
                    var pid;
                    var cwd = options.cwd;

                    var pty = ptyjs.spawn(cmd, args, {
                        name: 'xterm-color',
                        cols: options.columns,
                        rows: options.rows
                    });

                    pid = pty.pid;
                    logger.debug('Start terminal: ', pid, cmd, args, options);
                    addProc(pty, ipHostAddr, false);
                    socket.on('disconnect', function () {
                        logger.debug('Disconnect terminal: ', pid);
                        termProc(pid);
                    });
                    pty.on('exit', function () {
                        logger.debug('Exit terminal: ', pid);
                        socket.disconnect(true);
                    });

                    return next(null, pty, cwd);
                },
                function (pty, cwd, next) {
                    if (!cwd) {
                        return next(null, pty);
                    }

                    /* change directory & clear terminal */
                    var pos;
                    var msg = '';
                    var KEYWORD = 'WSDKTERMINAL';
                    var cmd;

                    cmd = 'cd ./' + cwd + ';';
                    cmd += 'echo ' + KEYWORD + ';\r';
                    KEYWORD += '\r\n';

                    pty.pause();
                    pty.write(cmd);
                    var dropMsg = function() {
                        /* accumulate all data from lxc */
                        var c;
                        while (null !== (c = pty.socket.read())) {
                            msg += c;
                        }

                        /* find keyword */
                        pos = msg.lastIndexOf(KEYWORD);
                        if (pos !== -1) {
                            /* discard data with keyword */
                            msg = msg.substr(pos + KEYWORD.length);
                            pty.removeListener('readable', dropMsg);
                            pty.resume();
                            if (msg.length !== 0) {
                                stream.write(msg);
                            }
                            return next(null, pty);
                        }
                    };
                    pty.on('readable', dropMsg);
                },
            ], function (err, pty) {
                if (err) {
                    logger.debug('terminal failed: ', err.message);
                    socket.disconnect(true);
                } else {
                    /* bind to client */
                    stream.pipe(pty).pipe(stream);
                }
            });
        });
    });

    logger.debug('Terminal service is running');
}

exports.exec = exec;

exports.registerTerminalService = registerTerminalService;

exports.router = new express.Router();

exports.router.post('/webida/api/fs/exec/:fsid/*',
    authMgr.verifyToken,
    function (req, res, next) {
        var rsc = 'fs:' + req.params.fsid + '/*';
        authMgr.checkAuthorize({uid:req.user.uid, action:'fs:exec', rsc:rsc}, res, next);
    },
    utils.keepConnect(),
    function (req, res) {
        var fsid = req.params.fsid;
        var cwdPath = path.join('/', req.params[0]);
        logger.info('exec path = ', cwdPath);
        var cwdUrl = 'wfs://' + fsid + cwdPath;
        var cmdInfo = JSON.parse(req.body.info);
        var sessionID = req.body.sessionID;
        var uid = req.user && req.user.uid;
        if (uid === undefined) {
            return res.sendfail(new ClientError('invalid uid'));
        }

        fsMgr.checkLock(fsid, cwdPath, cmdInfo, function(err) {
            if (err) {
                return res.sendfail(err);
            }
            exec(cwdUrl, cmdInfo, function (err, stdout, stderr, ret) {
                if (err) {
                    return res.sendfail(err);
                }
                fsMgr.updateByExec(cmdInfo,uid, fsid, cwdPath, cwdUrl, sessionID, function() {
                    return res.sendok({stdout: stdout, stderr: stderr, ret:ret});
                });
            });
        });
    }
);
