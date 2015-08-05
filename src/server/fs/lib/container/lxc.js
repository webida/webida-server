'use strict';

var _ = require('lodash');
var path = require('path');
var util = require('util');
var shortid = require('shortid');
var exec = require('child_process').exec;

var conf = require('../../../common/conf-manager').conf;
var logger = require('../../../common/log-manager');
var ContainerExec = require('./exec').ContainerExec;
var none = require('./none');

var config = conf.services.fs.container;

/* backward compatibility */
if (!config) {
    var lxcConfig = conf.services.fs.lxc;
    config = {
        userid: lxcConfig.userid,
        namePrefix: lxcConfig.containerNamePrefix + '-',
        lxc: {
            confPath: lxcConfig.confPath,
            rootfsPath: lxcConfig.rootfsPath,
            net: {
            }
        }
    };
}

var usedIpHostAddr = config.lxc.net.reserved || {
    '0.0.0': null,
    '255.255.255': null,
    '0.0.1': null
};
var ipHostLastUsed = config.lxc.net.base || '0.0.1';     // 0.0.2 ~ 255.255.254
var gateway = config.lxc.net.gw || '10.0.0.1';
var ipTemplate = _.template(config.lxc.net.ip ||
        '10.<%= subip %>/8');

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
    usedIpHostAddr[next] = null;
    //logger.debug('lxc allocate ip: ' + next);
    return next;
}

/* get container name */
function getName(/*fsid*/) {
    return config.namePrefix + shortid.generate();
}

function LxcExec(wfs, cmd, args, options) {
    ContainerExec.call(this, wfs, cmd, args, options);
    this.ipHostAddr = getAvailableIPHostAddress();
}
util.inherits(LxcExec, ContainerExec);

LxcExec.prototype.getCmd = function () {
    return 'sudo';
};

LxcExec.prototype.getArgs = function () {
    var options = this.options;
    var name = getName(this.fsid);
    var confPath = config.lxc.confPath;
    var rootfsPath = config.lxc.rootfsPath;
    var fsPath = this.wfs.getRootPath();
    var ipv4 = ipTemplate({subip: this.ipHostAddr});
    var args = ['/usr/bin/lxc-execute',
        '-n', name,
        '-f', confPath,
        '-s', 'lxc.rootfs=' + rootfsPath,
        '-s', 'lxc.mount.entry=' + fsPath + ' fs none rw,bind 0 0',
        '-s', 'lxc.network.ipv4=' + ipv4,
        '-s', 'lxc.network.ipv4.gateway=' + gateway,
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
    var ipHostAddr = this.ipHostAddr;
    callback = callback || function () {
    };
    if (ipHostAddr) {
        //logger.debug('lxc return ip: ' + ipHostAddr);
        delete usedIpHostAddr[ipHostAddr];
        this.ipHostAddr = null;
    }
    callback(null);
};

function createFs(fsid, callback) {
    none.createFs(fsid, callback);
}
exports.createFs = createFs;

function deleteFs(fsid, callback) {
    none.deleteFs(fsid, callback);
}
exports.deleteFs = deleteFs;

function getContainerExec(wfs, cmd, args, options, callback) {
    var cexec = new LxcExec(wfs, cmd, args, options);
    callback(null, cexec);
}
exports.getContainerExec = getContainerExec;

exports.supportTerminal = function () {
    return true;
};
