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

var path = require('path');


var workPath = path.normalize(__dirname + '/workspaces');
logger.info('workpath =', workPath);
var options = {
    workPath: workPath
};
 

/*
 * BuildJmSvr class
 */

var BuildJmSvr = function (svc, svrName, conf) {
    baseSvr.call(this, svc, svrName, conf);
    this.jobMgr = require('./lib/build-job-manager');

    logger.info('BuildJmSvr constructor');
};

extend(BuildJmSvr, baseSvr);

BuildJmSvr.prototype.start = function () {
    var self = this;
    var conf = self.svc.config;
    logger.info('jmport =' , conf.jmListenPort);
    self.jobMgr.start(conf.jmListenPort);
}

BuildJmSvr.prototype.stop = function () {
    var self = this;
    self.jobMgr.stop();
}

//
// BuildJmSvc
//

var BuildJmSvc = function (svcName, conf) {
    baseSvc.call(this, svcName, conf);
    logger.info('BuildJmSvc constructor'); 

    logger.info('svc name = ', this.name);
    this.jmSvr = new BuildJmSvr(this, 'buildjm', conf);
};


extend(BuildJmSvc, baseSvc);

BuildJmSvc.prototype.start = function () {
    var self = this;
    logger.info('svcName = ', this.name);
    self.jmSvr.start();
}

BuildJmSvc.prototype.stop = function () {
    var self = this;
    self.jmSvr.stop();
}

BuildJmSvc.prototype.started = function () {
    logger.info('BuildJmSvc started');

}

BuildJmSvc.prototype.stopped = function () {
    logger.info('BuildJmSvc stopped');
}


exports.Svc = BuildJmSvc




