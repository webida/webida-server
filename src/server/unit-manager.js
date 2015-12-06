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

var path = require('path');
var fs = require('fs');
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;

var App = function () {
    this.svcList = [];
    this.config = null;
    this.name = null; 
    this.allInOne = false; 
};

global.app = new App();

function getMainModuleDir() {
    var mod = module;
    while (mod.parent) {
        mod = mod.parent;
    }
    return path.dirname(mod.filename);
}

// TODO : better command-line parser
function getUnitName() {
    var args = process.argv.slice(2);
    if (!args[0]) {
        return null;
    }
    let params = args[0].split('=');
    let cat = params[0];
    if (cat !== 'svc') {
        return null;
    }
    return params[1];
}

var unitName = getUnitName();
if (unitName) {
    global.app.name = unitName;
    global.app.isAllInOneMode = false;
} else {
    global.app.name = 'nimbus';
    global.app.isAllInOneMode = true;
}

var loggerFactory  = require('./common/logger-factory');
var logger = loggerFactory.getLogger();
var config = require('./common/conf-manager').conf;
global.app.config =  config;


function loadSvc(unitName, mainDir) {
    let conf = global.app.config
    let unitConf = conf[unitName];
    let serviceType = unitConf.serviceType;
    let context = {
        unitName: unitName,
        svcType: serviceType
    };
    logger.info('load service start', context);

    let svcConfig = conf.services[serviceType];
    let svcRequirePath = '';
    if (typeof svcConfig !== 'undefined' && svcConfig.modulePath) {
        let modulePath = svcConfig.modulePath;
        logger.debug('moudlePath = ' + modulePath);
        svcRequirePath = mainDir + '/' + modulePath;
    } else {
        let svcTypeDir = mainDir + '/' + serviceType;
        logger.debug('service config has no module path. svcdir =  %s' + svcTypeDir);
        svcRequirePath = svcTypeDir + '/' + serviceType;
    }
    let SvcClass = require(svcRequirePath).Svc;
    if (!SvcClass) {
        logger.error('load service error : %s does not have Svc', svcRequirePath);
        return;
    }

    let svc = new SvcClass(unitName, serviceType, conf[unitName]);
    svc.start();
    global.app.svcList.push(svc);
    logger.info('load service : completed ', context);
    return true;
}

function runModules() {
    let mainDir = getMainModuleDir();
    logger.debug('main module = %s, units = %j', mainDir, global.app.config.units);
    global.app.config.units.forEach( (unitName) => {
        if (global.app.isAllInOneMode || global.app.name === unitName) {
            loadSvc(unitName, mainDir);
        } 
    });
}

// TODO: need to make collecting log in multiple process to configurable

if (config.workerInfo && config.workerInfo.multicoreSupported && 
        global.app.name !== 'nimbus' && config[global.app.name].serviceType !== 'batch') {
    if (cluster.isMaster) {
        logger.debug('num of CPUs = ' , numCPUs);
        for (var i=0; i<numCPUs; i++) {
            cluster.fork();
        }

        // setup logger
        cluster.on('exit', function (worker, code, signal) {
            logger.info('worker %d died (%s). restarting ...',
                worker.process.pid, signal || code); 
            cluster.fork();
        });

        cluster.on('online', function (worker) {
            logger.log('worker online : responded after it was forked');
            worker.process.stdout.on('data', function(chunk) {
                logger.debug('worker ' + worker.process.pid + ': ' + chunk);
            });
            worker.process.stderr.on('data', function(chunk) {
                logger.debug('worker ' + worker.process.pid + ': ' + chunk);
            });
        });

        cluster.on('listening', function (worker, address) {
            logger.info('A worker is now connected to ' + address.address + ':' + address.port);
        });

        cluster.on('disconnect', function (worker) {
            logger.info('The worker #' + worker.id + ' has disconnected');
        });

    } else if (cluster.isWorker) {
        logger.info('The worker process invoked.');
        runModules();
    }

} else {
    logger.info('run in single process');
    runModules();
}

function gracefulExit() {
    function unloadSvc(callback) {
        global.app.svcList.forEach( (svc) => svc.stop() );
        var profiler = require('./common/profiler');
        profiler.stop(function (err) {
            if (err) {
                logger.error("stopping profiler error", err);
            }
            callback();
        });
    }
    unloadSvc(function () {
        process.exit();
    });
}

process.on('SIGINT', function () {
    logger.info('gracefully shutting down from SIGINT (Crtl-C)');
    gracefulExit();
});

process.on('SIGTERM', function () {
    logger.info('gracefully shutting down from SIGTERM');
    gracefulExit();
});
