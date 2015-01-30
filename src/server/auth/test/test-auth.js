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
var w = require('../node_modules/webida-library/webida/src/webida-0.3');
var conf = require('../node_modules/webida-server-lib/lib/conf-manager').conf;
var utils = require('../node_modules/webida-server-lib/lib/utils');
var db = require('mongojs').connect('webida_auth_test', ['users', 'tokens']);

var account1 = { email: 'test1@webida.org', password: 'test1' };
var account2 = { email: 'test2@webida.org', password: 'test2' };

var auth = null;

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
            function(callback){
                console.log('clear previous db');
                db.dropDatabase(callback);
            },
            function(callback) {
                //conf.logPath = path.normalize(__dirname + '/log');
                conf.logPath = null;
                conf.httpPort =  6002;
                conf.httpsPort = null;
                conf.authDb = 'mongodb://localhost:27017/webida_auth_test';
                console.log('setup test conf and run test install.', conf);

                var user = require('../lib/user-manager');
                user.init(callback);
            },
            function (callback) {
                console.log('run test auth server.');
                auth = require('../auth');
                setTimeout(callback, 1000);
            },
            function (callback) {
                console.log('signup call.');
                w.auth.signup(account1.email, function (err) {
                    if (err) {
                        console.log ('signup failed', err);
                        process.exit(1);
                    }

                    console.log ('signup success');
                    db.users.findOne({email: account1.email}, function (err, user) {
                        console.log ('find user', user);
                        var uid = user.uid;
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

exports['Test changeMyPassword'] = {
    'changeMyPassword': function (test) {
        w.auth.changeMyPassword('test1', 'test11', function (err) {
            console.log('changeMyPassword', arguments);
            test.ok(!err, err);
            test.done();
        });
    }
};

exports['Test getUserInfoByEmail'] = {
    'getUserInfoByEmail': function (test) {
        w.auth.getUserInfoByEmail(account1.email, function (err, user) {
            console.log('getUserInfoByEmail', arguments);
            test.ok(!err, err);
            test.ok(user, user);
            test.done();
        });
    }
};

exports['Test signup'] = {
    'signup': function (test) {
        w.auth.signup(account2.email, function (err) {
            test.ok(!err, err);
            test.done();
        });
    }
};

exports['Test logout'] = {
    'logout': function (test) {
        w.auth.logout(function (err) {
            test.ok(!err, err);
            test.done();
        });
    }
};

exports['Test addNewPersonalToken'] = {
    'addNewPersonalToken': function (test) {
        w.auth.addNewPersonalToken(function (err, token) {
            console.log('addNewPersonalToken', arguments);
            test.ok(!err, err);
            test.ok(token, token);

            account1.token = token;
            test.done();
        });
    }
};

exports['Test deletePersonalToken'] = {
    'deletePersonalToken': function (test) {
        w.auth.deletePersonalToken(account1.token, function (err, token) {
            console.log('deletePersonalToken', arguments);
            test.ok(!err, err);
            test.done();
        });
    }
};

exports['Test deleteMyInfo'] = {
    'deleteMyInfo': function (test) {
        w.auth.deleteMyInfo(function (err) {
            console.log('deleteMyInfo', err);
            test.ok(!err, err);
            test.done();
        });
    }
};

exports['Test cleanup'] = {
    'cleanup': function (test) {
        db.dropDatabase();
        db.close();
        auth.shutdownServer();
        test.done();
    }
};

// TODO: Need the session id to test this api.
/*
var request = require('request');
exports['Test login'] = {
    setUp: function (done) {
        var uri = w.conf.authServer + '/login';
        var body = {email: account1.email, password: account1.password};
        request.post(uri, {form:body}, function(err, data) {
            done();
        });
    },
    'getLoginStatus': function (test) {
        w.auth.getLoginStatus(function (err, info) {
            console.log('getLoginStatus', arguments);
            test.ok(!err, err);
            test.ok(info, info);
            test.done();
        });
    },
};
*/
