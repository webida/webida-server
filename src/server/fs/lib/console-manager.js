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

var fsMgr = require('./fs-manager');
var Resource = fsMgr.Resource;
var pty = require('pty.js');
var path = require('path');
var _ = require('underscore');
var spawn = require('child_process').spawn;
//var express = require('express.io');
var express = require('express');
var shortid = require('shortid');

var authMgr = require('../../common/auth-manager');
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

// Control Terminal Manager
/* termMgr = {
    processID1: {
        cid: clientID,
        term: child_object,
        status: 'RUN'/'STOP'
    },

    processID2: {
        ...
    }
}
*/
var termMgr = {};

exports.route = {
    // if occured io.emit('console:exec', data) event
    exec: function (req) {
        /*
            req.data = {
                cid: <client Id>,
                fsid: <fs Id>,
                cmd: <command>,
                args: <arguments>,
                opt: {
                    name: <name>,
                    cols: <columes>,
                    rows: <rows>,
                    cwd: <current working directory>,
                    env: <enviroments>
                }
            }
        */
        // TODO check security. Can caller access the fs(fsid)?
        // Make policy: Only fs owner can call console api?

        //logger.debug('console:exec', req.data, req.handshake);
        var cid = req.data.cid;
        var cmd = req.data.cmd;
        var args = req.data.args;

        if (!req.handshake.user) {
            return req.io.emit('error', {
                cid: cid,
                data: new Error('Unauthorized access')
            });
        }
        var rootPath = (new fsMgr.WebidaFS(req.data.fsid)).getRootPath();

        var name = req.data.opt.name || 'xterm-color';
        var cols = req.data.opt.cols || 80;
        var rows = req.data.opt.rows || 30;
        var cwd = path.resolve(rootPath, req.data.opt.cwd || '');

        var env = _.clone(process.env);
        for (var key in req.data.opt.env) {
            if (req.data.opt.env.hasOwnProperty(key)) {
                env[key] = req.data.opt.env[key];
            }
        }
        env.HOME = rootPath; // TODO rootPath is home?
        env.PATH = path.resolve(__dirname, '../bin') + ':' + env.PATH;

        var opt = {
            name: name,
            cols: cols,
            rows: rows,
            cwd: cwd,
            env: env
        };

        // execute console process
        var term = pty.spawn(cmd, args, opt);
        var pid = term.pid;

        // Add console's object info
        termMgr[pid] = {
            cid: cid,
            term: term,
            status: 'RUN'
        };

        // send to client about console's pid
        var resAck = {
            cid: cid,
            pid: pid
        };
        req.io.emit('ack', resAck);

        // register console's stdout event
        term.on('data', function (data) {
            // if commnad is invaild, occur error event.
            if (data.match(/^execvp\([0-9]*\)/)) {
                req.io.emit('error', {
                    cid: cid,
                    pid: pid,
                    data: cmd + ': command not found'
                });
            } else {
                req.io.emit('data', {
                    cid: cid,
                    pid: pid,
                    data: data
                });
            }
        });

        // register console's stderr event
        term.on('error', function (data) {
            // EIO, happens when someone closes our child
            // process: the only process in the terminal.

            // if close event occurs. execute self.kill() in pty.js
            if (data.code !== 'EIO') {
                req.io.emit('error', {
                    cid: cid,
                    pid: pid,
                    data: data
                });
            }
            logger.debug('console error', req, term, termMgr);
        });

        // register console's exit event
        term.on('close', function (data) {
            // if console program is ended, return ture / false.
            req.io.emit('close', {
                cid: cid,
                pid: pid,
                data: data
            });

            // Remove console's object info
            if (termMgr[pid]) {
                delete termMgr[pid];
            }
        });
    },
    // if occured io.emit('console:write', data) event
    write: function (req) {
        /*
            req.data = {
                pid: <process Id>,
                cmd: <user input>
            }
        */

        var pid = req.data.pid;
        var cmd = req.data.cmd;

        if (termMgr[pid]) {
            termMgr[pid].term.write(cmd);
        } else {
            req.io.emit('error', {
                pid: pid,
                data: pid + ': arguments must be process ID'
            });
        }
    },
    // if occured io.emit('console:kill', data) event
    kill: function (req) {
        /*
            req.data = {
                pid: <process Id>
            }
        */
        var pid = req.data.pid;

        if (termMgr[pid]) {
            termMgr[pid].term.kill();
        } else {
            req.io.emit('error', {
                pid: pid,
                data: pid + ': arguments must be process ID'
            });
        }
    },
    // if occured io.emit('console:pause', data) event
    pause: function (req) {
        /*
            req.data = {
                pid: <process Id>
            }
        */
        var pid = req.data.pid;

        if (termMgr[pid]) {
            termMgr[pid].status = 'STOP';
            termMgr[pid].term.pause();
        } else {
            req.io.emit('error', {
                pid: pid,
                data: pid + ': arguments must be process ID'
            });
        }
    },
    // if occured io.emit('console:resume', data) event
    resume: function (req) {
        /*
            req.data = {
                pid: <process Id>
            }
        */
        var pid = req.data.pid;
        if (termMgr[pid]) {
            termMgr[pid].status = 'RUN';
            termMgr[pid].term.resume();
        } else {
            req.io.emit('error', {
                pid: pid,
                data: pid + ': arguments must be process ID'
            });
        }
    },
    // if occured io.emit('console:setEncoding', data) event
    setEncoding: function (req) {
        /*
            req.data = {
                pid: <process Id>,
                encoding : <data encoding> (default: utf8)
            }
        */
        var pid = req.data.pid;
        var encoding = req.data.encoding || 'utf8';

        if (termMgr[pid]) {
            termMgr[pid].term.setEncoding(encoding);
        } else {
            req.io.emit('error', {
                pid: pid,
                data: pid + ': arguments must be process ID'
            });
        }
    },

    resize: function (req) {
        /*
            req.data = {
                pid: <process Id>,
                cols: <columns>,
                rows: <rows>
            }
        */
        var pid = req.data.pid;
        var cols = req.data.cols;
        var rows = req.data.rows;

        if (termMgr[pid]) {
            termMgr[pid].term.resize(cols, rows);
        } else {
            req.io.emit('error', {
                pid: pid,
                data: pid + ': arguments must be process ID'
            });
        }

    },

    getStatus: function (req) {
        /*
            req.data = {
                pid: <process Id>
            }
        */
        var pid = req.data.pid;
        if (termMgr[pid]) {
            req.io.emit('status', {
                cid: termMgr[pid].cid,
                pid: termMgr[pid].pid,
                data: termMgr[pid].status
            });
        } else {
            req.io.emit('error', {
                pid: pid,
                data: pid + ': arguments must be process ID'
            });
        }
    },

    disconnect: function () {
        for (var key in termMgr) {
            if (termMgr.hasOwnProperty(key)) {
                termMgr[key].term.kill();
            }
        }

        termMgr = {};
    }
};

var execTable = {};
var ipHostTable = {
    'privateNetworkReserved': '0.0.0',  // 10.0.0.0
    'broadcastReserved': '255.255.255', // 10.255.255.255
    'gatewayReserved': '0.0.1' // 10.0.0.1
};
var ipHostLastUsed = '0.0.1';     // 0.0.2 ~ 255.255.254
function removeProc(proc) {
    logger.debug('Remove proc', proc.pid);
    proc.removeAllListeners();
    clearTimeout(proc._timeoutId);
    delete execTable[proc.pid];
    delete ipHostTable[proc.pid];
}
function addProc(proc, ipHostAddr) {
    logger.debug('Add proc', proc.pid);
    proc._stdout = '';
    proc._stderr = '';
    proc._timeoutId = setTimeout(function () {
        logger.debug('Timeout proc', proc.pid);
        proc.kill();
    }, config.services.fs.exec.timeoutSecs * 1000);
    execTable[proc.pid] = proc;
    ipHostTable[proc.pid] = ipHostAddr;
}
function startProc(cwdRsc, cmd, args, ipHostAddr, callback) {
    logger.debug('Exec start', cmd, args);

    // TODO env will be removed
    var env = _.clone(process.env);
    env.HOME = cwdRsc.wfs.getRootPath();
    env.PATH = path.resolve(__dirname, '../bin') + ':' + env.PATH;

    /* execute command */
    var proc = spawn(cmd, args, {
        cwd: cwdRsc.localPath,
        detached: false,
        env: env
    });

    addProc(proc, ipHostAddr);

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
function exec(cwdUrl, cmdInfo, callback) {
    function escapeShellCmdComponent(cmd) {
        return '"' + cmd.replace(/(["$`\\])/g, '\\$1') + '"';
    }

    function getAvailableIPHostAddress(){
        function getNext(prevIpHost){
            var splitIp = prevIpHost.split('.');
            for(var i = splitIp.length-1, carried=true; i >= 0; i--){
                if(carried){
                    splitIp[i]++;
                    carried = false;
                }
                if(splitIp[i] > 255){
                    splitIp[i] = 0;
                    carried = true;
                    if(i === 0){
                        splitIp.fill(0);
                    }
                }
            }
            return splitIp.join('.');
        }

        var usedIPHostAddr = _.values(ipHostTable);
        var next = getNext(ipHostLastUsed);
        while(usedIPHostAddr.indexOf(next) > -1){
            next = getNext(next);
        }
        ipHostLastUsed = next;
        return next;
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

    if (!config.services.fs.exec.validExecCommands.hasOwnProperty(cmd)) {
        return callback('Invalid command');
    }
    var subCmds = config.services.fs.exec.validExecCommands[cmd];
    if (subCmds && !_.contains(subCmds, cmdInfo.args[0])) {
        return callback('Invalid argument');
    }

    if (config.services.fs.lxc.useLxc) {
        var name = config.services.fs.lxc.containerNamePrefix + '-' + shortid.generate();
        var confPath = config.services.fs.lxc.confPath;
        var cwdLxcPath = path.join('/fs', cwdRsc.pathname);
        var cmdArgsStr = _.map(cmdInfo.args, escapeShellCmdComponent).join(' ');
        var cmdInLxc = 'cd "' + cwdLxcPath + '"; ' + cmd + ' ' + cmdArgsStr;

        var ipHostAddr = getAvailableIPHostAddress();
        var args = [
            '/usr/bin/lxc-execute',
            '-n', name,
            '-f', confPath,
            '-s', 'lxc.rootfs=' + config.services.fs.lxc.rootfsPath,
            '-s', 'lxc.mount.entry=' + cwdRsc.wfs.getRootPath() + ' fs none rw,bind 0 0',
            //'-s', 'lxc.network.ipv4=10.0.3.'+ ipHostAddr +'/24',
            '-s', 'lxc.network.ipv4=10.'+ ipHostAddr +'/8',
            '-s', 'lxc.network.ipv4.gateway=10.0.0.1',
            '--', 'su', config.services.fs.lxc.userid, '-c', cmdInLxc
        ];
        startProc(cwdRsc, 'sudo', args, ipHostAddr, callback);
    } else {
        startProc(cwdRsc, cmd, cmdInfo.args, null, callback);
    }
}
exports.exec = exec;

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
