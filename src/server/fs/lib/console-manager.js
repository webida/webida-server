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
var Resource = require('./Resource');
var path = require('path');
var _ = require('lodash');
var express = require('express');
var async = require('async');

var socketio = require('socket.io');

var authMgr = require('../../common/auth-manager');
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;
var Executor = require('./container');

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

var execTable = {};

function _removeProc(cexec) {
    if (cexec.getProc() && execTable[cexec.getProc().pid]) {
        logger.debug('Remove Executor process', cexec.getProc().pid);
        delete execTable[cexec.getProc().pid];
        cexec = null;
    }
}

function _addProc(cexec) {
    if (cexec.getProc()) {
        logger.debug('Add Executor process', cexec.getProc().pid);
        cexec.getProc()._stdout = '';
        cexec.getProc()._stderr = '';
        execTable[cexec.getProc().pid] = cexec;
    }
}

/* cleanup all process on execTable */
process.on('exit', function () {
    _.forOwn(execTable, function (cexec) {
        logger.debug('terminate', cexec.getProc().pid);
        cexec.kill('SIGKILL', function (err) {
            if (err) {
                logger.warning('failed to kill container exec', err);
            }
            _removeProc(cexec);
        });
    });
});

function _startProc(cexec, callback) {
    cexec.execute(function (err) {
        if (err) {
            return callback(new ServerError(err));
        }
        _addProc(cexec);
        var proc = cexec.getProc();

        proc.stdout.on('data', function (data) {
            proc._stdout += data;
        });

        proc.stderr.on('data', function (data) {
            proc._stderr += data;
        });

        proc.on('close', function (code) {
            logger.debug('Exec close', proc.pid, 'code:' + code, 'stdout:' + proc._stdout, 'stderr:' + proc._stderr);
            _removeProc(cexec);
            if (code !== 0) {
                return callback(new Error('Abnormal exit: code=' + code), proc._stdout, proc._stderr);
            }
            callback(null, proc._stdout, proc._stderr, code);
        });

        proc.on('error', function (err) {
            logger.debug('Exec error', proc.pid, err, proc._stdout, proc._stderr);
            _removeProc(cexec);
            if (err.errno === 'EPERM') {
                callback(new ClientError('Exec timeout'), proc._stdout, proc._stderr);
            } else {
                callback(new ServerError('Exec failed'), proc._stdout, proc._stderr);
            }
        });
    });
}

function handleNewEvent(socket, options, cb) {
    var req = socket.request;
    var fsid = req.query.fsid;
    var userId = req.user.userId;

    logger.debug('new event handler');
    async.waterfall([
        function (next) {
            /* get wfs by fsid */
            logger.debug('get wfs', fsid);
            fsMgr.getWfsByFsid(fsid, next);
        },
        function (wfs, next) {
            /* get wfs owner */
            logger.debug('get owner', fsid);
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
            /* execute terminal container */
            var cexec = new Executor(wfs, null, null, {cols: options.cols, rows: options.rows});
            var pid;
            var cwd = options.cwd;
            var cmd = cexec.getCmd_();
            var args = cexec.getArgs_();

            logger.debug('start terminal', cmd, args, options);
            cexec.executeTerminal(function (err) {
                if (err) {
                    return next(err);
                }
                var pty = cexec.getProc();
                pid = pty.pid;
                _addProc(cexec);

                socket.on('data', function (data) {
                    pty.write(data);
                });

                socket.on('resize', function (col, row) {
                    pty.resize(col, row);
                });

                socket.on('disconnect', function () {
                    logger.debug('disconnect terminal', pid);
                });

                pty.on('exit', function () {
                    logger.debug('exit terminal', pid);
                    socket.disconnect(true);
                });

                return next(null, pty, cexec, cwd);
            });
        },
        function (pty, cexec, cwd, next) {
            /* change directory & clear terminal */
            var pos;
            var msg = '';
            var KEYWORD = 'WSDKTERMINAL';
            var cmd;
            var cpid;
            var STATE = Object.freeze({
                SEARCH: 0,
                NEWLINE: 1,
                CPID: 2,
                DONE: 3
            });
            var state = STATE.SEARCH;

            if (!cwd) {
                cwd = '';
            }
            cwd = path.join('.', cwd);

            cmd = 'cd ' + cwd + ';';
            cmd += 'echo ' + KEYWORD + ';';
            cmd += 'echo ${BASHPID};';
            cmd += 'history -c; history -r\r';
            KEYWORD += '\r';

            pty.pause();
            pty.write(cmd);
            var dropMsg = function () {
                /* accumulate all data from lxc */
                var c;
                while (null !== (c = pty.socket.read())) {
                    msg += c;
                }

                /* find keyword */
                while ((state !== STATE.DONE) && (pos = msg.indexOf(KEYWORD)) !== -1) {
                    /* parse & get cpid */
                    if (state === STATE.CPID) {
                        cpid = parseInt(msg.substr(0, pos));
                        cexec.setCPid(cpid);
                    }

                    /* discard data with keyword */
                    msg = msg.substr(pos + KEYWORD.length);
                    state++;
                    if (state === STATE.NEWLINE) {
                        KEYWORD = '\n';
                    }
                }

                if (state === STATE.DONE) {
                    pty.removeListener('readable', dropMsg);
                    pty.resume();
                    if (msg.length !== 0) {
                        pty.write(msg);
                    }
                    return next(null, pty);
                }
            };
            logger.debug('setup terminal');
            pty.on('readable', dropMsg);
        }
    ], function (err, pty) {
        if (err) {
            logger.error('terminal failed', err);
            socket.disconnect(true);
        } else {
            /* bind to client */
            logger.debug('bind terminal to client');
            pty.on('data', function (data) {
                socket.emit('data', data);
            });
            cb();
        }
    });
}

function registerTerminalService(httpServer) {
    if (!Executor.supportTerminal()) {
        logger.debug('Container did not support terminal. ' +
            'So terminal service cannot be run.');
        return;
    }

    var io = socketio(httpServer);

    io.use(function (socket, next) {
        var req = socket.request;
        var customResponse = Object.create(express.response);

        req.parsedUrl = require('url').parse(req.url);
        req.query = require('querystring').parse(req.parsedUrl.query);

        logger.debug('io.use:', req.url);
        customResponse.send = function (result) {
            logger.debug('custom send:', arguments, this);
            if (this.statusCode >= 400) {
                next(new Error(result));
            } else {
                next();
            }
        };
        customResponse.sendfail = function (err) {
            next(err);
        };
        authMgr.ensureLogin(req, customResponse, next);
    });
    io.of('pty').on('connection', function (socket) {
        logger.debug('pty connection');
        socket.on('create', _.partial(handleNewEvent, socket));
    });

    logger.debug('Terminal service is running');
}
exports.registerTerminalService = registerTerminalService;

exports.router = new express.Router();
exports.router.post('/webida/api/fs/exec/:fsid/*',
    authMgr.ensureLogin,
    function (req, res, next) {
        var rsc = 'fs:' + req.params.fsid + '/*';
        authMgr.checkAuthorize({uid: req.user.uid, action: 'fs:exec', rsc: rsc}, res, next);
    },
    utils.keepConnect(),
    function (req, res) {
        var fsid = req.params.fsid;
        var cwdPath = path.join('/', req.params[0]);
        var cwdUrl = 'wfs://' + fsid + cwdPath;
        /* request.info is command information
           - info.cmd : command
           - info.args : command arguments */
        var cmdInfo = JSON.parse(req.body.info);
        var sessionID = req.body.sessionID;
        var uid = req.user && req.user.uid;
        if (uid === undefined) {
            return res.sendfail(new ClientError('invalid uid'));
        }

        logger.debug('exec path=' + cwdPath, cmdInfo);
        fsMgr.checkLock(fsid, cwdPath, cmdInfo, function (err) {
            if (err) {
                return res.sendfail(err);
            }
            logger.debug('exec check lock succeed');
            if (!cmdInfo.cmd) {
                return res.sendfail('Command is not specified.');
            }
            var cwdRsc = new Resource(cwdUrl);
            _startProc(new Executor(cwdRsc.wfs, cmdInfo.cmd, cmdInfo.args, {
                cwd: cwdRsc.pathname,
                timeout: config.services.fs.exec.timeoutSecs * 1000
            }), function (err, stdout, stderr, ret) {
                fsMgr.updateByExec(cmdInfo, uid, fsid, cwdPath, cwdUrl, sessionID, function () {
                    logger.debug('exec notification done');
                    return res.sendok({stdout: stdout, stderr: stderr, ret: ret});
                });
            });
        });
    }
);
