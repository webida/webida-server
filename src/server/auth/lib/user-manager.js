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

var async = require('async');
//var jquery = require('jquery');
var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
//var login = require('connect-ensure-login');
var LocalStrategy = require('passport-local').Strategy;
var ClientPasswordStrategy = require('passport-oauth2-client-password').Strategy;
var BearerStrategy = require('passport-http-bearer').Strategy;
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var GitHubStrategy = require('passport-github').Strategy;
var url = require('url');
var _ = require('underscore');
var nodemailer = require('nodemailer');
var cuid = require('cuid');
var bodyParser = require('body-parser');
var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();



var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;
var utils = require('../../common/utils');
var userdb = require('./userdb');

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

var router = express.Router();
router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

//var urlencodedParser = bodyParser.urlencoded({ extended: true });
//var jsonParser = bodyParser.json();

module.exports.router = router;

//var sqlConn = userdb.getSqlConn();
//var sqlConn = userdb.sqlConn;

var transporter = nodemailer.createTransport();

function errLog(err, errMsg) {
    if (err === 'undefined') {
        logger.error('[userdb] ' + errMsg);
    } else {
        logger.error('[userdb] ' + errMsg + ': ', err);
    }
}


exports.start = function (svc) {
    passport.serializeUser(function (user, done) {
        logger.debug('serializeUser', user.uid);
        done(null, user.uid);
    });

    passport.deserializeUser(function (obj, done) {
        userdb.findUserByUid(obj, function (err, user) {
            logger.debug('deserializeUser', obj);
            done(null, user);
        });
    });

    passport.use(new LocalStrategy(
        function (email, password, done) {
            userdb.findUserByEmail(email, function (err, user) {
                logger.info('local strategy passed', email);
                if (err) { return done(err); }
                if (!user) {
                    return done(null, false, { message: 'Unknown user' });
                }

                var passwordDes = new Buffer(password, 'base64').toString();
                if (user.passwordDigest !== utils.getSha256Digest(passwordDes)) {
                    return done(null, false, { message: 'Invalid password' });
                }
                return done(null, user);
            });
        }
    ));

    passport.use(new ClientPasswordStrategy(
        function (clientId, clientSecret, done) {
            userdb.findClientByClientID(clientId, function (err, client) {
                if (err) {
                    return done(err);
                }
                if (!client) {
                    return done(null, false);
                }
                if (client.clientSecret !== clientSecret) {
                    return done(null, false);
                }

                return done(null, client);
            });
        }
    ));

    passport.use(new BearerStrategy(
        function (accessToken, done) {
            userdb.getTokenInfo(accessToken, function (err, tokenInfo) {
                if (err) {
                    return done(err);
                }
                if (!tokenInfo) {
                    return done(null, false);
                }

                // to keep this example simple, restricted scopes are not implemented,
                // and this is just for illustrative purposes
                var info = { scope: '*' };
                done(null, tokenInfo, info);
            });
        }
    ));

    passport.use(new GitHubStrategy({
        clientID: config.services.auth.github.clientID,
        clientSecret: config.services.auth.github.clientSecret,
        callbackURL: config.services.auth.github.callbackURL
    },
        function (accessToken, refreshToken, profile, done) {
            logger.debug('github stragegy verify');

            process.nextTick(function () {
                async.waterfall([
                    function (next) {
                        var email = profile.emails[0].value;
                        userdb.findUserByEmail(email, function (err, user) {
                            if (err) { return done(err); }
                            if (user) { return done(null, user); }
                            next(null);
                        });
                    },
                    function (next) {
                        var authinfo = {
                            email: profile.emails[0].value,
                            password: cuid(),
                            name: profile.emails[0].value,
                            activationKey: cuid()
                        };

                        userdb.findOrAddUser(authinfo, function (err, user) {
                            if (err || !user) {
                                return done(new Error('Creating the account failed.' + err));
                            }

                            createDefaultPolicy(user, function (err) {
                                if (err) {
                                    return next(new Error('Creating the default policy for ' + user.email + ' failed.' +
                                        err));
                                }
                                return next(null, user);
                            });
                        });
                    }],
                    function (err, user) {
                        userdb.updateUser({uid:user.uid}, {status: userdb.STATUS.APPROVED}, function (err, user) {
                            if (err || !user) {
                                return done(new Error('Activating the account failed.'));
                            }
                            return done(null, user);
                        });
                    }
                );
            });
        }
    ));

    // Use the GoogleStrategy within Passport.
    //   Strategies in Passport require a `verify` function, which accept
    //   credentials (in this case, an accessToken, refreshToken, and Google
    //   profile), and invoke a callback with a user object.
    passport.use(new GoogleStrategy({
        clientID: config.services.auth.google.clientID,
        clientSecret: config.services.auth.google.clientSecret,
        callbackURL: config.services.auth.google.callbackURL
    },
        function (accessToken, refreshToken, profile, done) {
            logger.info('google strategy');

            process.nextTick(function () {
                async.waterfall([
                    function (next) {
                        logger.info(profile.emails);
                        var email = profile.emails[0].value;
                        userdb.findUserByEmail(email, function (err, user) {
                            if (err) { return done(err); }
                            if (user) { return done(null, user); }
                            next(null);
                        });
                    },
                    function (next) {
                        var authinfo = {
                            email: profile.emails[0].value,
                            password: cuid(),
                            name: profile.emails[0].value,
                            activationKey: cuid()
                        };

                        userdb.findOrAddUser(authinfo, function (err, user) {
                            if (err || !user) {
                                return done(new Error('Creating the account failed.' + err));
                            }

                            createDefaultPolicy(user, function (err) {
                                if (err) {
                                    return next(new Error('Creating the default policy for ' + user.email + ' failed.' +
                                        err));
                                }
                                return next(null, user);
                            });
                        });
                    }],
                    function (err, user) {
                        userdb.updateUser({uid:user.uid}, {status: userdb.STATUS.APPROVED}, function (err, user) {
                            if (err || !user) {
                                return done(new Error('Activating the account failed.'));
                            }
                            return done(null, user);
                        });
                    }
                );
            });
        }
    ));
};


exports.init = function (callback) {
    logger.info('Initialize the auth server.');

    function updateServerConf(callback) {
        logger.info('updateServerConf called.');
        userdb.createServerConf(callback);
    }

    function createAdminAccount(callback) {
        logger.info('createAdminAccount called.');
        async.waterfall([
            function (next) {
                userdb.findUser({email: config.services.auth.adminAccount.email}, function (err, results) {
                    if (err) {
                        return next(err);
                    }
                    if (results.length > 0) {
                        return next(null, results[0].uid);
                    } else {
                        userdb.addUser(config.services.auth.adminAccount, function (err, user) {
                            if (err) {
                                return next(new ServerError('Creating the Admin account failed.' + err));
                            } else {
                                return next(null, user.uid);
                            }
                        });
                    }
                });
            }, function (uid, next) {
                userdb.updateUser({uid:uid}, {isAdmin: 1},
                    function (err/*, user*/) {
                        if (err) {
                            return next(new Error('Activating the admin account failed.' + err));
                        }
                        return next(null, uid);
                    }
                );
            }, function (uid, next) {
                userdb.addNewPersonalToken(uid, cuid(), function (err, token) {
                    if (err) {
                        return next(err);
                    }
                    logger.info('Admin token:', token);
                    return next(null, {uid: uid});
                });
            }, createDefaultPolicy
        ], function (err) {
            callback(err);
        });
    }

    function updateClientDB(callback) {
        logger.info('updateClientDB called.', config.systemClients);
        async.each(_.toArray(config.systemClients), userdb.updateClient, callback);
    }

    async.series([
        userdb.createSQLTable,
        userdb.createSystemFSPolicy,
        updateServerConf,
        createAdminAccount,
        updateClientDB
    ], callback);
};

exports.createAdmin2 = function (callback) {
    async.waterfall([
        function (next) {
            userdb.findUser({email: config.services.auth.Admin2.email}, function (err, results) {
                if (err) {
                    errLog('createAdmin2: user does not exist - ', err); 
                    return next(new ServerError('Creating the Admin2 account failed.'));
                }

                if (results.length > 0) {
                    return callback(null);
                } else {
                    return next();
                }
            });
        }, function (next) {
            userdb.addUser(config.services.auth.Admin2, function (err, user) {
                if (err) {
                    errLog('createAdmin2: addUser failed - ', err); 
                    return next(new ServerError('createAdmin2: addUser failed'));
                } else {
                    return next(null, user.uid);
                }
            });
        }, function (uid, next) {
            userdb.updateUser({uid:uid}, {isAdmin: 1}, function (err/*, user*/) {
                if (err) {
                    errLog('createAdmin2: updateUser failed - ', err); 
                    return next(new ServerError('createAdmin2: updateUser failed'));
                }
                return next(null, {uid:uid});
            });
        }, createDefaultPolicy
    ], function (err) {
        return callback(err);
    });
};

/**
 * Returns a function which checks auth result from passport and
 * call req.login() if success for session creation.
 */
function loginHandler(req, res) {
    return function (err, user, info) {
        if (err) {
            logger.info('loginHandler error', arguments);
            res.status(400).send(utils.fail('loginHandler error'));
        } else {
            if (user) {
                logger.info('login user info : ', user);

                switch(user.status) {
                    case userdb.STATUS.PENDING:
                        return res.status(470).send(utils.fail('STATUS_PENDING'));
                    case userdb.STATUS.REJECTED:
                        return res.status(472).send(utils.fail('STATUS_REJECTED'));
                    default:
                        break;
                }

                req.login(user, function (err) {
                    if (err) {
                        logger.info('loginHandler login error', err.stack);
                        return res.status(503).send(utils.fail('loginHandler login error'));
                    }
                    userdb.setLastLogin(user.uid, function () {});

                    if (req.session.opener) {
                        res.sendok(req.session.opener);
                        delete req.session.opener;
                        return;
                    } else if (req.session.returnTo) {
                        return res.redirect(req.session.returnTo);
                    } else {
                        return res.send(utils.ok());
                    }
                });
            } else {
                logger.info('loginHandler no user error', arguments);
                res.status(400).send(utils.fail('Invalid name or password'));
            }
        }
    };
}

function sendEmail(mailOptions, callback) {
    logger.info('sendEmail', mailOptions);

    transporter.sendMail(mailOptions, function (error, response) {
        if (error) {
            logger.info(error);
        }else{
            logger.info('Message sent: ' + response.message);
        }

        transporter.close();
        callback(error, response);
    });
}

router.get('/',
    function (req, res) {
        res.send('Webida OAuth 2.0 Server.');
    }
);

router.get('/login',
    function (req, res) {
        logger.info('##### login1 #####');
        res.render('login');
    }
);

router.get('/login2',
    function (req, res) {
        logger.info('##### login2 #####');
        res.render('login2');
    }
);

router.post('/login',
    multipartMiddleware,
    function (req, res, next) {
        passport.authenticate('local', loginHandler(req, res))(req, res, next);
    }
);

router.get('/webida/api/oauth/isloggedin',
    function (req, res) {
        if (!req.isAuthenticated || !req.isAuthenticated()) {
            return res.status(400).send(utils.fail('Not logged in.'));
        } else {
            return res.send(utils.ok(req.user));
        }
    }
);

router.get('/signup', function (req, res) {
    res.render('signup');
});

router.get('/webida/api/oauth/logout',
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid:req.user.uid, action:'auth:logout', rsc:'auth:*'};
        userdb.checkAuthorize(aclInfo, res, next);
    },
    function (req, res) {
        req.logout();
        res.send(utils.ok());
    }
);

router.get('/webida/api/oauth/myinfo',
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid:req.user.uid, action:'auth:getMyInfo', rsc:'auth:*'};
        userdb.checkAuthorize(aclInfo, res, next);
    },
    function (req, res) {
        var user = req.user;
        delete user.passwordDigest;
        delete user.activationKey;
        logger.debug('API myinfo', user);
        res.send(utils.ok(user));
    }
);

router['delete']('/webida/api/oauth/myinfo',
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid:req.user.uid, action:'auth:deleteMyAccount', rsc:'auth:*'};
        userdb.checkAuthorize(aclInfo, res, next);
    },
    function (req, res) {
        var uid = req.user.uid;
        userdb.deleteUser(uid, function (err) {
            if (err) {
                return res.sendfail(err);
            } else {
                return res.sendok();
            }
        });

        /*var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            if (err) {
                var errMsg = 'myinfo error in db';
                errLog(errMsg);
                return res.sendfail(errMsg);
            }

            var uid = req.user.uid;
            async.waterfall([
                function (next) {
                    userdb.deleteUser(uid, next);
                }, function (next) {
                    userdb.deleteAllPersonalTokens(uid, next); }
            ], function (err) {
                if (err) {
                    sqlConn.rollback(function () {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function () {
                                return res.sendfail('deleteMyAccount failed(server internal error)');
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });*/
    }
);

router.post('/webida/api/oauth/changepassword',
    multipartMiddleware,
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid:req.user.uid, action:'auth:changeMyPassword', rsc:'auth:*'};
        userdb.checkAuthorize(aclInfo, res, next);
    },
    //bodyParser.
    function (req, res) {
        logger.info('changepassword', req.user.email);

        if (!req.user) {
            return res.status(400).send(utils.fail('No user error.'));
        }

        var oldPW = new Buffer(req.body.oldpw, 'base64').toString();
        var newPW = new Buffer(req.body.newpw, 'base64').toString();

        var digest = utils.getSha256Digest(oldPW);
        if (req.user.passwordDigest !== digest) {
            return res.status(400).send(utils.fail('Incorrect current password.'));
        }

        userdb.updateUser({uid:req.user.uid}, {password: newPW}, function (err, user) {
            if (err || !user) {
                return res.sendfail(err);
            } else {
                return res.sendok();
            }
        });

        /*var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            if (err) {
                var errMsg = 'changepassword error in db';
                errLog(errMsg);
                return res.sendfail(errMsg);
            }
            userdb.updateUser({uid:req.user.uid}, {password: newPW}, function (err, user) {
                if (err || !user) {
                    sqlConn.rollback(function () {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function () {
                                return res.sendfail('changePassword failed(server internal error)');
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });*/
    }
);

router.get('/webida/api/oauth/userinfo',
    // TODO : acl
    function (req, res) {
        var field = {};

        if (req.query.uid) {
            field.uid = parseInt(req.query.uid);
        } else if (req.query.email) {
            field.email = req.query.email;
        } else {
            logger.info('userinfo failed.(Uid or email is needed)');
            return res.status(400).send(utils.fail('Uid or email is needed.'));
        }

        logger.info('userinfo', field);
        userdb.findUser(field, function (err, users) {
            if (err) {
                logger.info('userinfo findUesr failed', arguments);
                return res.status(503).send(utils.fail('findUesr failed'));
            }
            if (users.length === 0) {
                logger.info('userinfo findUesr not found', arguments);
                return res.status(400).send(utils.fail('User not found'));
            }

            var userInfo = { uid: users[0].uid, email: users[0].email};
            return res.send(utils.ok(userInfo));
        });
    }
);

router.get('/webida/api/oauth/admin/allusers',
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid:req.user.uid, action:'auth:getAllUsers', rsc:'auth:*'};
        userdb.checkAuthorize(aclInfo, res, next);
    },
    function (req, res) {
        userdb.getAllUsers(function (err, users) {
            logger.debug('Users: ' + users);
            if (err) {
                res.status(503).send(utils.fail('getAllUsers failed'));
            } else {
                res.send(utils.ok(users));
            }
        });
    }
);

function createDefaultPolicy(user, callback) {
    var token;
    async.waterfall([
        function (next) {
            userdb.getPersonalTokens(100000, function (err, result) {
                if (err) {
                    return next(err);
                }
                if (result.length === 0) {
                    return next(new ServerError(500, 'Creating default policy failed'));
                }
                token = result[0].data;
                return next(null);
            });
        }, function (next) {
            userdb.createPolicy(user.uid, config.services.auth.defaultAuthPolicy, token, function (err, policy) {
                if (err) {
                    return next(new ServerError(500, 'Set default auth policy failed'));
                }
                return next(null, policy.pid);
            });
        }, function (pid, next) {
            userdb.assignPolicy({pid:pid, user:user.uid}, function (err) {
                if (err) {
                    return next(new ServerError(500, 'Assign default auth policy failed'));
                }
                return next(null);
            });
        }, function (next) {
            userdb.createPolicy(user.uid, config.services.auth.defaultAppPolicy, token, function (err, policy) {
                if (err) {
                    return next(new ServerError(500, 'Set default app policy failed'));
                }
                return next(null, policy.pid);
            });
        }, function (pid, next) {
            userdb.assignPolicy({pid:pid, user:user.uid}, function (err) {
                if (err) {
                    return next(new ServerError(500, 'Assign default app policy failed'));
                }
                return next(null);
            });
        }, function (next) {
            userdb.createPolicy(user.uid, config.services.auth.defaultFSSvcPolicy, token, function (err, policy) {
                if (err) {
                    return next(new ServerError(500, 'Set default fssvc policy failed'));
                }
                return next(null, policy.pid);
            });
        }, function (pid, next) {
            userdb.assignPolicy({pid:pid, user:user.uid}, function (err) {
                if (err) {
                    return next(new ServerError(500, 'Assign default fssvc policy failed'));
                }
                return next(null);
            });
        }
    ], function (err) {
        return callback(err);
    });
}


router.get('/activateaccount', function (req, res) {
    var key = url.parse(req.url, false).query;

    userdb.findUser({activationKey: key}, function (err, users) {
        if (err) {
            return res.status(503).send('Get userinfo failed');
        }

        if (users.length === 0) {
            return res.status(400).send(utils.fail('User not found'));
        }

        if (users[0].status === userdb.STATUS.APPROVED) {
            return res.send('Your account is already activated.');
        }

        logger.info('activateaccount get', users[0]);
        res.render('signup', {
            title: 'Sign up to Webida',
            submitURL: '/activateaccount',
            email: users[0].email,
            activationKey: users[0].activationKey
        });
    });
});


router.post('/activateaccount',
    multipartMiddleware,
    function (req, res) {
        var password = new Buffer(req.body.password, 'base64').toString();
        var activationKey = req.body.activationKey;
        logger.info('activateaccount post', req.body);
        userdb.activateAccount(password, activationKey, function (err, user) {
            if (err) {
                return res.sendfail(err);
            } else {
                req.session.opener = config.services.auth.signup.webidaSite;
                loginHandler(req, res)(null, user);
            }
        });

        /*var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            if (err) {
                var errMsg = 'activateaccount error in db';
                errLog(errMsg, err);
                return res.sendfail(errMsg);
            }

            var password = new Buffer(req.body.password, 'base64').toString();
            var activationKey = req.body.activationKey;
            var user;

            logger.info('activateaccount post', req.body);

            async.waterfall([
                function (next) {
                    if (password.length < 6) {
                        return next('password length must be longer than 5 chareacters.');
                    }
                    return next(null);
                }, function (next) {
                    userdb.findUser({activationKey: activationKey}, function (err, users) {
                        if (err) {
                            return next(new ServerError(503, 'Get userinfo failed'));
                        }

                        if (users.length === 0) {
                            return next('Unknown user');
                        }

                        if (users[0].status === userdb.STATUS.APPROVED) {
                            return next('Your account is already activated.');
                        }

                        if (users[0].activationKey !== activationKey) {
                            return next('Invalid request.');
                        }

                        return next(null, users[0].uid);
                    });
                }, function (uid, next) {
                    userdb.updateUser({uid:uid}, {password: password, status: userdb.STATUS.APPROVED},
                    function (err, result) {
                        if (err || !result) {
                            return next(new ServerError(503, 'Activating failed'));
                        }

                        user = result;
                        return next(null);
                    });
                }, function (next) {
                    return createDefaultPolicy(user, next);
                }
            ], function (err) {
                if (err || !user) {
                    sqlConn.rollback(function () {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function () {
                                return res.sendfail('activateAccount failed(server internal error)');
                            });
                        }

                        req.session.opener = config.services.auth.signup.webidaSite;
                        loginHandler(req, res)(null, user);
                    });
                }
            });
        });*/
    }
);


// {email, password, name, company, telehpone, department}
router.post('/webida/api/oauth/signup2', 
multipartMiddleware, 
function (req, res) {
    var sqlConn = userdb.getSqlConn();
    sqlConn.beginTransaction(function (err) {
        if (err) {
            var errMsg = 'signup2 error in db';
            errLog(errMsg, err);
            return res.sendfail(errMsg);
        }

        var authInfoArr;
        try {
            authInfoArr = JSON.parse(req.body.data);
            logger.info('Signup 2', authInfoArr);
        } catch (err) {
            errLog('failed to signup', err); 
            return res.sendfail('Failed to signup: failed to paser body.data: ' + err);
        }

        async.eachSeries(authInfoArr, function (authInfo, cb) {
            if (authInfo.admin) {
                authInfo.status = userdb.STATUS.PASSWORDRESET;
            }

            if (!authInfo.password) {
                authInfo.password = authInfo.email;
            }

            userdb.findOrAddUser(authInfo, function (err, result) {
                if (err) {
                    return cb('Failed to signup2 '+err);
                }

                createDefaultPolicy(result, function (err) {
                    if (err) {
                        return cb('Failed to signup2. ' + err);
                    }
                    return cb();
                });
            });
        }, function (err) {
            if (err) {
                errLog('Failed to signup. ', err);
                sqlConn.rollback(function () {
                    return res.sendfail(err);
                });
            } else {
                sqlConn.commit(function (err) {
                    if (err) {
                        errLog('commit failed', err);
                        sqlConn.rollback(function () {
                            return res.sendfail('Signup failed(server internal error)');
                        });
                    }
                    return res.sendok();
                });
            }
        });
    });
});

router.get('/webida/api/oauth/deleteaccount',
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid:req.user.uid, action:'auth:deleteAccount', rsc:'auth:*'};
        userdb.checkAuthorize(aclInfo, res, next);
    },
    function (req, res) {
        var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            if (err) {
                var errMsg = 'deleteaccount error in db';
                errLog(errMsg, err);
                return res.sendfail(errMsg);
            }

            var uid = req.query.uid;

            async.waterfall([
                function (next) {
                    userdb.deleteUser(uid, function (err) {
                        if (err) {
                            return next('deleteAccount deleteUser failed.');
                        }

                        return next(null);
                    });
                }, function (next) {
                    userdb.deleteAllPersonalTokens(uid, function (err) {
                        if (err) {
                            return next('deleteAccount deletePersonalToken failed.');
                        }
                        return next(null);
                    });
                }
            ], function (err) {
                if (err) {
                    sqlConn.rollback(function () {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function () {
                                return res.sendfail('deleteAccount failed(server internal error)');
                            });
                        }

                        req.logout();
                        return res.sendok();
                    });
                }
            });
        });
    }
);

var UPDATABLE_USERINFO = ['name', 'company', 'telephone', 'department', 'url', 'location', 'gravatar', 'status'];
function updateUser(req, res) {
    var authInfo = req.body;
    var updateInfo;
    var user = req.user;
    var field = {};

    updateInfo = _.pick(authInfo, UPDATABLE_USERINFO);

    if (!authInfo.uid && !authInfo.email) {
        return res.sendfail(new ClientError('uid or email is required'));
    }

    if (authInfo.email) {
        field.email = authInfo.email;
    } else {
        authInfo.uid = parseInt(authInfo.uid);
        field.uid = authInfo.uid;
    }

    if (authInfo.isAdmin && !user.isAdmin) {
        return res.send(401, utils.fail('Cannot update the isAdmin field if you are not a admin user.'));
    }

    var sqlConn = userdb.getSqlConn();
    sqlConn.beginTransaction(function (err) {
        if (err) {
            var errMsg = 'updateUser error in db';
            errLog(errMsg, err);
            return res.sendfail(errMsg);
        }
        userdb.updateUser(field, updateInfo, function (err, updatedUser) {
            if (err || !updatedUser) {
                sqlConn.rollback(function () {
                    return res.sendfail(err);
                });
            } else {
                sqlConn.commit(function (err) {
                    if (err) {
                        sqlConn.rollback(function () {
                            return res.sendfail('deleteAccount failed(server internal error)');
                        });
                    }

                    return res.sendok(updatedUser);
                });
            }
        });
    });
}

router.post('/webida/api/oauth/updateuser2',
    multipartMiddleware,
    userdb.verifyToken,
    updateUser
);

router.post('/webida/api/oauth/updateuser',
    multipartMiddleware,
    userdb.verifyToken,
    function (req, res, next) { // check acl
        var authInfo = req.body;
        var user = req.user;

        logger.info('[auth] updateUser', authInfo, user);
        async.waterfall([
            function (cb) {
                if (authInfo.uid) {
                    return cb();
                }

                userdb.findUser({email:authInfo.email}, function (err, users) {
                    if (err || users.length === 0) {
                        return res.sendfail(new ClientError('Unknown user'));
                    }

                    authInfo.uid = users[0].uid;
                    return cb();
                });
            }, function (cb) {
                if (user.isAdmin || authInfo.uid === user.uid) {
                    return cb();
                }

                var rsc = 'auth:' + authInfo.uid;
                var aclInfo = {uid:req.user.uid, action:'auth:updateUser', rsc:rsc};
                userdb.checkAuthorize(aclInfo, res, function (err, result) {
                    if (err) {
                        return res.sendfail(new ServerError('updateUser() checkAuthorize failed.'));
                    }

                    if (result) {
                        return cb();
                    } else {
                        return res.sendfail(new ClientError(401, 'Not authorized.'));
                    }
                });
            }
        ], function (err) {
            if (err) {
                return res.sendfail(err);
            } else {
                return next();
            }
        });
    },
    updateUser
    /*
    function (req, res) {
        var authInfo = req.body;
        var user = req.user;
        var field = {};

        if (authInfo.email) {
            field.email = authInfo.email;
        } else {
            authInfo.uid = parseInt(authInfo.uid);
            field.uid = authInfo.uid;
        }

        if (authInfo.isAdmin && !user.isAdmin)
            return res.send(401, utils.fail('Cannot update the isAdmin field if you are not a admin user.'));

        sqlConn.beginTransaction(function (err) {
            if (err)
                return next(err);

            userdb.updateUser(field, authInfo, function (err, updatedUser) {
                if (err || !updatedUser) {
                    sqlConn.rollback(function () {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function () {
                                return res.sendfail('deleteAccount failed(server internal error)');
                            });
                        }

                        return res.sendok(updatedUser);
                    });
                }
            });
        });
    }
    */
);

router.post('/webida/api/oauth/signup',
    multipartMiddleware,
    function (req, res) {
        var email = req.body.email;
        var key = cuid();

        userdb.signupUser(email, key, sendEmail, function (err) {
            if (err) {
                var errMsg = 'signup error in db';
                errLog(errMsg, err);
                return res.sendfail(errMsg);
            } else {
                return res.sendok();
            }
        });
        /*var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            if (err) {
                var errMsg = 'signup error in db';
                errLog(errMsg, err);
                return res.sendfail(errMsg);
            }

            async.waterfall([
                function (next) {
                    var authinfo = {email: email, password: key, activationKey: key};
                    userdb.findOrAddUser(authinfo, function (err, result) {
                        return next(err);
                    });
                },
                function (next) {
                    var redirect = config.services.auth.signup.activatingURL + key;
                    var emailBody = '<b>Welcome to Webida!!</b>'
                        + 'This is the sign up validation email to webida.org of ' + email + ','
                        + 'Please click belows.<br><br>'
                        + '<a href="' + redirect + '">' + redirect + '</a>';

                    var mailOptions = {
                        from: config.services.auth.signup.emailSender,
                        to: email,
                        subject: 'Email validation check for webida.org signup',
                        html: emailBody
                    };

                    sendEmail(mailOptions, function (err, data) {
                        if (err) {
                            return res.status(503).send('Failed to send activating email.');
                        }
                        return next();
                    });
                }
            ],
            function (err) {
                if (err) {
                    sqlConn.rollback(function () {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function () {
                                return res.sendfail('deleteAccount failed(server internal error)');
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });*/
    }
);

router.get('/resetpassword', function (req, res) {
    var key = url.parse(req.url, false).query;
    userdb.findTempKey({key: key}, function (err, keyInfo) {
        if (err) {
            return res.status(503).send('Reset password failed');
        }

        if (!keyInfo) {
            return res.status(400).send('Unknown user');
        }

        res.render('signup', {
            title: 'Reset the password',
            submitURL: '/resetpassword',
            email: keyInfo.email,
            activationKey: keyInfo.key
        });
    });
});

router.post('/resetpassword',
    multipartMiddleware,
    function (req, res) {
        var password = new Buffer(req.body.password, 'base64').toString();
        var activationKey = req.body.activationKey;

        if (password.length < 6) {
            return res.send(400, 'password length must be longer than 5 chareacters.');
        }

        async.waterfall([
            function (next) {
                userdb.findTempKey({key: activationKey}, function (err, keyInfo) {
                    if (err) {
                        return res.status(500).send(utils.fail('Internal server error'));
                    } else if (!keyInfo) {
                        return res.status(400).send(utils.fail('Unknown user'));
                    }

                    return next(null, keyInfo.uid);
                });
            },
            function (uid, next) {
                userdb.updateUser({uid:uid}, {password: password}, function (err, user) {
                    if (err || !user) {
                        return res.status(500).send(utils.fail('updateUser failed.'));
                    }

                    return next(null, uid);
                });
            },
            function (uid/*, next*/) {
                userdb.removeTempKey({uid: uid}, function (err) {
                    if (err) {
                        return res.status(500).send(utils.fail('removeTempKey failed.'));
                    }
                    return res.sendok('/login');
                });
            }
        ]);
    }
);

router.post('/webida/api/oauth/forgotpassword',
    multipartMiddleware,
    function (req, res) {
        var email = req.body.email;

        async.waterfall([
            function (next) {
                userdb.findUserByEmail(email, function (err, user) {
                    if (err || !user) {
                        return res.status(400).send(utils.fail('Unknown user'));
                    }

                    if (user.status === userdb.STATUS.REJECTED) {
                        return res.status(400).send(utils.fail('Rejected user'));
                    }

                    return next(null, user.uid);
                });
            },
            function (uid, next) {
                var key =  cuid();
                userdb.addTempKey(uid, key, function (err) {
                    if (err) {
                        return res.status(500).send(utils.fail('Internal server error'));
                    }

                    return next(null, key);
                });
            }
        ], function (err, key) {
            var redirect = config.services.auth.resetPasswordURL + '?' + key;
            var emailBody = 'Webida received a request to reset the password for your Webida account for ' +
                email + ',<br>' +
                'Please click belows to reset the password.<br><br>' +
                '<a href="' + redirect + '">' + redirect + '</a>';

            var mailOptions = {
                from: config.services.auth.signup.emailSender,
                to: email,
                subject: 'Forgot your password of webida account',
                html: emailBody
            };

            sendEmail(mailOptions, function (err) {
                if (err) {
                    return res.status(503).send(utils.fail('Failed to send password reset email.'));
                }
                return res.send(utils.ok());
            });
        });
    }
);

router.get('/webida/api/oauth/finduser', function (req, res) {
    userdb.findUser(req.query, function (err, users) {
        return res.send(utils.ok(users));
    });
});

router.get('/api/google',
    passport.authenticate('google',
        { scope: ['https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'] })
);
router.get('/webida/api/oauth/googlecallback',
    function (req, res, next) {
        logger.debug('Google login');
        req.session.returnTo = req.session.opener;
        req.session.opener = null;
        passport.authenticate('google', loginHandler(req, res))(req, res, next);
    }
);

router.get('/api/github',
    passport.authenticate('github'));

router.get('/webida/api/oauth/githubcallback',
    function (req, res, next) {
        logger.debug('Github login');
        req.session.returnTo = req.session.opener;
        req.session.opener = null;
        passport.authenticate('github', loginHandler(req, res))(req, res, next);
    }
);


