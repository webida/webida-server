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
 * @file LXC Container
 * @since 1.4.0
 * @author hyunseok.kil@samsung.com
 * @extends Container
 */

'use strict';

var _ = require('lodash');
var path = require('path');
var util = require('util');
var shortid = require('shortid');
var childProc = require('child_process');
var ptyjs = require('pty.js');

var loggerFactory  = require('../../../common/logger-factory');
var Container = require('./Container');

var config = require('../../../common/conf-manager').conf.services.fs.container;
var logger = loggerFactory.getLogger();

var ipManager = {
    DEFAULT_IP_TEMPLATE: '10.<%= subip %>/8',
    DEFAULT_GATEWAY: '10.0.0.1',
    inUsed: config.lxc.net.reserved || {
        '0.0.0': null,
        '255.255.255': null,
        '0.0.1': null
    },
    lastUsedValue: config.lxc.net.base || '0.0.1',   // 0.0.2 ~ 255.255.254
    getAvailableIp: function () {
        function _getNext(prevIpHost){
            var splittedIp = prevIpHost.split('.');
            for (var i = splittedIp.length-1, carried=true; i >= 0; i--) {
                if (carried) {
                    splittedIp[i]++;
                    carried = false;
                }
                if (splittedIp[i] > 255) {
                    splittedIp[i] = 0;
                    carried = true;
                    if(i === 0){
                        splittedIp.fill(0);
                    }
                }
            }
            return splittedIp.join('.');
        }

        var next = _getNext(this.lastUsedValue);
        while (next in this.inUsed) {
            next = _getNext(next);
        }
        this.lastUsedValue = next;
        this.inUsed[next] = null;
        return next;
    },
    releaseIp: function (ip) {
        logger.debug('lxc return ip: ' + ip);
        delete this.inUsed[ip];
    }
};

function Lxc(wfs, cmd, args, options) {
    Lxc.super_.call(this, wfs, cmd, args, options);
    this.originalCmd = this.cmd;
    this.cmd = 'sudo';
    this.ipHostAddr = ipManager.getAvailableIp();
    this.containerName = config.namePrefix + shortid.generate();
}
util.inherits(Lxc, Container);

Lxc.prototype.getArgs_ = function (interactive) {
    var ipv4 = _.template(config.lxc.net.ip || ipManager.DEFAULT_IP_TEMPLATE)({subip: this.ipHostAddr});
    var args = ['/usr/bin/lxc-execute',
        '-n', this.containerName,
        '-f', config.lxc.confPath,
        '-s', 'lxc.mount.entry=' + this.wfs.getRootPath() + ' fs none rw,bind 0 0',
        '-s', 'lxc.network.ipv4=' + ipv4,
        '-s', 'lxc.network.ipv4.gateway=' + (config.lxc.net.gw || ipManager.DEFAULT_GATEWAY),
        '--'];

    if (interactive) {
        args = args.concat(['su', config.userid, '-l']);
    } else {
        var cmdStr = this.getCmdStr_();
        if (this.options.cwd) {
            cmdStr = 'cd ' + path.join('$HOME', this.options.cwd) + '; ' + cmdStr;
        }
        args = args.concat(['su', config.userid, '-c', cmdStr]);
    }

    return args;
};

Lxc.prototype.getCmdStr_ = function () {
    var cmdStr = this.originalCmd;
    if (this.args) {
        cmdStr += ' ' + this.args.map(this.escapeCmd_).join(' ');
    }
    return cmdStr;
};

Lxc.prototype.getOptions_ = function () {
    var options = Lxc.super_.prototype.getOptions_.call(this);
    delete options.cwd;
    return options;
};

Lxc.prototype.execute = function (callback) {
    if(this.originalCmd && this.originalCmd === 'git.sh') {
        // Make an exception for execution of git.sh because of its unstable action in LXC
        this.proc = childProc.spawn('git.sh', this.args, {
            cwd: path.join(this.wfs.getRootPath(), this.options.cwd),
            env: this.getOptions_().env
        });
        this.afterExecute_(callback);
    } else {
        Lxc.super_.prototype.execute.call(this, callback);
    }
};

Lxc.prototype.executeTerminal = function (callback) {
    this.proc = ptyjs.spawn(this.getCmd_(), this.getArgs_(true), {
        name: 'xterm-color',
        cols: this.options.cols,
        rows: this.options.rows
    });
    this.afterExecute_(callback);
};

Lxc.prototype.doKill_ = function (signal, callback) {
    if (this.proc) {
        childProc.exec(['sudo', '/usr/bin/lxc-stop', '-n', '"' + this.containerName + '"', '-k'].join(' '), callback);
    } else {
        callback();
    }
};

Lxc.prototype.onTerminated_ = function (callback) {
    if (this.ipHostAddr) {
        ipManager.releaseIp(this.ipHostAddr);
        this.ipHostAddr = null;
    }
    Lxc.super_.prototype.onTerminated_.call(this, callback);
};

Lxc.supportTerminal = function () {
    return true;
};

Lxc.create = Lxc.super_.create;
Lxc.destroy = Lxc.super_.destroy;

module.exports = Lxc;
