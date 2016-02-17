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
 * @file Docker Container
 * @since 1.4.0
 * @author hyunseok.kil@samsung.com
 * @extends Container
 * @todo It's not tested yet.
 */

'use strict';

var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var util = require('util');
var async = require('async');
var exec = require('child_process').exec;
var EventEmitter = require('events').EventEmitter;
var ptyjs = require('pty.js');

var conf = require('../../../common/conf-manager').conf;
var logger = require('../../../common/log-manager');
var WebidaFS = require('../webidafs').WebidaFS;
var Container = require('./Container');

var config = conf.services.fs.container;

/* get container name */
function getName(fsid) {
    return config.namePrefix + fsid;
}

/* get container root path */
function getRootPath(cid) {
    return path.join(config.docker.rootfsPath, cid);
}

/* get container working directory */
function getWorkDir(cid) {
    return path.join(getRootPath(cid), config.docker.workDir);
}

/*
 * docker container state transition
 * - STOPPED -> STARTING -> RUNNING
 * - RUNNING -> STOPPING -> STOPPED
 */
var STATE = Object.freeze({
    STOPPED:    1,
    STOPPING:   2,
    STARTING:   3,
    RUNNING:    4
});

var fsidToContainer = {};

function DockerContainer(fsid) {
    EventEmitter.call(this);

    this.fsid = fsid;
    this.name = getName(fsid);
    this.state = STATE.STOPPED;
    this.count = 0;
    this.waitCnt = 0;
    this.timerId = null;
}
util.inherits(DockerContainer, EventEmitter);

DockerContainer.prototype.start = function (callback) {
    if (this.state === STATE.RUNNING) {
        return callback(null, this);
    }

    var self = this;
    if (this.state === STATE.STOPPED) {
        var cmd;
        cmd = 'sudo /usr/bin/docker start ' + this.name;
        logger.debug('docker container start cmd: ' + cmd);
        this.state = STATE.STARTING;
        exec(cmd, function (err) {
            if (err) {
                logger.debug('Failed to start docker container: ' + self.name, err);
                self.state = STATE.STOPPED;
                self.emit('status', self.state, err);
                return callback(err);
            }

            /*
             * TODO?:
             * check docker is running really?
             * - sudo docker ps --filter=name=<self.name> ?
             */
            logger.debug('docker container running: ' + self.name);
            self.state = STATE.RUNNING;
            self.emit('status', self.state);
            callback(null, self);
        });
    } else {
        logger.debug('docker: waiting container(' + this.name + ') status. ' +
                'current - ' + this.state);
        this.waitCnt++;
        this.once('status', function (state, err) {
            self.waitCnt--;
            if (state === STATE.RUNNING) {
                logger.debug('EVENT: docker container is running', self.name);
                return callback(null, self);
            } else if (err) {
                logger.debug('EVENT: docker container error', self.name, err);
                return callback(err);
            } else {
                logger.debug('EVENT: docker container retry', self.name);
                return self.start(callback);
            }
        });
    }
};

DockerContainer.prototype.stop = function () {
    if (this.state === STATE.STOPPED) {
        return;
    }

    if (this.state === STATE.RUNNING) {
        var self = this;
        var waitTime = config.docker.waitTime;
        var cmd = 'sudo /usr/bin/docker stop';
        if (waitTime > 0) {
            cmd += ' -t ' + waitTime;
        }
        cmd += ' ' + this.name;
        logger.debug('docker container stop cmd: ' + cmd);
        this.state = STATE.STOPPING;
        exec(cmd, function (err) {
            if (err) {
                logger.warn('Failed to stop docker container: ' + self.name, err);
            }

            self.state = STATE.STOPPED;
            if (self.waitCnt === 0) {
                delete fsidToContainer[self.fsid];
            }
            logger.debug('docker container stopped: ' + self.name);
            self.emit('status', self.state);
        });
    }
};

DockerContainer.prototype.get = function (callback) {
    /* cancel stop timer */
    if (this.timerId) {
        logger.debug('docker timer cancel: ' + this.name);
        clearTimeout(this.timerId);
        this.timerId = null;
    }

    if (this.state === STATE.RUNNING) {
        this.count++;
        logger.debug('docker increase refs: ' +
                this.name + ', ' + this.count);
        return callback(null, this);
    }

    var self = this;
    this.start(function (err) {
        if (err) {
            return callback(err);
        }
        self.count++;
        logger.debug('docker increase refs: ' +
                self.name + ', ' + self.count);
        return callback(null, self);
    });
};

DockerContainer.prototype.put = function () {
    this.count--;
    logger.debug('docker decrease refs: ' +
            this.name + ', ' + this.count);
    if (this.count === 0) {
        var expire = config.docker.expireTime;
        if (!expire) {
            this.stop();
        } else if (expire > 0) {
            var self = this;
            logger.debug('docker timer register: ' +
                    this.name + ', timeout=' + expire);
            this.timerId = setTimeout(function () {
                logger.debug('docker timer expired: ' +
                    self.name + ', ' + self.count);
                self.timerId = null;
                if (self.count === 0) {
                    self.stop();
                }
            }, expire * 1000);
        }
    }
};

function Docker(wfs, cmd, args, options) {
    Docker.super_.call(this, wfs, cmd, args, options);
    this.originalCmd = this.cmd;
    this.cmd = 'sudo';
    this.container = fsidToContainer[wfs.getId()];
    if (!this.container) {
        this.container = new DockerContainer(wfs.getId());
        fsidToContainer[wfs.getId()] = this.container;
    }
}
util.inherits(Docker, Container);

Docker.prototype.getArgs_ = function (interactive) {
    var options = this.options;
    var command;
    var args = ['/usr/bin/docker', 'exec'];

    if (interactive) {
        args = args.concat('-it');
        command = ['su', config.userid, '-l'];
    } else {
        var cwd = options.cwd;
        var cmdStr = this.getCmdStr_();
        if (cwd) {
            cwd = path.join('$HOME', cwd);
            cmdStr = 'cd "' + cwd + '"; ' + cmdStr;
        }
        command = ['su', config.userid, '-c', cmdStr];
    }

    args = args.concat(getName(this.fsid), command);
    return args;
};

Docker.prototype.getCmdStr_ = function () {
    var cmdStr = this.originalCmd;
    if (this.args) {
        cmdStr += ' ' + this.args.map(this.escapeCmd_).join(' ');
    }
    return cmdStr;
};

Docker.prototype.getOptions_ = function () {
    var options = Docker.super_.prototype.getOptions_.call(this);
    delete options.cwd;
    return options;
};

Docker.prototype.execute = function (callback) {
    var self = this;
    this.container.get(function (err) {
        if (err) {
            callback(err);
        } else {
            Docker.super_.prototype.execute.call(self, callback);
        }
    });
};

Docker.prototype.executeTerminal = function (callback) {
    var self = this;
    this.container.get(function (err) {
        if (err) {
            callback(err);
        } else {
            self.proc = ptyjs.spawn(self.getCmd_(), self.getArgs_(true), {
                name: 'xterm-color',
                cols: self.options.cols,
                rows: self.options.rows
            });
            self.afterExecute_(callback);
        }
    });
};

Docker.prototype.kill = function (signal, callback) {
    var cpid = this.cpid;
    var proc = this.proc;
    var args;
    var cmd;

    if (typeof signal === 'function') {
        callback = signal;
        signal = null;
    }

    signal = signal || 'SIGTERM';
    callback = callback || function () {
    };

    if (!proc) {
        return callback(null);
    }

    if (cpid) {
        args = [
            'sudo',
            '/usr/bin/docker',
            'exec',
            getName(this.fsid),
            '/bin/kill', '-s', signal, cpid];
    } else {
        args = [
            'sudo',
            '/bin/kill', '-s', signal, proc.pid];
    }
    cmd = args.join(' ');
    logger.debug('docker kill cmd: ' + cmd);
    exec(cmd, callback);
};

Docker.prototype.onTerminated_ = function (callback) {
    this.container.put();
    if (callback) {
        callback();
    }
};

function _createContainer(fsid, callback) {
    var cmd;
    var template;

    /* make docker command */
    template = _.template(
        'sudo docker create -i ' +
        '-h <%= hostName %> ' +
        '--name <%= cName %> ' +
        '<% ' +
        '_.forEach(volumes, function (volume) { %>' +
            '-v <%- volume %> ' +
            '<% });' +
        '%> ' +
        '<%= imageName %> ' +
        '/bin/bash');

    cmd = template({
        hostName: config.docker.hostname,
        cName: getName(fsid),
        volumes: config.docker.volumes,
        imageName: config.docker.imageName
    });

    logger.debug('docker create cmd: ' + cmd);
    exec(cmd, function (err, stdout) {
        if (err) {
            return callback(err);
        }

        var cid = stdout.replace(/(\r\n|\n|\r)/gm, '');
        logger.debug('docker cid: ' + cid);
        callback(null, cid);
    });
}

function _removeContainer(fsid, callback) {
    var cmd;
    cmd = 'sudo docker rm -f ' + getName(fsid);
    logger.debug('docker remove cmd: ' + cmd);
    exec(cmd, function (err) {
        if (err) {
            return callback(err);
        }
        callback(null);
    });
}

function _createWorkDir(cid, callback) {
    var cmd;
    var template;
    var workDir;

    workDir = getWorkDir(cid);
    template = _.template(
        'sudo install ' +
        '-o <%= owner %> ' +
        '-g <%= owner %> ' +
        '-d <%= workDir %>');
    cmd = template({
        owner: config.userid,
        workDir: workDir
    });
    logger.debug('docker create directory: ' + workDir);
    exec(cmd, function (err) {
        if (err) {
            return callback(err);
        }
        return callback(null, cid, workDir);
    });
}

Docker.create = function (fsid, callback) {
    var rollback = false;
    async.waterfall([
        _.partial(_createContainer, fsid),
        function (cid, next) {
            rollback = true;
            _createWorkDir(cid, next);
        },
        function (cid, workDir, next) {
            var rootPath;
            rootPath = (new WebidaFS(fsid)).getRootPath();
            logger.debug('docker create symlink: ' + workDir + ' -> ' + rootPath);
            fs.symlink(workDir, rootPath, function (err) {
                next(err, cid);
            });
        }
    ], function (err, cid) {
        if (err) {
            logger.debug('Failed to create docker fs', err);
            if (!rollback) {
                return callback(err);
            }
            /* try to cleanup container */
            _removeContainer(fsid, function (_err) {
                if (_err) {
                    logger.debug('rollback: removeContainer failed', _err);
                }
                return callback(err);
            });
        } else {
            return callback(null, getRootPath(cid));
        }
    });
};

Docker.destroy = function (fsid, immediate, callback) {
    if (!immediate) {
        var container = fsidToContainer[fsid];
        if (container) {
            container.stop();
        }
        return callback(null);
    }

    async.series([
        function (next) {
            var rootPath;
            rootPath = (new WebidaFS(fsid)).getRootPath();
            logger.debug('docker remove symlink: ' + rootPath);
            fs.unlink(rootPath, next);
        },
        _.partial(_removeContainer, fsid)
    ], function (err) {
        if (err) {
            logger.debug('Failed to remove docker fs', err);
        }
        return callback(err);
    });
};

Docker.supportTerminal = function () {
    return true;
};

module.exports = Docker;
