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

var logger = require('../common/log-manager');
var extend = require('../common/inherit').extend;
var utils = require('../common/utils');
var baseSvr = require('../common/n-svr').nSvr;
var baseSvc = require('../common/n-svc').Svc;

var comm = require('./lib/ntf');


/*
 * NtfSvr class
 */

var NtfSvr = function (svc, svrName, conf) {
    baseSvr.call(this, svc, svrName, conf);


    logger.info('NtfSvr constructor');
};

extend(NtfSvr, baseSvr);

NtfSvr.prototype.start = function () {
    var self = this;
    var conf = self.svc.config;

    comm.start(conf.port);    
}

NtfSvr.prototype.stop = function () {
    var self = this;
}

//
// NtfSvc
//

var NtfSvc = function (svcName, conf) {
    baseSvc.call(this, svcName, conf);
    logger.info('NtfSvc constructor'); 

    logger.info('svc name = ', this.name);
    this.ntfSvr = new NtfSvr(this, 'ntf', conf);
};


extend(NtfSvc, baseSvc);

NtfSvc.prototype.start = function () {
    var self = this;
    logger.info('svcName = ', this.name);
    self.ntfSvr.start();
}

NtfSvc.prototype.stop = function () {
    var self = this;
    self.ntfSvr.stop();
}

NtfSvc.prototype.started = function () {
    logger.info('NtfSvc started');

}

NtfSvc.prototype.stopped = function () {
    logger.info('NtfSvc stopped');
}


exports.Svc = NtfSvc


