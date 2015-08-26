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
var cron = require('cron'); 
var cuid = require('cuid'); 

//
// BatchSvc
//

var BatchSvc = function (svcName, conf) {
    baseSvc.call(this, svcName, conf);
    logger.info('BatchSvc construction with conf', conf); 
    this.jobs = {}; 
};

extend(BatchSvc, baseSvc);

BatchSvc.prototype.start = function () {
    var self = this;
    logger.info('start BatchSvc'); 

    self.loadJob('guestReaper'); 
    for (var x in self.jobs) {
        self.jobs[x].start(); 
    }
    self.holder = setInterval( function() {
        console.debug('batch online'); 
    }, 10*1000); 
}

BatchSvc.prototype.loadJob = function (jobName) {
    var self = this; 
    var jd = require('./' + jobName + '.js').jd; 
    logger.debug('loaded cron job descriptor %s', jobName, jd); 

    jd.cronTime = jd.cronTime || self.getConfig().cronTime[jobName];
    jd.start = false; 

    jd.context = {
        name:jobName, 
        runCounter:0, 
        runId:'', 
        runAt:null
    }

    jd.onComplete = function() {
        var endTime = new Date(); 
        logger.info('%s job completed with context', jobName, jd.context); 
    }; 

    jd.onTick = function() {
        logger.info('%s job started', jobName)
        jd.context.runAt = new Date(); 
        jd.context.runCounter++; 
        jd.context.runId = cuid(); 
        return jd.jobMain(jd.context); 
    }
    
    var newJob = new cron.CronJob(jd); 
    self.jobs[jobName] = newJob; 
}

BatchSvc.prototype.stop = function () {
    var self = this;
    logger.info('stop BatchSvc'); 
    for (var x in self.jobs) {
        self.jobs[x].stop(); 
        logger.info('cron job ' + x + 'stopped');  
    }
    clearInterval(self.holder); 
}

BatchSvc.prototype.started = function () {
    logger.info('BatchSvc started');
}

BatchSvc.prototype.stopped = function () {
    logger.info('BatchSvc stopped');
}

exports.Svc = BatchSvc;

