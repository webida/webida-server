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

var async = require('async');
var path = require('path');
var request = require('request');
var tmp = require('tmp');
var fs = require('fs');
var w = require('../node_modules/webida-library/webida/src/webida-0.3');
var authMgr = require('../node_modules/webida-server-lib/lib/auth-manager');
var conf = require('../node_modules/webida-server-lib/lib/conf-manager').conf;

var db = require('mongojs').connect('webida_app_test', ['apps']);

var account = {email: 'test1@webida.org', uid: 200000};
var testDomain = account.uid + '-test';
var testAppId;

var app;
var appMgr;
var isAdminValue = true;

authMgr.verifyToken = function(req, res, next) {
    req.user = {};
    req.user.uid = account.uid;
    req.user.isAdmin = isAdminValue;
    next();
}

var tokenGen = {};
tokenGen.validateToken = function (token) {
    return true;
};

tokenGen.generateNewToken = function (cb) {
    console.log('generateNewToken');
    cb();
};

console.log(request);
exports['Test setup'] = {
    'setup': function (test) {
        async.series([
            function(callback){
                console.log('clear previous db');
                db.dropDatabase(callback);
            },
            function(callback) {
                //conf.logPath = path.normalize(__dirname + '/log');
                conf.logPath = null;
                conf.httpPort =  6001;
                conf.httpsPort = null;
                conf.appDb = 'mongodb://localhost:27017/webida_app_test';
                conf.appsPath = __dirname + '/apps';
                //w.conf.webidaHost = 'http://localhost:' + conf.httpPort;
                w.conf.appServer = 'http://localhost:' + conf.httpPort;
                w.conf.appApiBaseUrl = w.conf.appServer + '/webida/api/app';
                console.log('setup test conf and run test install.', conf);
                callback();
            },
            function (callback) {
                console.log('Create apps directroy.');
                fs.rmdir(conf.appsPath, function () {
                    fs.mkdir(conf.appsPath, function() {
                        fs.mkdir(conf.appsPath + '/deleted', function () {
                            /* ignore rmdir, mkdir error */
                            callback();
                        });
                    });
                });
            },
            function (callback) {
                console.log('Run test app server.');
                app = require('../server');
                setTimeout(callback, 1000);
            },
            function (callback) {
                console.log('init webida.js auth.');
                w.auth.initAuth('clientId', 'nourl', tokenGen);
                callback();
            }
        ],
        function (err, result) {
            if (err) {
                console.log('App server install or initialize failed.');
                process.exit(1);
            } else {
                console.log('App server installed and initialized successfully.');
                test.done();
            }
        });
    },
}

exports['Get host'] = {
    'getHost': function (test) {
        host = w.app.getHost()
        console.log('getHost', host);
        test.ok(host, host);
        test.done();
    }
};

exports['Is valid app type'] = {
    'isValidAppType': function (test) {
        valid = w.app.isValidAppType('html')
        console.log('isValidAppType', valid);
        test.ok(valid, valid);
        test.done();
    }
};

exports['Create app'] = {
    'createApp': function (test) {
        w.app.createApp(testDomain, 'html', 'test app', 'desc', function (err) {
            console.log('createApp', testDomain, arguments);
            test.ok(!err, err);
            test.done();
        });
    },
    'createApp-domain-dup': function (test) {
        w.app.createApp(testDomain, 'html', 'test app', 'desc', function (err) {
            console.log('createApp', testDomain, arguments);
            test.ok(err, 'This should be fail:' + err);
            test.done();
        });
    }
};

exports['Get my app info'] = {
    'getMyAppInfo': function (test) {
        w.app.getMyAppInfo(function (err, data) {
            console.log('getMyAppInfo', arguments);
            test.ok(!err, err);
            test.ok(data, data);
            test.ok(data[0], 'data[0] exists');
            test.ok(data[0].appid, 'data[0].appid exists');
            testAppId = data[0].appid;
            test.done();
        });
    }
};

exports['Get app info'] = {
    'getAppInfo': function (test) {
        w.app.getAppInfo(testAppId, function (err, data) {
            console.log('getAppInfo', arguments);
            test.ok(!err, err);
            test.ok(data, data);
            test.done();
        });
    }
};

/* check for user admin */
exports['Get all app info'] = {
    'getAllAppInfo': function (test) {
        w.app.getAllAppInfo(function (err, data) {
            console.log('getAllAppInfo', arguments);
            test.ok(!err, err);
            test.ok(data, data);
            test.done();
        });
    }
};

exports['Is valid domain'] = {
    'isValidDomain': function (test) {
        w.app.isValidDomain(testDomain + '1', function (err, data) {
            console.log('isValidDomain', arguments);
            test.ok(!err, err);
            test.ok(data, data);
            test.done();
        });
    }
};

exports['Set app info'] = {
    'setAppInfo': function (test) {
        w.app.setAppInfo(testAppId, testDomain, 'html', 'test', 'test', null, function (err) {
            console.log('setAppInfo', arguments);
            test.ok(!err, err);
            test.done();
        });
    }
};

/* deploy app file fail case */
/* Fail reason : file size is too big */

exports['Deploy app quota over error case'] = {
    'deployApp': function (test) {
        /* Update deployFromWebidaFS */
        var oldAppQuota = conf.appQuotaSize;
        conf.appQuotaSize = 100;

        appMgr = require('../lib/app-manager');
        var srcUrl = 'wfs://fsid/p/a/t/h';
        var oldDeployFromWebidaFS = appMgr.deployFromWebidaFS;
        isAdminValue = false;

        appMgr.deployFromWebidaFS = function (appid, wfsPathUrl, user, callback) {
            console.log('[[[Using my deployFromWebidaFS]]]');

            var packageFile = './test/tmp-app.zip';
            appMgr.deployPackageFile(appid, packageFile, '', user, callback);
        }

        w.app.deployApp(testAppId, srcUrl, 'url', function (err) {
            console.log('deployApp', arguments);
            conf.appQuotaSize = oldAppQuota;
            appMgr.deployFromWebidaFS = oldDeployFromWebidaFS;
            isAdminValue = true;
            test.ok(err, err);
            test.done();
        });
    }
};

/* deploy app file */
/* It must be support stub function which deployFromWebidaFS */
exports['Deploy app using zip file'] = {
    'deployApp': function (test) {

        appMgr = require('../lib/app-manager');
        var srcUrl = 'wfs://fsid/p/a/t/h';
        var oldDeployFromWebidaFS = appMgr.deployFromWebidaFS;

        appMgr.deployFromWebidaFS = function (appid, wfsPathUrl, user, callback) {
            console.log('[[[Using my deployFromWebidaFS]]]');

            var packageFile = path.join(__dirname, '/tmp-app.zip');
            appMgr.deployPackageFile(appid, packageFile, '', user, callback);
        }

        w.app.deployApp(testAppId, srcUrl, 'url', function (err) {
            console.log('deployApp', arguments);
            appMgr.deployFromWebidaFS = oldDeployFromWebidaFS;
            test.ok(!err, err);
            test.done();
        });
    }
};

/* deploy app file */
/* It must be support stub function which deployFromWebidaFS */
exports['Deploy app using tar.gz file'] = {
    'deployApp': function (test) {
        /* Update deployFromWebidaFS */
        appMgr = require('../lib/app-manager');
        var srcUrl = 'wfs://fsid/p/a/t/h';
        var oldDeployFromWebidaFS = appMgr.deployFromWebidaFS;

        appMgr.deployFromWebidaFS = function (appid, wfsPathUrl, user, callback) {
            console.log('[[[Using my deployFromWebidaFS]]]');

            var packageFile = './test/tmp-app.tar.gz';
            appMgr.deployPackageFile(appid, packageFile, '', user, callback);
        }
        w.app.deployApp(testAppId, srcUrl, 'url', function (err) {
            console.log('deployApp', arguments);
            appMgr.deployFromWebidaFS = oldDeployFromWebidaFS ;
            test.ok(!err, err);
            test.done();
        });
    }
};

exports['Stop app'] = {
    'stopApp': function (test) {
        w.app.stopApp(testAppId, function (err) {
            console.log('stopApp', arguments);
            test.ok(!err, err);
            test.done();
        });
    }
};

exports['Start app'] = {
    'startApp': function (test) {
        w.app.startApp(testAppId, function (err) {
            console.log('startApp', arguments);
            test.ok(!err, err);
            test.done();
        });
    }
};

exports['Delete app'] = {
    'deleteApp': function (test) {
        w.app.deleteApp(testAppId, function (err) {
            console.log('deleteApp', arguments);
            test.ok(!err, err);
            test.done();
        });
    }
};

exports['Test cleanup'] = {
    'cleanup': function (test) {
        db.dropDatabase();
        db.close();
        app.shutdownServer();
        test.done();
    }
};

