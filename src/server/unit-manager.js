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

var util = require('util');
var path = require('path');
var fs = require('fs');
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var config = require('./common/conf-manager').conf;


//
// load conf file
//
var logger = null;

var App = function () {
    this.svcList = new Array();
}

global.app = new App();
global.app.config = config;

function getMainModuleDir() {
    var mod = module;
    while (mod.parent) {
        mod = mod.parent;
    }
    return path.dirname(mod.filename);
}

function parseCommandLine(cb) {
    var args = process.argv.slice(2);
    console.log('args : ', args[0]);

    if (!args[0]) {
        console.log('there is no arg.');
        return cb(false);
    }
    var params = args[0].split('=');  
    console.log(params[0]);
    var cat = params[0];
    if (cat !== 'svc') {
        console.log('invalid argument');
        return cb(false);
    }
    var unitName = params[1];
    if (!unitName) {
        console.log('invalid unitName');
        return cb(false);
    }

    return cb(true, unitName);
}


parseCommandLine(function (succ, unitName) {
    if (succ) {
        global.app.name = unitName;
        global.app.isOne = true;
    } else {
        global.app.name = 'nimbus';
        global.app.isOne = false;
    }
    logger = require('./common/log-manager');
    function formatArgs(args){
        return [util.format.apply(util.format, Array.prototype.slice.call(args))];
    }

    console.log = function(){
        logger.debug.apply(logger, formatArgs(arguments));
    };
    console.info = function(){
        logger.info.apply(logger, formatArgs(arguments));
    };
    console.warn = function(){
        logger.warn.apply(logger, formatArgs(arguments));
    };
    console.error = function(){
        logger.error.apply(logger, formatArgs(arguments));
    };
    console.debug = function(){
        logger.debug.apply(logger, formatArgs(arguments));
    };
});


function loadSvc(mainDir, conf, unitConf) {
    console.log('################### Begin to load service ###################');
    var svcType = unitConf.serviceType;
    logger.log('info', 'svcname = %s', svcType);
    var SvcClass = null; 
    var svcConfig = conf.services[svcType];
    if (typeof svcConfig !== 'undefined' && svcConfig.modulePath) {
        var modulePath = svcConfig.modulePath;
        console.log('moudlePath:', modulePath);
        SvcClass = require(mainDir + '/' + modulePath).Svc;
    } else {
        var svcTypeDir = mainDir + '/' + svcType;
        logger.log('info', 'svcdir = %s', svcTypeDir);

        if (!fs.existsSync(svcTypeDir)) {
            logger.error('svcdir(%s) doesn\'t exist', svcTypeDir);
            return false;
        }
        SvcClass = require(svcTypeDir + '/' + svcType).Svc;
    } 
   
    if (!SvcClass) {
        logger.error('failed to create SvcCalss:');
        return false;
    } 
    var svc = new SvcClass(svcType, unitConf);
    svc.start();
    console.log('------------------ End to load service ---------------------');
    global.app.svcList.push(svc);
    return true;
}

function loadUnits(conf) {
    var mainDir = getMainModuleDir();
    console.log('main module dir = %s', mainDir);
    for (var i in conf.units) {
        var unitName = conf.units[i];
        var unitConf = conf[unitName];
        console.log('unit name = ', unitName);    
        console.log('unit info = ', unitConf);
        if (!loadSvc(mainDir, conf, unitConf)) {
            console.error('failed to load service (', unitName, ')');
        } 
    }
}

function loadOneUnit(targetUnit, conf) {
    var mainDir = getMainModuleDir();
    console.log('main module dir = %s', mainDir);
    for (var i in conf.units) {
        var unitName = conf.units[i];
        if (unitName === targetUnit) {
            var unitConf = conf[unitName];
            console.log('unit name = ', unitName);    
            console.log('unit info = ', unitConf);
            if (!loadSvc(mainDir, conf, unitConf)) {
                console.error('failed to load service (', unitName, ')');
            }
            break;
        }
    }
}


function runModule() {
    if (global.app.isOne) {
        loadOneUnit(global.app.name, config);
    } else {
        loadUnits(config);
    }
}

// TODO: need to make collecting log in multiple process to configurable

if (config.workerInfo && config.workerInfo.multicoreSupported && global.app.name !== 'nimbus') {
    if (cluster.isMaster) {
        console.log('num of CPUs = ' , numCPUs);
        for (var i=0; i<numCPUs; i++) {
            cluster.fork();
        }

        // setup logger
        cluster.on('exit', function (worker, code, signal) {
            console.log('worker ' + worker.process.pid + ' died');
            console.log('worker %d died (%s). restarting ...', 
                worker.process.pid, signal || code); 
            cluster.fork();
        });

        cluster.on('online', function (worker) {
            console.log('worker responded after it was forked');
            worker.process.stdout.on('data', function(chunk) {
                logger.info('worker ' + worker.process.pid + ': ' + chunk);
            });

            worker.process.stderr.on('data', function(chunk) {
                logger.info('worker ' + worker.process.pid + ': ' + chunk);
            });
        });

        cluster.on('listening', function (worker, address) {
            console.log('A worker is now connected to ' + address.address + ':' + address.port);
        });

        cluster.on('disconnect', function (worker) {
            console.log('The worker #' + worker.id + ' has disconnected');
        });

    } else if (cluster.isWorker) {
        console.log('The worker process invoked.');
        runModule();
    }

} else {
    console.log('run in single process');
    runModule();
}



function unloadSvc() {
    for (var i in global.app.svcList) {
        var svc = global.app.svcList[i];
        svc.stop();
    }
}


function gracefulExit() {
    unloadSvc();
    process.exit();
}


process.on('SIGINT', function () {
    console.log('gracefully shutting down from SIGINT (Crtl-C)');
    gracefulExit();
});

process.on('SIGTERM', function () {
    console.log('gracefully shutting down from SIGTERM');
    gracefulExit();
});



