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
var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var ClientPasswordStrategy = require('passport-oauth2-client-password').Strategy;
var BearerStrategy = require('passport-http-bearer').Strategy;
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var GitHubStrategy = require('passport-github').Strategy;
var url = require('url');
var _ = require('underscore');
var nodemailer = require('nodemailer');
var cuid = require('cuid');
var request = require('request');
var bodyParser = require('body-parser');
var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();

var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;
var utils = require('../../common/utils');
var userdb = require('./userdb');

var transporter = nodemailer.createTransport();

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

var UPDATABLE_USERINFO = ['name', 'company', 'telephone', 'department', 'url', 'location', 'gravatar', 'status'];

var router = express.Router();
router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

module.exports.router = router;

function errLog(err, errMsg) {
    if (err === 'undefined') {
        logger.error('[userdb] ' + errMsg);
    } else {
        logger.error('[userdb] ' + errMsg + ': ', err);
    }
}

exports.start = function (/*svc*/) {
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
                var passwordDes;
                logger.info('local strategy passed', email);
                if (err) { return done(err); }
                if (!user) {
                    return done(null, false, { message: 'Unknown user' });
                }

                passwordDes = new Buffer(password, 'base64').toString();
                if (user.password !== utils.getSha256Digest(passwordDes)) {
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
                // to keep this example simple, restricted scopes are not implemented,
                // and this is just for illustrative purposes
                var info = { scope: '*' };
                if (err) {
                    return done(err);
                }
                if (!tokenInfo) {
                    return done(null, false);
                }

                done(null, tokenInfo, info);
            });
        }
    ));

    passport.use(new GitHubStrategy({
        clientID: config.services.auth.github.clientID,
        clientSecret: config.services.auth.github.clientSecret,
        callbackURL: config.services.auth.github.callbackURL,
        scope: 'user,user:email'
    }, function (accessToken, refreshToken, profile, done) {
        logger.debug('github strategy verify');

        //process.nextTick(function () {
        async.waterfall([
            function (next) {
                var options = {
                    uri: 'https://api.github.com/user/emails?access_token=' + accessToken,
                    json: true,
                    headers: {'User-Agent': 'Webida'}
                };
                logger.debug('start to get user emails from github');

                request(options, function (error, response, body) {
                    logger.debug('user email from github response: ', error, body);
                    if (error) {
                        next(error);
                    } else if (response.statusCode === 200) {
                        next(null, body);
                    } else {
                        next('error: ' + response.statusCode);
                    }
                });
            },
            function (emails, next) {
                var emailObj;
                if (!emails || emails.length === 0) {
                    return next('There is no emails on this github user account: ' + profile.displayName);
                }
                emailObj = _.find(emails, function (email) { return email.primary; });
                if (!emailObj) {
                    emailObj = emails[0];
                }
                userdb.findUserByEmail(emailObj.email, function (err, user) {
                    if (err) {
                        return next(err);
                    }
                    if (user) {
                        return done(null, user);
                    }
                    next(null, emailObj.email);
                });
            },
            function (email, next) {
                var authInfo = {
                    email: email,
                    password: cuid(),
                    name: profile.displayName,
                    activationKey: cuid()
                };

                userdb.findOrAddUser(authInfo, function (err, user) {
                    if (err || !user) {
                        return next(new Error('Creating the account failed.' + err));
                    }
                    userdb.createDefaultPolicy(user, function (err) {
                        if (err) {
                            return next(new Error('Creating the default policy for ' + user.email + ' failed.' +
                                err));
                        }
                        return next(null, user);
                    });
                });
            }],
            function (err, user) {
                if (err) {
                    return done(err);
                } else {
                    userdb.updateUser({uid: user.uid}, {status: userdb.STATUS.APPROVED}, function (err, user) {
                        if (err || !user) {
                            return done(new Error('Activating the account failed.'));
                        }
                        return done(null, user);
                    });
                }
            }
        );
        //});
    }));

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

                            userdb.createDefaultPolicy(user, function (err) {
                                if (err) {
                                    return next(new Error('Creating the default policy for ' + user.email + ' failed.' +
                                        err));
                                }
                                return next(null, user);
                            });
                        });
                    }],
                    function (err, user) {
                        userdb.updateUser({uid: user.uid}, {status: userdb.STATUS.APPROVED}, function (err, user) {
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
                        return next(null, results[0]);
                    } else {
                        userdb.addUser(config.services.auth.adminAccount, function (err, user) {
                            if (err) {
                                return next(new ServerError('Creating the Admin account failed.' + err));
                            } else {
                                return next(null, user);
                            }
                        });
                    }
                });
            }, function (user, next) {
                userdb.updateUser({uid: user.uid}, {isAdmin: 1},
                    function (err/*, user*/) {
                        if (err) {
                            return next(new Error('Activating the admin account failed.' + err));
                        }
                        user.isAdmin = 1;
                        return next(null, user);
                    }
                );
            }, function (user, next) {
                userdb.addNewPersonalToken(user.uid, cuid(), function (err, token) {
                    if (err) {
                        return next(err);
                    }
                    logger.info('Admin token:', token);
                    return next(null, user);
                });
            }, userdb.createDefaultPolicy
        ], function (err) {
            callback(err);
        });
    }

    function updateClientDB(callback) {
        logger.info('updateClientDB called.', config.systemApps);
        function getRedirectUrl(client) {
            var deployConf = config.services.app.deploy;
            if (url.parse(client.redirectUrl).protocol) {
                return client.redirectUrl;
            }
            if (deployConf.type === 'path') {
                return url.resolve(config.appHostUrl, (client.domain ?
                        ('/' + deployConf.pathPrefix + '/' + client.domain) : '') + client.redirectUrl);
            } else {
                var appHostUrl = url.parse(config.appHostUrl);
                appHostUrl.host = (client.domain ? (client.domain + '.') : '') + appHostUrl.host;
                return url.resolve(url.format(appHostUrl), client.redirectUrl);
            }
        }
        async.each(config.systemApps.map(function (client) {
            return {
                clientName: client.id,
                clientID: client.oAuthClientId,
                clientSecret: client.oAuthClientSecret,
                redirectURL: getRedirectUrl(client),
                isSystemApp: true
            };
        }), userdb.updateClient, callback);
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
            userdb.updateUser({uid: uid}, {isAdmin: 1}, function (err/*, user*/) {
                if (err) {
                    errLog('createAdmin2: updateUser failed - ', err);
                    return next(new ServerError('createAdmin2: updateUser failed'));
                }
                return next(null, {uid: uid});
            });
        },
        userdb.createDefaultPolicy
    ], function (err) {
        return callback(err);
    });
};

/**
 * Returns a function which checks auth result from passport and
 * call req.login() if success for session creation.
 */
function loginHandler(req, res) {
    return function (err, user/*, info*/) {
        if (err) {
            logger.info('loginHandler error', arguments);
            res.status(400).send(utils.fail('loginHandler error'));
        } else {
            if (user) {
                logger.info('login user info : ', user);

                switch (user.status) {
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
        } else {
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
        var aclInfo = {uid: req.user.uid, action: 'auth:logout', rsc: 'auth:' + req.user.userId};
        userdb.checkAuthorize(aclInfo, function (err) {
            if (err) {
                return res.sendfail(err);
            }
            next();
        });
    },
    function (req, res) {
        req.logout();
        res.send(utils.ok());
    }
);

router.get('/webida/api/oauth/myinfo',
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid: req.user.uid, action: 'auth:getMyInfo', rsc: 'auth:' + req.user.userId};
        userdb.checkAuthorize(aclInfo, function (err) {
            if (err) {
                return res.sendfail(err);
            }
            next();
        });
    },
    function (req, res) {
        var user = req.user;
        delete user.passwordDigest;
        delete user.activationKey;
        user.isGuest = (user.email.indexOf(config.guestMode.accountPrefix) === 0);
        logger.debug('API myinfo', user);
        res.send(utils.ok(user));
    }
);

router['delete']('/webida/api/oauth/myinfo',
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid: req.user.uid, action: 'auth:deleteMyAccount', rsc: 'auth:' + req.user.userId};
        userdb.checkAuthorize(aclInfo, function (err) {
            if (err) {
                return res.sendfail(err);
            }
            next();
        });
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
    }
);

router.post('/webida/api/oauth/changepassword',
    multipartMiddleware,
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid: req.user.uid, action: 'auth:changeMyPassword', rsc: 'auth:' + req.user.userId};
        userdb.checkAuthorize(aclInfo, function (err) {
            if (err) {
                return res.sendfail(err);
            }
            next();
        });
    },
    function (req, res) {
        var oldPW;
        var newPW;
        logger.info('changepassword', req.user.email);

        if (!req.user) {
            return res.status(400).send(utils.fail('No user error.'));
        }

        oldPW = new Buffer(req.body.oldpw, 'base64').toString();
        newPW = new Buffer(req.body.newpw, 'base64').toString();

        if (req.user.password !== utils.getSha256Digest(oldPW)) {
            return res.status(400).send(utils.fail('Incorrect current password.'));
        }

        userdb.updateUser({uid: req.user.uid}, {password: newPW}, function (err, user) {
            if (err || !user) {
                return res.sendfail(err);
            } else {
                return res.sendok();
            }
        });
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
            var userInfo;
            if (err) {
                logger.info('userinfo findUesr failed', arguments);
                return res.status(503).send(utils.fail('findUesr failed'));
            }
            if (users.length === 0) {
                logger.info('userinfo findUesr not found', arguments);
                return res.status(400).send(utils.fail('User not found'));
            }

            userInfo = { uid: users[0].uid, email: users[0].email};
            return res.send(utils.ok(userInfo));
        });
    }
);

router.get('/webida/api/oauth/admin/allusers',
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid: req.user.uid, action: 'auth:getAllUsers', rsc: 'auth:*'};
        userdb.checkAuthorize(aclInfo, function (err) {
            if (err) {
                return res.sendfail(err);
            }
            next();
        });
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
    }
);


// {email, password, name, company, telehpone, department}
router.post('/webida/api/oauth/signup2',
multipartMiddleware,
function (req, res) {
    var authInfoArr;
    try {
        authInfoArr = JSON.parse(req.body.data);
        logger.info('Signup 2', authInfoArr);
        exports.signup2(authInfoArr, function (err) {
            if (err) {
                errLog('Failed to signup. ', err);
                return res.sendfail(err);
            } else {
                return res.sendok();
            }
        });
    } catch (err) {
        errLog('failed to signup', err);
        return res.sendfail('Failed to signup: failed to paser body.data: ' + err);
    }
});

router.get('/webida/api/oauth/deleteaccount',
    userdb.verifyToken,
    function (req, res, next) {
        var uid = req.query.uid;
        userdb.findUserByUid(uid, function (err, user) {
            if (err) {
                return res.sendfail(err);
            } else if (user) {
                var aclInfo = {uid: req.user.uid, action: 'auth:deleteAccount', rsc: 'auth:' + user.userId};
                userdb.checkAuthorize(aclInfo, function (err) {
                    if (err) {
                        return res.sendfail(err);
                    }
                    next();
                });
            } else {
                return res.send(400, utils.fail('Unknown user by uid: ' + uid));
            }
        });
    },
    function (req, res) {
        var uid = req.query.uid;
        userdb.deleteUser(uid, function (err) {
            if (err) {
                return res.sendfail(err);
            } else {
                return res.sendok();
            }
        });
    }
);

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

    userdb.updateUser(field, updateInfo, function (err, updatedUser) {
        if (err || !updatedUser) {
            return res.sendfail(err);
        } else {
            return res.sendok(updatedUser);
        }
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
                if (authInfo.userId) {
                    return cb();
                }

                userdb.findUser({email: authInfo.email}, function (err, users) {
                    if (err || users.length === 0) {
                        return res.sendfail(new ClientError('Unknown user: ' + authInfo.email));
                    }

                    authInfo.uid = users[0].uid;
                    authInfo.userId = users[0].userId;
                    return cb();
                });
            }, function (cb) {
                var rsc;
                var aclInfo;
                if (user.isAdmin || authInfo.uid === user.uid) {
                    return cb();
                }

                rsc = 'auth:' + authInfo.userId;
                aclInfo = {uid: req.user.uid, action: 'auth:updateUser', rsc: rsc};
                userdb.checkAuthorize(aclInfo, function (err) {
                    if (err) {
                        return res.sendfail(err);
                    }
                    return cb();
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
);

router.post('/webida/api/oauth/signup',
    multipartMiddleware,
    function (req, res) {
        var email = req.body.email;
        var key = cuid();

        userdb.signupUser(email, key, sendEmail, function (err) {
            if (err) {
                errLog(err, 'signup error in db');
                return res.sendfail(new ClientError(err));
            } else {
                return res.sendok();
            }
        });
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

                    return next(null, keyInfo.userId);
                });
            },
            function (userId, next) {
                userdb.updateUser({userId: userId}, {password: password}, function (err, user) {
                    if (err || !user) {
                        var reason = (err ? err : 'updateUser failed.');
                        return res.status(500).send(utils.fail(reason));
                    }

                    return next(null, user);
                });
            }
        ], function (err, user) {
            userdb.removeTempKey({userId: user.userId}, function (err) {
                if (err) {
                    return res.sendfail(new ServerError('removeTempKey failed.'));
                } else {
                    req.session.opener = config.services.auth.signup.webidaSite;
                    loginHandler(req, res)(null, user);
                }
            });
        });
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
                var key = cuid();
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


// guest login
router.post('/webida/api/oauth/guestlogin',
    multipartMiddleware,
    function (req, res/*, next*/) {
        var user;
        async.waterfall([
            function (callback) {
                userdb.createGuestSequence(function (err, seq) {
                    if (err) {
                        callback(new ServerError(err));
                    }
                    logger.debug('created guest - seq = ' + seq);
                    callback(null, seq);
                });
            },
            function (sequence, callback) {
                var authInfo = {
                    email: config.guestMode.accountPrefix + sequence + '@guest.localhost',
                    password: config.guestMode.passwordPrefix + sequence,
                    name: 'Webida Guest ' + sequence,
                    company: 'ACME Corp',
                    telephone: '0000000000',
                    department: 'Section 9',
                    status: userdb.STATUS.APPROVED
                };
                logger.debug('adding user ', authInfo);
                // we may need to wrap callback for detailed status code and message
                userdb.addUser(authInfo, callback);
            },
            function (userInfo, callback) {
                user = userInfo;
                logger.debug('adding defautl policy from user info ', userInfo);
                userdb.createDefaultPolicy(userInfo, callback);
            },
            function (/*callback*/) {
                logger.debug('attempt to login with user info ', user, req.session);
                if (req.session) {
                    // If returnTo(302 redirect url) is on the auth server, cross-origin problem will be occurred.
                    req.session.returnTo = null;
                }
                loginHandler(req, res)(null, user);
            }
        ], function (err) {
            if (err) {
                return res.sendfail(err);
            }
        });
    }
);
