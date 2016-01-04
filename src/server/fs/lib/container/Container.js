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
 * @file Default lifecycle for container
 * @since 1.6.2
 * @author kyungmi.k@samsung.com
 */

'use strict';
var childProc = require('child_process');
var util = require('util');
var fs = require('fs');
var fsEx = require('fs-extra');
var WebidaFS = require('../webidafs').WebidaFS;
var EventEmitter = require('events').EventEmitter;

var loggerFactory = require('../../../common/logger-factory');
var logger = loggerFactory.getLogger();

/**
 * @typedef {object} execOptions
 * @property {string} cwd
 * @property {string} env
 * @property {number} [timeout=0]
 */

/**
 *
 * @param {Object} wfs
 * @param {string} cmd - execution command
 * @param {Array.<string>} args - execution arguments
 * @param {execOptions} options
 * @constructor
 */
function Container(wfs, cmd, args, options) {
    this.wfs = wfs;
    this.fsid = wfs.getId();
    this.cmd = cmd;
    this.args = args;
    this.proc = null;
    this.cpid = null;

    this.options = Object.assign({
        cwd: this.wfs.localPath,
        timeout: 0
    }, options);
}
util.inherits(Container, EventEmitter);

/**
 * Get process for container
 * @returns {(ChildProcess|{pid})}
 */
Container.prototype.getProc = function () {
    return this.proc;
};

/**
 * Set pid for command execution in container
 * @param {number} cpid
 */
Container.prototype.setCPid = function (cpid) {
    this.cpid = cpid;
};

/**
 * Get Command string
 * @returns {string}
 * @protected
 */
Container.prototype.getCmd_ = function () {
    return this.cmd;
};

/**
 * Get argument list for command
 * @param {boolean} [interactive=false]
 * @returns {Array.<string>}
 * @protected
 */
Container.prototype.getArgs_ = function (/*interactive*/) {
    return this.args;
};

/**
 * Escape command string
 * @param {string} cmd - command string to escape
 * @returns {string}
 * @protected
 */
Container.prototype.escapeCmd_ = function (cmd) {
    return '"' + cmd.replace(/(["$`\\])/g, '\\$1') + '"';
};

/**
 * Get full original command string to execute
 * @returns {string}
 * @protected
 */
Container.prototype.getCmdStr_ = function () {
    var cmdStr = this.cmd;
    if (this.args) {
        cmdStr = cmdStr + ' ' + this.getArgs_().map(this.escapeCmd_).join(' ');
    }
    return cmdStr;
};

/**
 * Do the job after executing command
 * @param {Function} callback
 * @protected
 */
Container.prototype.afterExecute_ = function (callback) {
    var self = this;
    // timeout
    if (this.options.timeout > 0) {
        this._timeoutId = setTimeout(function () {
            logger.debug('ContainerExec timeout:', self.proc.pid);
            self.kill('SIGKILL', function (err) {
                if (err) {
                    logger.warning('failed to kill container exec', err);
                }
                self.onTerminated_();
            });
        }, this.options.timeout);
    }
    this.proc.on('exit', function () {
        logger.debug('Container exit:', arguments);
        self.onTerminated_();
    });
    this.proc.on('error', function (err) {
        logger.error('ContainerExec failed:', err);
        self.onTerminated_();
    });
    callback();
};

/**
 * Get options for execution
 * @returns {Object}
 * @protected
 */
Container.prototype.getOptions_ = function () {
    return {
        cwd: this.options.cwd,
        detached: false,
        env: Object.assign({}, process.env, {HOME: this.wfs.getRootPath()})
    };
};

/**
 * Execute command
 * @param {Function} callback
 */
Container.prototype.execute = function (callback) {
    logger.debug('Container execute: ', this.getCmdStr_());
    this.proc = childProc.spawn(this.getCmd_(), this.getArgs_(), this.getOptions_());
    this.afterExecute_(callback);
};

/**
 * Execute terminal
 * @param {Function} callback
 */
Container.prototype.executeTerminal = function (/*callback*/) {};

/**
 * kill execution process
 * @param {string} signal
 * @param {Function} callback
 * @protected
 */
Container.prototype.doKill_ = function (signal, callback) {
    try {
        this.proc.kill(signal);
        callback();
    } catch (e) {
        callback(e);
    }
};

/**
 * kill execution process
 * @param {string} signal
 * @param {Function} callback
 */
Container.prototype.kill = function (signal, callback) {
    var self = this;
    if (typeof signal === 'function') {
        callback = signal;
        signal = null;
    }

    signal = signal || 'SIGTERM';
    callback = callback || function () {};

    if (this.proc) {
        this.doKill_(signal, function (err) {
            self.onTerminated_();
            callback(err);
        });
    } else {
        this.onTerminated_();
        callback();
    }
};

/**
 * Do the job on terminating execution
 * @param {Function} [callback]
 */
Container.prototype.onTerminated_ = function (callback) {
    if (this.proc) {
        this.proc.removeAllListeners();
    }
    if (this._timeoutId) {
        clearTimeout(this._timeoutId);
    }
    if (callback) {
        callback();
    }
};

/**
 * Support terminal
 * @returns {boolean}
 */
Container.supportTerminal = function () {
    return false;
};

/**
 * Create container
 * @param {string} fsid
 * @param {Function} callback
 */
Container.create = function (fsid, callback) {
    var rootPath = (new WebidaFS(fsid)).getRootPath();
    fs.mkdir(rootPath, function (err) {
        if (err) {
            return callback(err);
        }
        return callback(null, rootPath);
    });
};

/**
 * Destroy container
 * @param {string} fsid
 * @param {boolean} immediate
 * @param {Function} callback
 */
Container.destroy = function (fsid, immediate, callback) {
    if (!immediate) {
        return callback();
    }

    var rootPath = (new WebidaFS(fsid)).getRootPath();
    fsEx.remove(rootPath, callback);
};

module.exports = Container;
