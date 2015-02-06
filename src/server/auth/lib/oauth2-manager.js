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

var express = require('express');
var login = require('connect-ensure-login');
var oauth2orize = require('oauth2orize');
var passport = require('passport');
var url = require('url');
var cuid = require('cuid');

var logger = require('../../common/log-manager');
var utils = require('../../common/utils');
var conf = require('../../common/conf-manager').conf;
var userdb = require('./userdb');

var server = oauth2orize.createServer();

server.serializeClient(function (client, done) {
    return done(null, client.clientID);
});

server.deserializeClient(function (id, done) {
    userdb.findClientByClientID(id, function (err, client) {
        if (err) {
            return done(err);
        }
        return done(null, client);
    });
});

server.grant(oauth2orize.grant.code(
    function (client, redirectURI, user, ares, done) {
        logger.info('auth code grant', client);
        var code = cuid();

        userdb.addNewCode(code, client.clientID, redirectURI, user.uid,
            function (err) {
                if (err) {
                    return done(err);
                }
                done(null, code);
            }
        );
    }
));

server.grant(oauth2orize.grant.token(
    function (client, user, ares, done) {
        var token = cuid();

        userdb.addNewToken(user.uid, client.clientID, token, function (err, info) {
            if (err) {
                return done(err);
            }

            logger.info('implicit grant', client.clientID, user.uid, info.token);
            done(null, token);
        });
    }
));

server.exchange(oauth2orize.exchange.code(
    function (client, code, redirectURI, done) {
        userdb.findCode(code, function (err, authCode) {
            if (err) {
                return done(err);
            }

            if (client.clientID !== authCode.clientID) {
                return done(null, false);
            }

            if (redirectURI !== authCode.redirectURI) {
                return done(null, false);
            }

            var token = cuid();

            userdb.addNewToken(authCode.userID, authCode.clientID, token, function (err) {
                    if (err) {
                        return done(err);
                    }
                    done(null, token);
                }
            );
        });
    }
));

var router = new express.Router();
module.exports.router = router;

router.get('/webida/api/oauth/authorize',
    function (req, res, next) {
        if (!req.isAuthenticated || !req.isAuthenticated()) {
            req.session.opener = req.originalUrl;
            logger.info('authorize', req.session);
            if (req.query.uip === 'true') {
                return res.redirect('/login_dialog.html?uip');
            } else {
                return res.redirect('/login_dialog.html');
            }
        }
        return next();
    },
    server.authorization(function (clientID, redirectURI, done) {
        userdb.findClientByClientID(clientID, function (err, client) {
            if (err) {
                return done(err);
            }

            logger.info('err = ', err);
            logger.info('client = ', client);

            logger.info('redirectURL check : ', client.redirectURL, redirectURI);
            // TODO : devapp should be removed
            if ((client.redirectURL != redirectURI)
                && (clientID !== conf.systemClients.devapp.clientID)) {
                return done(new Error('redirect url mismatch.'));
            }

            return done(null, client, redirectURI);
        });
    }),
    function (req, res, next) {
        var allow = { uid: req.user.uid,
                      client: req.oauth2.client.clientID,
                      transaction_id: req.oauth2.transactionID };
        req.session.allow = allow;

        userdb.checkSystemApp(allow.client, function (err, isSystemApp) {
            if (!err && isSystemApp) {
                req.body.transaction_id = req.oauth2.transactionID;
                return next();
            } else {
                return res.render('allow_dialog',
                    { transactionID: req.oauth2.transactionID,
                      user: req.user,
                      client: req.oauth2.client,
                      isDevClient: isDevClient });
            }

            /*
            var isDevClient = (req.oauth2.client.clientID === conf.webidaSystemClients.devapp.clientID);
            userdb.getAllow(allow.uid, allow.client, function (err, client) {
                if (err || !client || client.allow !== true) {
                    return res.render('allow_dialog',
                        { transactionID: req.oauth2.transactionID,
                          user: req.user,
                          client: req.oauth2.client,
                          isDevClient: isDevClient });
                } else {
                    req.body.transaction_id = req.oauth2.transactionID;
                    next();
                }
            });
            */
        });
    },
    function(err, req, res, next) {
        logger.debug('errorHandler middleware for authorization', err);
        res.send(500, 'redirectURL mismatch');
    },
    server.decision()
);

router.post('/oauth/decision',
    function (req, res, next) {
        logger.info('oauth/decision', req.body);
        /*
        userdb.updateAllow(req.session.allow.uid,
            req.session.allow.client,
            req.body.allow === 'on' ? true : false);

        */
        req.body.transaction_id = req.session.allow.transaction_id;

        next();
    },
    server.decision()
);

router.post('/oauth/token',
    passport.authenticate('oauth2-client-password', { session: false }),
    server.token(),
    server.errorHandler()
);

router.get('/webida/api/oauth/verify',
    function (req, res) {
        var token = url.parse(req.url, false).query.slice(6);
        if (!token) {
            return res.status(400).send(utils.fail('Access token is null'));
        }

        userdb.getTokenInfo(token, function (err, info) {
            if (err) {
                return res.status(503).send(utils.fail('Service unavailable'));
            } else if (!info) {
                return res.status(419).send(utils.fail('Token is expired.'));
            } else {
                userdb.findUserByUid(info.uid, function (err, userInfo) {
                    if (err) {
                        return res.send(utils.fail('User Info is not exist'));
                    } else {
                        var tokenInfo = { uid: info.uid,
                                          email: userInfo.email,
                                          clientID: info.clientID,
                                          issueDate: info.issueDate,
                                          expireTime: info.expireTime,
                                          token: token};
                        if (userInfo.isAdmin) { tokenInfo.isAdmin = true; }

                        logger.info('oauth/verify', tokenInfo);
                        return res.send(utils.ok(tokenInfo));
                    }
                });
            }
        });
    }
);

router.post('/webida/api/oauth/personaltoken',
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid:req.user.uid, action:'auth:addNewPersonalToken', rsc:'auth:*'};
        userdb.checkAuthorize(aclInfo, res, next);
    },
    function (req, res) {
        var token = cuid();

        logger.debug('add new personal token', req.user.email, token);
        userdb.addNewPersonalToken(req.user.uid, token, function (err) {
            if (err) {
                return res.status(503).send(utils.fail('Service unavailable'));
            }
            return res.send(utils.ok(token));
        });
    }
);

router['delete']('/webida/api/oauth/personaltoken/:personaltoken',
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid:req.user.uid, action:'auth:deletePersonalToken', rsc:'auth:*'};
        userdb.checkAuthorize(aclInfo, res, next);
    },
    function (req, res) {
        logger.info('delete personal token', req.url, req.params);
        var uid = req.user.uid;
        var personalToken = req.params.personaltoken;

        logger.debug('delete personal token', req.user.email, personalToken);
        userdb.deletePersonalToken(uid, personalToken, function (err) {
            if (err) {
                return res.status(503).send(utils.fail('Service unavailable'));
            }
            return res.send(utils.ok());
        });
    }
);

router.get('/webida/api/oauth/personaltoken',
    userdb.verifyToken,
    function (req, res, next) {
        var aclInfo = {uid:req.user.uid, action:'auth:getPersonalTokens', rsc:'auth:*'};
        userdb.checkAuthorize(aclInfo, res, next);
    },
    function (req, res) {
        userdb.getPersonalTokens(req.user.uid, function (err, tokens) {
            if (err) {
                return res.status(503).send(utils.fail('Service unavailable'));
            }
            logger.info('get personal tokens result', tokens);
            return res.send(utils.ok(tokens));
        });
    }
);
