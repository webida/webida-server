'use strict';

var _ = require('lodash');
var path = require('path');
var util = require('util');
var async = require('async');
var exec = require('child_process').exec;
var EventEmitter = require('events').EventEmitter;

var conf = require('../../../common/conf-manager').conf;
var logger = require('../../../common/log-manager');
var ContainerExec = require('./exec').ContainerExec;
var none = require('./none');

var config = conf.services.fs.container;

/* get container name */
function getName(fsid) {
    return config.namePrefix + fsid;
}

/*
 * lxc container state transition
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

function LxcContainer(fsid, wfs) {
    EventEmitter.call(this);

    this.fsid = fsid;
    this.wfs = wfs;
    this.name = getName(fsid);
    this.state = STATE.STOPPED;
    this.count = 0;
    this.waitCnt = 0;
    this.timerId = null;
}
util.inherits(LxcContainer, EventEmitter);

LxcContainer.prototype.start = function (callback) {
    if (this.state === STATE.RUNNING) {
        return callback(null, this);
    }

    var self = this;
    if (this.state === STATE.STOPPED) {
        var cmd;
        this.state = STATE.STARTING;
        async.waterfall([
            function (next) {
                /* start lxc container */
                var template = _.template(
                    'sudo /usr/bin/lxc-start -d ' +
                    '-n <%= cName %> ' +
                    '-f <%= confPath %> ' +
                    '-s \'lxc.rootfs=<%= rootfsPath %>\' ' +
                    '-s \'lxc.mount.entry=<%= fsPath %> fs none rw,bind 0 0\'');
                cmd = template({
                    cName: self.name,
                    confPath: config.lxcd.confPath,
                    rootfsPath: config.lxcd.rootfsPath,
                    fsPath: self.wfs.getRootPath()
                });
                logger.debug('lxc container start cmd: ' + cmd);
                exec(cmd, function (err) {
                    /* lxc already running is not an error */
                    if (err) {
                        logger.debug('Failed to start lxc container: ' +
                            self.name, err);
                    }
                    return next(err);
                });
            },
            function (next) {
                /* wait lxc is running */
                cmd = 'sudo /usr/bin/lxc-wait -s RUNNING -n ' + self.name;
                logger.debug('lxc container wait cmd: ' + cmd);
                exec(cmd, function (err) {
                    if (err) {
                        logger.debug('Failed to wait lxc container: ' +
                            self.name, err);
                    }
                    return next(err);
                });
            }
        ], function (err) {
            if (err) {
                self.state = STATE.STOPPED;
                self.emit('status', self.state, err);
                return callback(err);
            }

            logger.debug('lxc container running: ' + self.name);
            self.state = STATE.RUNNING;
            self.emit('status', self.state);
            callback(null, self);
        });
    } else {
        logger.debug('lxc: waiting container(' + this.name + ') status. ' +
                'current - ' + this.state);
        this.waitCnt++;
        this.once('status', function (state, err) {
            self.waitCnt--;
            if (state === STATE.RUNNING) {
                logger.debug('EVENT: lxc container is running', self.name);
                return callback(null, self);
            } else if (err) {
                logger.debug('EVENT: lxc container error', self.name, err);
                return callback(err);
            } else {
                logger.debug('EVENT: lxc container retry', self.name);
                return self.start(callback);
            }
        });
    }
};

LxcContainer.prototype.stop = function () {
    if (this.state === STATE.STOPPED) {
        return;
    }

    if (this.state === STATE.RUNNING) {
        var self = this;
        var waitTime = config.lxcd.waitTime;
        var cmd = 'sudo /usr/bin/lxc-stop';
        if (waitTime > 0) {
            cmd += ' -t ' + waitTime;
        }
        cmd += ' -n ' + this.name;
        logger.debug('lxc container stop cmd: ' + cmd);
        this.state = STATE.STOPPING;
        exec(cmd, function (err) {
            if (err) {
                logger.warn('Failed to stop lxc container: ' + self.name, err);
            }

            self.state = STATE.STOPPED;
            if (self.waitCnt === 0) {
                delete fsidToContainer[self.fsid];
            }
            logger.debug('lxc container stopped: ' + self.name);
            self.emit('status', self.state);
        });
    }
};

LxcContainer.prototype.get = function (callback) {
    /* cancel stop timer */
    if (this.timerId) {
        logger.debug('lxc timer cancel: ' + this.name);
        clearTimeout(this.timerId);
        this.timerId = null;
    }

    if (this.state === STATE.RUNNING) {
        this.count++;
        logger.debug('lxc increase refs: ' +
                this.name + ', ' + this.count);
        return callback(null, this);
    }

    var self = this;
    this.start(function (err) {
        if (err) {
            return callback(err);
        }
        self.count++;
        logger.debug('lxc increase refs: ' +
                self.name + ', ' + self.count);
        return callback(null, self);
    });
};

LxcContainer.prototype.put = function () {
    this.count--;
    logger.debug('lxc decrease refs: ' +
            this.name + ', ' + this.count);
    if (this.count === 0) {
        var expire = config.lxcd.expireTime;
        if (!expire) {
            this.stop();
        } else if (expire > 0) {
            var self = this;
            logger.debug('lxc timer register: ' +
                    this.name + ', timeout=' + expire);
            this.timerId = setTimeout(function () {
                logger.debug('lxc timer expired: ' +
                    self.name + ', ' + self.count);
                self.timerId = null;
                if (self.count === 0) {
                    self.stop();
                }
            }, expire * 1000);
        }
    }
};

function LxcExec(container, wfs, cmd, args, options) {
    ContainerExec.call(this, wfs, cmd, args, options);
    this.container = container;
}
util.inherits(LxcExec, ContainerExec);

LxcExec.prototype.getCmd = function () {
    return 'sudo';
};

LxcExec.prototype.getArgs = function () {
    var options = this.options;
    var name = getName(this.fsid);
    var args = ['/usr/bin/lxc-attach',
        '-n', name,
        '--'];

    if (options.interactive) {
        args = args.concat(['su', config.userid, '-l']);
    } else {
        var cwd = options.cwd;
        var cmdStr = ContainerExec.prototype.getCmdStr.call(this);
        if (cwd) {
            cwd = path.join('$HOME', cwd);
            cmdStr = 'cd "' + cwd + '"; ' + cmdStr;
        }
        args = args.concat(['su', config.userid, '-c', cmdStr]);
    }

    return args;
};

LxcExec.prototype.getCmdStr = function () {
    var options = this.options;
    var cmd = this.getCmd();
    var args = this.getArgs();
    if (!options.interactive) {
        var last = args.pop();
        if (last) {
            args.push('\'' + last + '\'');
        }
    }
    var cmdStr = cmd + ' ' + args.join(' ');
    return cmdStr;
};

LxcExec.prototype.kill = function (signal, callback) {
    var proc = this.proc;
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

    cmd = ['sudo', '/bin/kill', '-s', signal, proc.pid].join(' ');
    logger.debug('lxc kill cmd: ' + cmd);
    exec(cmd, callback);
};

LxcExec.prototype.destroy = function (callback) {
    callback = callback || function () {
    };
    //logger.debug('lxc destroy');
    this.container.put();
    callback(null);
};

function createFs(fsid, callback) {
    none.createFs(fsid, callback);
}
exports.createFs = createFs;

function deleteFs(fsid, immediate, callback) {
    if (immediate) {
        none.deleteFs(fsid, immediate, callback);
    } else {
        var container = fsidToContainer[fsid];
        if (container) {
            container.stop();
        }
        return callback(null);
    }
}
exports.deleteFs = deleteFs;

function getContainerExec(wfs, cmd, args, options, callback) {
    var fsid = wfs.getId();
    var container = fsidToContainer[fsid];

    if (!container) {
        container = new LxcContainer(fsid, wfs);
        fsidToContainer[fsid] = container;
    }

    container.get(function (err, container) {
        var cexec;

        if (err) {
            return callback(err);
        }

        cexec = new LxcExec(container, wfs, cmd, args, options);
        callback(null, cexec);
    });
}
exports.getContainerExec = getContainerExec;

exports.supportTerminal = function () {
    return true;
};
