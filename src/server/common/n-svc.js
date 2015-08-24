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

var logger = require('./log-manager');
var domain = require('domain');
var util = require('util');
var events = require('events');
var EventEmitter = require('events').EventEmitter;
/*
 * Svc class is collection of servers
 */

function Svc(unitName, svcType, conf) {
    this.unitName = unitName;
    this.svcType = svcType;
    this.config = conf;
    this.svrList = new Array();
    this.emit = new EventEmitter();

    logger.log('info','## based svc type (', svcType, ') created');

    var self = this;
    this.emit.on('svr-started', function(svr) {
        self.onSvrStarted(svr);
    });

    this.emit.on('svr-stopped', function() {
        self.onSvrStopped(svr);
    });
}

util.inherits(Svc, events.EventEmitter);

Svc.prototype.addSvr = function(svr) {
    this.svrList.push(svr);
}

Svc.prototype.getConfig = function () {
    return this.config;
}

/*
 * start service should start all servers
 * if you want change default behavior of this function, then do overwride.
 */
Svc.prototype.start = function () {
    logger.info('svc::start');
    var self = this;

}

Svc.prototype.started = function() {
    logger.info('svc::started');
}

/*
 * stop service that shutdowns all servers
 */
Svc.prototype.stop = function() {
    logger.info('stopping server');
    for (var i=0; i<svrList.length; i++) {
        var svr = svrList[i];
        svr.stop();
    }
    logger.info('gracefully shutting down from shutdownServer');
}

Svc.prototype.stopped = function() {
    logger.info('stopped');

}

/*
 * emitted when each server is started
 */
Svc.prototype.onSvrStarted = function(svr){}
Svc.prototype.onSvrStopped = function(svr){}


exports.Svc = Svc;


