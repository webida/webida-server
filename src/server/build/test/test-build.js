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

var xexports = {};
var _ = require('underscore');
var async = require('async');
var path = require('path');
var fs = require('fs');
var w = require('../node_modules/webida-library/webida/src/webida-0.3');
var authMgr = require('../node_modules/webida-server-lib/lib/auth-manager');
var utils = require('../node_modules/webida-server-lib/lib/utils');
var conf = require('../node_modules/webida-server-lib/lib/conf-manager').conf;

var db = require('mongojs').connect('webida_auth', ['users', 'tokens']);

//var account1 = { email: 'test1@webida.org', password: 'test1' };
var account1 = { email: 'daiyoung777.kim@samsung.com', password: 'rtfm0202' };
//var account2 = { email: 'test2@webida.org', password: 'test2' };

//var account = {email: 'test1@webida.org', uid: 200000, isAdmin: false};

var app;

console.log(w.conf);

var tokenGen = {};
tokenGen.validateToken = function (token) {
    console.log('validateToken', token);
    if (token.data) {
        return true;
    } else {
        return false;
    }
};
tokenGen.generateNewToken = function (cb) {
    console.log('generateNewToken');
    cb();
};

exports['Test setup'] = {
    'setup': function (test) {
        async.series([
/*
            function(callback){
                console.log('clear previous db');
                db.dropDatabase(function (err) {
                    console.log('dropDatabase', arguments);
                    callback(err);
                });
                console.log('1----------');
            },
            function(callback) {
                console.log('2----------');
                //conf.logPath = path.normalize(__dirname + '/log');
                conf.logPath = null;
                conf.httpPort =  5002; //6002;
                conf.httpsPort = null;
                conf.authDb = conf.db.authDb;
                console.log('setup test conf and run test install.', conf);

                var user = require('../../server-auth/lib/user-manager');
               // user.init(callback);
                console.log('3.-------------');
            },
            /* 
            function (callback) {
                console.log('run test auth server.');
                auth = require('../../server-auth/auth');
                setTimeout(callback, 1000);
            },*/
            function (callback) {
                //w.conf.authServer = 'http://localhost:5002';
                //w.conf.authApiBaseUrl = w.conf.authServer + '/webida/api/oauth';
                //w.conf.buildServer = 'http://localhost:5004';
                //w.conf.buildApiBaseUrl = w.conf.buildServer + '/webida/api/build';
                w.conf.authServer = 'https://auth.webida.net';
                w.conf.authApiBaseUrl = w.conf.authServer + '/webida/api/oauth';
                w.conf.buildServer = 'https://build.webida.net';
                w.conf.buildApiBaseUrl = w.conf.buildServer + '/webida/api/build';
                console.log(w.conf);
                console.log('1.-------------------------------');
                callback(null);
            },
            function (callback) {
                console.log('2.signup call.');
                w.auth.signup(account1.email, function (err) {
                    if (err) {
                        console.log ('signup failed', err);
                        //process.exit(1);
                    }

                    console.log ('signup success');
                    db.users.findOne({email: account1.email}, function (err, user) {
                        console.log ('find user', user);
                        var uid = user.uid;
                        console.log('before update user --- uid = ', uid);
                        db.users.update({uid: uid}, {$set: { 
                            passwordDigest: utils.getSha256Digest(account1.password),
                            activated: true
                        }},
                        function (err) {
                            console.log ('update user');

                            var token = '1a2b3c4d5e6f7g';
                            db.tokens.save({uid: uid, clientID: ('any_' + token), token: token,
                            expireTime: 'INFINITE'}, function(err, info) {
                                if (err) {
                                    process.exit(1);
                                }
                                console.log('token is installed ----------');

                                token ='chumegzfx004sndgvsq6w8tmw';
                                console.log ('create personal token', info);
                                w.auth.initAuth('clientId', 'nourl', tokenGen);
                                w.auth.registerToken(token);
                                callback(null);
                            });
                        });
                    });
                });
            }
        ],
        function (err, result) {
            if (err) {
                console.log('Auth server install or initialize failed.');
                process.exit(1);
            } else {
                console.log('Auth server installed and initialized successfully.');
                test.done();
            }
        });
    },
};

/*
exports['Test getMyInfo'] = {
    'getMyInfo': function (test) {
        w.auth.getMyInfo(function (err, user) {
            console.log('getMyInfo', arguments);
            test.ok(!err, err);
            test.ok(user, user);
            test.done();
        });
    }
};
*/
exports['Test build'] = {
    'build' : function (test) {

        //for (var i = 0; i<100; i++)
        {
            var workspaceName = 'test';
            var projectName = 't1';
            var profileId = 1111;
            var profileName = 'testbuild';
            var platform = 'android';
            var outputName = 'mobilefirst';
            var buildType = 'debug';

            w.build.buildProject(workspaceName, projectName, profileId, profileName, platform, outputName, buildType, function (err, user) {
                console.log('buildProject', arguments);
                test.ok(!err, err);
                test.done();
            });
        }
    }
};


