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

var util = require('util');
var events = require('events');
var EventEmitter = require('events').EventEmitter;

var logger = require('./log-manager');

/*
 * Svc class is collection of servers
 */

function Svc(unitName, svcType, conf) {
    this.unitName = unitName;
    this.svcType = svcType;
    this.config = conf;
    this.svrList = [];
    this.emit = new EventEmitter();

    logger.log('info','svc create : unitName %s, type ^s', unitName, svcType);

    var self = this;
    this.emit.on('svr-started', function(svr) {
        self.onSvrStarted(svr);
    });

    this.emit.on('svr-stopped', function(svr) {
        self.onSvrStopped(svr);
    });
}

util.inherits(Svc, events.EventEmitter);

Svc.prototype.addSvr = function(svr) {
    this.svrList.push(svr);
};

Svc.prototype.getConfig = function () {
    return this.config;
};

/*
 * start service should start all servers
 * if you want change default behavior of this function, then do overwride.
 */
Svc.prototype.start = function () {
    logger.info('svc::start %s', this.constructor.name);
};

Svc.prototype.started = function() {
    logger.info('svc::started %s', this.constructor.name);
};

/*
 * stop service that shutdowns all servers
 */
Svc.prototype.stop = function() {
    logger.info('svc::stopping %s', this.constructor.name);
    for (var i=0; i< this.svrList.length; i++) {
        var svr = this.svrList[i];
        svr.stop();
    }
};

Svc.prototype.stopped = function() {
    logger.info('svc::stopped %s', this.constructor.name);
};

/*
 * emitted when each server is started
 */
Svc.prototype.onSvrStarted = function(svr){}
Svc.prototype.onSvrStopped = function(svr){}


exports.Svc = Svc;


