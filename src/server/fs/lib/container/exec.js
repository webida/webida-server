'use strict';

/*
 * supported options
 * options = {
 *      cwd: <cwd>,
 *      interactive: <true|false>,
 * }
 */
function ContainerExec(wfs, cmd, args, options) {
    this.wfs = wfs;
    this.fsid = wfs.getId();
    this.cmd = cmd;
    this.args = args;
    this.options = options || {};
    this.proc = null;
    this.cpid = null;
}

ContainerExec.prototype.setProc = function (proc) {
    this.proc = proc;
};

ContainerExec.prototype.setCPid = function (cpid) {
    this.cpid = cpid;
};

ContainerExec.prototype.getCmd = function () {
    return this.cmd;
};

ContainerExec.prototype.getArgs = function () {
    return this.args;
};

ContainerExec.prototype.getCmdStr = function () {
    function escapeShellCmdComponent(cmd) {
        return '"' + cmd.replace(/(["$`\\])/g, '\\$1') + '"';
    }

    var cmdStr = this.cmd;
    var args = this.args;
    if (args) {
        var _ = require('lodash');
        cmdStr = cmdStr + ' ' + _.map(args, escapeShellCmdComponent).join(' ');
    }
    return cmdStr;
};

ContainerExec.prototype.kill = function (signal, callback) {
    var proc = this.proc;

    if (typeof signal === 'function') {
        callback = signal;
        signal = null;
    }

    signal = signal || 'SIGTERM';
    callback = callback || function () {
    };

    if (proc) {
        try {
            proc.kill(signal);
        } catch (e) {
            return callback(e);
        }
    }
    callback(null);
};

ContainerExec.prototype.destroy = function (callback) {
    if (callback) {
        callback(null);
    }
};

exports.ContainerExec = ContainerExec;
