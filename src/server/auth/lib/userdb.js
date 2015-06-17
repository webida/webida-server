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

var _ = require('underscore');
var dateformat = require('dateformat');
var url = require('url');
//var cuid = require('cuid');
var async = require('async');
//var mysql = require('mysql');
var Path = require('path');

var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var authMgr = require('../../common/auth-manager');
var config = require('../../common/conf-manager').conf;

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

//var collections = ['users', 'clients', 'codes', 'tokens', 'conf', 'tempkey'];

//var d = null;
var ntf = null;

//d = require('mongojs').connect(config.db.authDb, collections);

// TODO implement 'expireAfterSeconds' feature on Mysql DB
/*d.codes.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.codeExpireTime});
d.tokens.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.tokenExpireTime});
d.users.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.tempUserExpireTime});
d.tempkey.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.tempKeyExpireTime});
d.tempkey.ensureIndex({key: 1, uid: 1}, {unique: true});
d.clients.ensureIndex({clientID: 1}, {unique: true});
d.users.ensureIndex({activationKey: 1, uid: 1, email: 1}, {unique: true});
d.conf.ensureIndex({name: 1}, {unique: true});*/

var shortid = require('shortid');
var dataMapperConf = require('../../conf/data-mapper-conf.json');
var dataMapper = require('data-mapper').init(dataMapperConf);
var seqDao = dataMapper.dao('sequence');
var userDao = dataMapper.dao('user');
var groupDao = dataMapper.dao('group');
var clientDao = dataMapper.dao('client');
var codeDao = dataMapper.dao('code');
var tokenDao = dataMapper.dao('token');
var tempKeyDao = dataMapper.dao('tempKey');
var policyDao = dataMapper.dao('policy');
var schemaDao = dataMapper.dao('system');
var Transaction = dataMapper.Transaction;


exports.start = function (svc, ntfMgr) {

    /*
    d = require('mongojs').connect(global.app.config.db.authDb, collections);

    d.codes.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.codeExpireTime});
    d.tokens.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.tokenExpireTime});
    d.users.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.tempUserExpireTime});
    d.tempkey.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.tempKeyExpireTime});
    d.tempkey.ensureIndex({key: 1, uid: 1}, {unique: true});
    d.clients.ensureIndex({clientID: 1}, {unique: true});
    d.users.ensureIndex({activationKey: 1, uid: 1, email: 1}, {unique: true});
    d.conf.ensureIndex({name: 1}, {unique: true});
    */
    ntf = ntfMgr;
};


var STATUS = Object.freeze({PENDING:0, APPROVED:1, REJECTED:2, PASSWORDRESET:3});
exports.STATUS = STATUS;

//var conn;
/*function handleDisconnect() {
    conn = mysql.createConnection(config.db.mysqlDb);
    
    conn.connect(function (err) {
        if (err) {
            logger.error('mysql connect error: ', err);
            setTimeout(handleDisconnect, 2000); 
        } else {
           logger.info('mysql connected');
        } 
    });

    conn.on('error', function (err) {
        logger.info('my sql error', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            logger.error('my sql connection lost and try to connect again!!');
            handleDisconnect();
        } else {
            throw err;
        }
    });
}

handleDisconnect();*/

//exports.sqlConn = conn;
/*exports.getSqlConn = function () {
    return conn;
};*/


var ACTIONS_TO_NOTI = ['fs:*', 'fs:list', 'fs:readFile', 'fs:writeFile', 'fs:getMeta'];

function notifyTopics(policy, trigger, sessionID) {
    if (!sessionID) {
        return;
    }

    var data = {
        eventType: 'acl.changed',
        trigger: trigger,
        policy: policy,
        sessionID: sessionID
    };

    var msg = {
        topic: 'reserved',
        eventType: 'acl.change',
        data: data
    };

    var topics = [];
    policy.resource.forEach(function(rsc) {
        if (rsc.search('fs:') !== 0) {
            return;
        }

        var arr = rsc.substr(3).split('/');
        if (!arr[0] || arr[0] === '*' || !arr[1]) {
            return;
        } else {
            topics.push('sys.acl.change:fs:' + arr[0] + '/' + arr[1]);
        }
    });

    if (topics.length === 0) {
        return;
    } else {
        ntf.sysnoti2(_.uniq(topics), msg, function () {
            logger.info('notified topics - ', topics);
            logger.info('notified data - ', msg);
            return;
        });
    }
}

function getID (type, callback) {
    var transaction = new Transaction([
        seqDao.updateSequence({space: 'uid'}),
        function(context, next) {
            seqDao.getSequence({space: 'uid'}, function(err, result) {
                if (err) {
                    return next(err);
                } else {
                    if (result[0].seq > result[0].maxSeq) {
                        return next('User account reached the max limit.');
                    } else {
                        context.setData(result[0].seq);
                        return next(null);
                    }
                }
            }, context);
        }, function(context, next) {
            var uid = context.getData(1);
            userDao.addSubject({subjectId: shortid.generate(), type: type, uid: uid}, function(err) {
                next(err);
            }, context);
        }
    ]);
    transaction.start(function(err, context) {
        callback(err, context.getData(1));
    });

    /*d.conf.findAndModify({
        query: {name:'system'},
        update: {$inc: {currentUID: 1}}
    }, function (err, system) {
        if (err || !system) {
            return callback('Cannot add the user' + email);
        } else {
            if (system.currentUID > system.maxUID) {
                return callback('User account reached the max limit.');
            }

            var sql = 'INSERT INTO webida_usertype value(?,?)';
            conn.query(sql, [system.currentUID, type], function (err) {        // add to webida_policy table
                if (err)
                    return callback(err);
                return callback(null, system.currentUID);
            });
        }
    });*/
}

exports.addClient = function (client, callback) {
    client.clientId = shortid.generate();

    clientDao.$save(client, function(err) {
        if (err) {
            callback(err);
        } else {
            clientDao.$findOne({clientId: client.clientId}, callback);
        }
    });
    /*d.clients.save({clientName: name, clientID: id, clientSecret: secret,
        redirectURL: redirect, isSystemApp: isSystemApp},
        function () {
            d.clients.findOne({clientID: id}, callback);
        }
    );*/
};

exports.updateClient = function (client, callback) {
    var updateClient = {
        name: client.clientName,
        oauthClientSecret: client.clientSecret,
        redirectUrl: client.redirectURL
    };
    if (client.isSystemApp !== undefined) {
        updateClient.isSystem = client.isSystemApp ? 1 : 0;
    }
    exports.findClientByClientID(client.clientID, function(err, result) {
        if (err) {
            callback(err);
        } else if (result) {
            clientDao.$update({oauthClientId: client.clientID, $set: updateClient}, callback);
        } else {
            updateClient.oauthClientId = client.clientID;
            exports.addClient(updateClient, callback);
        }
    });
    //d.clients.update({clientID: client.clientID}, {$set: client}, {upsert: true}, callback);
};

exports.findClientByClientID = function (oauthClientId, callback) {
    clientDao.$findOne({oauthClientId: oauthClientId}, callback);
    //d.clients.findOne({clientID: clientID}, callback);
};

exports.addNewCode = function (code, clientID, redirectURI, uid, callback) {
    exports.findUserByUid(uid, function(err, user) {
        if (err) {
            callback(err);
        } else if (!user) {
            callback('unknown user uid: ' + uid);
        } else {
            var msPeriod = config.services.auth.codeExpireTime * 1000;
            var expireTime = new Date(new Date().getTime() + msPeriod);
            codeDao.$save({codeId: shortid.generate(), code: code, oauthClientId: clientID, redirectUrl: redirectURI,
                userId: user.userId, expireTime: expireTime}, function (err) {
                if (err) {
                    callback(err);
                } else {
                    exports.findCode(code, callback);
                }
            });
        }
    });

    /*d.codes.save({issueDate: new Date(), code: code, clientID: clientID,
        redirectURI: redirectURI, userID: uid, expireTime: config.services.auth.codeExpireTime},
        function () {
            d.codes.findOne({code: code}, callback);
        }
    );*/
};

exports.findCode = function (code, callback) {
    codeDao.findValidCode({code: code, currentTime: new Date()}, callback);
};

exports.getTokenInfo = function (token, callback) {
    tokenDao.findValidToken({token: token, currentTime: new Date()}, callback);
    //d.tokens.findOne({token: token}, callback);
};

exports.addNewToken = function (uid, clientID, token, callback) {
    exports.findUserByUid(uid, function(err, user) {
        if (err) {
            callback(err);
        } else if (!user) {
            callback('unknown user uid: ' + uid);
        } else {
            var msPeriod = config.services.auth.codeExpireTime * 1000;
            var expireTime = new Date(new Date().getTime() + msPeriod);
            tokenDao.$save({tokenId: shortid.generate(), token: token, oauthClientId: clientID, userId: user.userId,
                    expireTime: expireTime, validityPeriod: config.services.auth.codeExpireTime},
                function (err) {
                if (err) {
                    callback(err);
                } else {
                    tokenDao.$findOne({token: token}, callback);
                }
            });
        }
    });

    /*d.tokens.save({issueDate: new Date(), uid: uid, clientID: clientID,
        token: token, expireTime: config.services.auth.tokenExpireTime},
        function () {
            d.tokens.findOne({token: token}, callback);
        }
    );*/
};

exports.addNewPersonalToken = function (uid, token, callback) {
    exports.findUserByUid(uid, function(err, user) {
        if (err) {
            callback(err);
        } else if (!user) {
            callback('unknown user uid: ' + uid);
        } else {
            tokenDao.$save({tokenId: shortid.generate(), token: token, oauthClientId: 'any_' + token,
                userId: user.userId, validityPeriod: 0/* 0:INFINITE */}, function (err) {
                    if (err) {
                        callback(err);
                    } else {
                        tokenDao.$findOne({token: token}, callback);
                    }
                });
        }
    });

    /*d.tokens.save({issueDate: Date.now(), uid: uid, clientID: ('any_' + token),
        token: token, expireTime: 'INFINITE'},
        function () {
            d.tokens.findOne({token: token}, callback);
        }
    );*/
};

exports.deletePersonalToken = function (uid, token, callback) {
    tokenDao.$findOne({token: token}, function (err, info) {
        if (err) {
            callback(err);
        } else if (!info) {
            callback(new ClientError('Token not exist.'));
        } else {
            userDao.$findOne({userId: info.userId}, function (err, user) {
                if (err) {
                    callback('Unknown user: ' + info.userId);
                } else {
                    if (user.uid !== uid) {
                        callback(new ClientError(401, 'Unauthorized access.'));
                    } else {
                        tokenDao.$remove({tokenId: info.tokenId}, callback);
                    }
                }
            });
        }
    });
    /*d.tokens.findOne({token: token}, function (err, info) {
        if (err) {
            return callback(err);
        }
        if (!info) {
            return callback(new ClientError('Token not exist.'));
        }
        if (info.uid !== uid) {
            return callback(new ClientError(401, 'Unauthorized access.'));
        }

        d.tokens.remove({token: token}, callback);
    });*/
};

exports.deleteAllPersonalTokens = function (uid, callback) {
    tokenDao.deletePersonalTokensByUid({uid: uid}, callback);
    //d.tokens.remove({uid: uid, expireTime: 'INFINITE'}, callback);
};

exports.getPersonalTokens = function (uid, callback, context) {
    tokenDao.getPersonalTokensByUid({uid: uid}, function(err, tokens) {
        if (err) {
            return callback(err);
        }
        var result = [];
        tokens.forEach(function (token, index) {
            var tokenObj = {};
            tokenObj.issueTime = tokens[index].created;
            tokenObj.data = tokens[index].token;
            result[index] = tokenObj;
        });
        callback(null, result);
    }, context);
    /*d.tokens.find({uid: uid, expireTime: 'INFINITE'},
        function (err, tokens) {
            if (err) {
                return callback(err);
            }

            var result = [];
            tokens.forEach(function (token, index) {
                var tokenObj = {};
                tokenObj.issueTime = tokens[index].issueDate;
                tokenObj.data = tokens[index].token;
                result[index] = tokenObj;
            });
            callback(null, result);
        }
    );*/
};

exports.verifyToken = function (req, res, next) {
    var token = req.headers.authorization || url.parse(req.url, true).query.access_token;
    if (!token) {
        req.user = null;
        return next();
    }

    logger.info('verifyToken', token);
    exports.getTokenInfo(token, function (err, info) {
        if (err) {
            return res.status(500).send(utils.fail('Internal server error.'));
        } else if (!info) {
            return res.status(419).send(utils.fail('Token is expired.'));
        } else {
            exports.findUserByUid(info.uid, function (err, user) {
                if (err || !user) {
                    return res.status(500).send(utils.fail('Internal server error.'));
                } else {
                    req.user = user;
                    req.user.token = token;
                    return next();
                }
            });
        }
    });
};

exports.createServerConf = function (callback) {
    seqDao.$findOne({space: 'uid'}, function(err, sequence) {
        if (err) {
            callback(err);
        } else if (!sequence) {
            seqDao.$save({space: 'uid', currentSeq: config.services.auth.baseUID,
                    maxSeq: config.services.auth.maxUID}, callback);
        } else {
            seqDao.$update({space: 'uid', $set: {
                currentSeq: config.services.auth.baseUID, maxSeq: config.services.auth.maxUID}}, callback);
        }
    });
    /*d.conf.update({name: 'system'},
        {$set: { name: 'system', currentUID: config.services.auth.baseUID, maxUID: config.services.auth.maxUID }},
        {upsert: true}, callback);*/
};

exports.checkSystemApp = function (clientID, callback) {
    clientDao.$findOne({oauthClientId: clientID}, function(err, client) {
        if (err || !client) {
            return callback(new Error('Check system app failed(' + clientID + ')'));
        } else {
            return callback(null, client.isSystemApp);
        }
    });
};

exports.close = function (/*callback*/) {
    //d.close();
};

exports.addTempKey = function (uid, key, callback) {
    exports.findUserByUid(uid, function(err, user) {
        if (err) {
            callback(err);
        } else if (!user) {
            callback('unknown user uid: ' + uid);
        } else {
            tempKeyDao.upsertTempKey({keyId: shortid.generate(), userId: user.userId, key: key}, callback);
        }
    });


    /*d.tempkey.findOne({uid: uid}, function (err, keyInfo) {
        if (err) {
            return callback(new Error('Find tempKey failed.'));
        } else if (!keyInfo) {
            d.tempkey.save({uid: uid, key: key, issueDate: new Date()}, callback);
        } else {
            d.tempkey.remove({uid: uid}, function (err) {
                if (err) {
                    return callback(new Error('Remove existing tempKey failed.'));
                }

                d.tempkey.save({uid: uid, key: key, issueDate: new Date()}, callback);
            });
        }
    });*/
};

exports.findTempKey = function (field, callback) {
    tempKeyDao.$findOne(field, callback);
};

exports.removeTempKey = function (field, callback) {
    tempKeyDao.$remove(field, callback);
};

//==========================================================
// acldb using mysql
exports.createPolicy = function (uid, policy, token, callback, context) {
    async.waterfall([
        function (next) {
            // check resource (fs, auth, app, acl, group)
            async.each(policy.resource, function(rsc, cb) {
                var prefix = rsc.split(':')[0];
                if (!prefix) {
                    return callback(new ClientError('Service prefix of resource ' + rsc + ' is invalid.'));
                }

                if (prefix === 'fs') { // fs resource check
                    var fsid = rsc.substr(3).split('/')[0];
                    authMgr.getFSInfo(fsid, token, function(err/*, info*/) {
                        if (err) {
                            return cb(err);
                        } else {
                            return cb();
                        }
                    });
                } else if (prefix === 'fssvc') { // TODO : fs service resource check
                    return cb();
                } else if (prefix === 'auth') { // TODO : auth resource check
                    return cb();
                } else if (prefix === 'app') { // TODO : app resource check
                    return cb();
                } else if (prefix === 'acl') { // acl resource check
                    var pid = rsc.split(':')[1];
                    if (!pid) {
                        return callback(new ClientError('Invalid policy id'));
                    }

                    exports.isPolicyOwner(uid, pid, function(err, result) {
                        if (err) {
                            return callback(err);
                        } else if (result) {
                            return cb();
                        } else {
                            var rsc = 'acl:' + pid;
                            var aclInfo = {uid:uid, action:'acl:createPolicy', rsc:rsc};
                            exports.checkAuthorize(aclInfo, res, function(err, result) {
                                if (err) {
                                    return callback(err);
                                } else if (result) {
                                    return cb();
                                } else {
                                    return callback(401, utils.fail('Not authorized.'));
                                }
                            });
                        }
                    }, context);
                } else if (prefix === 'group') { // group resource check
                    var gid = rsc.split(':')[1];
                    if (!gid) {
                        return callback(new ClientError('Invalid group id'));
                    }
                    exports.isGroupOwner(uid, gid, function(err, result) {
                        if (err) {
                            return callback(err);
                        } else if (result) {
                            return cb();
                        } else {
                            var rsc = 'group:' + gid;
                            var aclInfo = {uid:uid, action:'group:createGroup', rsc:rsc};
                            exports.checkAuthorize(aclInfo, res, function(err, result) {
                                if (err) {
                                    return callback(err);
                                } else if (result) {
                                    return cb();
                                } else {
                                    return callback(401, utils.fail('Not authorized.'));
                                }
                            });
                            return cb();
                        }
                    }, context);
                } else {
                    return cb(new ClientError('Unknown service prefix.'));
                }
            }, function(err) {
                if (err) {
                    return callback(err);
                } else {
                    return next();
                }
            });
        }, function (next) {
            var pid = shortid.generate();//cuid();

            if (!policy.hasOwnProperty('effect')) {
                policy.effect = 'allow';
            }

            exports.findUserByUid(uid, function(err, user) {
                if (err) {
                    logger.error('createPolicy error', err);
                    return next(new ServerError('Internal server error while creating policy'));
                } else if (!user) {
                    logger.error('createPolicy error: user not found: ' + uid);
                    return next(new ServerError('Internal server error while creating policy'));
                } else {
                    policyDao.$save({policyId: pid, name: policy.name, effect: policy.effect, ownerId: user.userId,
                        action: JSON.stringify(policy.action), resource: JSON.stringify(policy.resource)},
                        function(err) {
                            if (err) {
                                return next(new ServerError('Internal server error while creating policy'));
                            } else {
                                return next(null, {pid:pid, name:policy.name, owner:uid,
                                    effect:policy.effect, action:policy.action, resource:policy.resource});
                            }
                    }, context);
                }
            }, context);


            /*var sql = 'INSERT INTO webida_policy VALUES (' +
                '\'' + pid + '\',' +                                // pid
                '\'' + policy.name + '\',' +                       // name
                uid + ',' +                                         // owner
                '\'' + policy.effect + '\',' +                      // effect
                '\'' + JSON.stringify(policy.action) + '\',' +      // action
                '\'' + JSON.stringify(policy.resource) + '\');';  // resource

            conn.query(sql, function (err) {        // add to webida_policy table
                if (err) {
                    logger.error('createPolicy error', err);
                    return next(new ServerError('Internal server error while creating policy'));
                }

                return next(null, {pid:pid, name:policy.name, owner:uid,
                    effect:policy.effect, action:policy.action, resource:policy.resource});
            });*/
        }
    ], callback);
};

exports.deletePolicy = function (pid, callback) {
    //var sql;
    var policy;
    var ids = null;

    logger.info('[acl] deletePolicy', pid);

    new Transaction([
        policyDao.$findOne({policyId: pid}),
        function(context, next) {
            policy = context.getData(0);
            if (!policy) {
                return next(new ClientError(404, 'No such policy.'));
            } else {
                policy.resource = JSON.parse(policy.resource);
                policyDao.$remove({policyId: pid}, next, context);
            }
        },
        policyDao.getUidsByPolicyId({policyId: pid}),
        function(context, next) {
            ids = context.getData(2);
            if (ids.length > 0) {
                policyDao.deleteRelationWithUserByPolicyId({policyId: pid}, next, context);
            } else {
                next();
            }
        }   // TODO rsccheck
    ]).start(callback);

    /*async.waterfall([
        function(next) { // get policy from webida_policy
            sql = 'SELECT * FROM webida_policy WHERE pid=?';
            conn.query(sql, [pid], function (err, result) {
                if (err) {
                    return callback(err);
                }

                if (result.length > 0) {
                    result[0].resource = JSON.parse(result[0].resource);
                    policy = result[0];
                    return next(null);
                } else {
                    return callback(new ClientError(404, 'No such policy.'));
                }
            });
        }, function(next) { // delete policy from webida_policy
            sql = 'DELETE FROM webida_policy WHERE pid=?';
            conn.query(sql, [pid], function(err) {
                if (err) {
                    return callback(err);
                }

                return next(null);
            });
        }, function(next) { // get user-policy relation from webida_userpolicy
            sql = 'SELECT id FROM webida_userpolicy WHERE pid=?';
            conn.query(sql, [pid], function(err, result) {
                if (err) {
                    return callback(err);
                }

                if (result.length > 0) {
                    ids = result;
                    return next(null);
                }

                callback(null);
            });
        }, function(next) { // delete user-policy relation from webida_userpolicy
            sql = 'DELETE FROM webida_userpolicy WHERE pid=?';
            conn.query(sql, [pid], function(err) {
                if (err) {
                    return callback(err);
                }

                return next(null);
            });
        }, function(*//*next*//*) { // delete webida_rsccheck data
            if (!ids) {
                return callback(null);
            }

            sql = 'DELETE FROM webida_rsccheck WHERE action=? AND effect=? AND ';

            var rscCond = '';
            policy.resource.forEach(function(value) {
                rscCond += 'rsc=\'' + value + '\' OR';
            });
            rscCond = rscCond.replace(/ OR$/, '');

            var uidCond = '';
            ids.forEach(function(value) {
                uidCond += ' id=' + value.id+ ' OR';
            });
            uidCond = uidCond.replace(/ OR$/, '');

            sql += '(' + rscCond + ') AND (' + uidCond + ')';

            conn.query(sql, [policy.action, policy.effect], function (err) {
                if (err) {
                    return callback(err);
                }

                return callback(null);
            });
        }
    ]);*/
};

exports.updatePolicy = function (pid, fields, sessionID, callback) {
    //var policy;
    var ids = null;
    //var sql;

    var isUpdateNeed = false;
    var isNotiNeed = false;

    if (!fields) {
        return callback(null, null);
    }

    if (fields.hasOwnProperty('action')) {
        if (_.intersection(fields.action, ACTIONS_TO_NOTI).length > 0) {
            isNotiNeed = true;
        }

        fields.action = JSON.stringify(fields.action);
        isUpdateNeed = true;
    }

    if (fields.hasOwnProperty('resource')) {
        fields.resource = JSON.stringify(fields.resource);
        isUpdateNeed = true;
    }

    if (fields.hasOwnProperty('effect')) {
        isUpdateNeed = true;
    }

    var transaction = new Transaction([
        policyDao.$findOne({policyId: pid}),
        function(context, next) {
            var policy = context.getData(0);
            if (policy) {
                isNotiNeed = _.intersection(JSON.parse(policy.action), ACTIONS_TO_NOTI).length > 0;
                next();
            } else {
                next(new ClientError('Unknown policy id: ' + pid));
            }
        },
        policyDao.getUidsByPolicyId({policyId: pid}),
        function(context, next) {
            var relation = context.getData(2);
            if (relation) {
                ids = relation;
            }
            next();
        },
        function(context, next) {
            if (!isUpdateNeed || !ids) {
                next();
            } else {
                async.each(ids, function (value, cb) {
                    exports.removePolicy({pid: pid, user: value.uid}, cb);
                }, function(err) {
                    return next(err);
                });
            }
        },
        policyDao.$update({policyId: pid, $set: fields}),
        function(context, next) {
            if (!isUpdateNeed || !ids) {
                next();
            }
            async.each(ids, function (value, cb) {
                exports.assignPolicy({pid:pid, user:value.uid}, cb);
            }, function(err) {
                return next(err);
            });
        }
    ]);
    transaction.start(function(err) {
        if (err) {
            return callback(err);
        }
        policyDao.$findOne({policyId: pid}, function(err, policy) {
            if (err) {
                callback(new ServerError(500, 'Server internal error.'));
            } else {
                if (policy) {
                    policy.action = JSON.parse(policy.action);
                    policy.resource = JSON.parse(policy.resource);

                    if (isNotiNeed) {
                        notifyTopics(policy, 'updatePolicy', sessionID);
                    }
                }
                callback(null, policy);
            }
        });
    });

    /*async.waterfall([
        function(next) { // get old policy
            sql = 'SELECT * FROM webida_policy WHERE pid=?';
            conn.query(sql, [pid], function (err, result) {
                if (err) {
                    return callback(new ServerError('Server internal error.'));
                }
                if (result.length > 0) {
                    if (_.intersection(JSON.parse(result[0].action), ACTIONS_TO_NOTI).length > 0) {
                        isNotiNeed = true;
                    }
                    return next();
                } else {
                    return callback(new ClientError('Unknown policy id.'));
                }
            });
        }, function(next) { // get user-policy relation from webida_userpolicy
            if (!isUpdateNeed) {
                return next(null);
            }

            sql = 'SELECT id FROM webida_userpolicy WHERE pid=?';
            conn.query(sql, [pid], function(err, result) {
                if (err) {
                    return callback(new ServerError(500, 'Server internal error.'));
                }

                if (result.length > 0) {
                    ids = result;
                }

                return next(null);
            });
        }, function(next) { // remove policy
            if (!isUpdateNeed || !ids) {
                return next(null);
            }

            async.each(ids, function (value, cb) {
                exports.removePolicy({pid:pid, user:value.id}, cb);
            }, function(err) {
                return next(err);
            });
        }, function(next) { // update policy object
            var sql = 'UPDATE webida_policy SET ';
            for (var key in fields) {
                sql = sql + key + '=\'' + fields[key] + '\',';
            }
            sql = sql.replace(/,$/, ' ');
            sql += 'WHERE pid=?';
            logger.info('[acl] updatePolicy', sql, pid, fields);

            conn.query(sql, [pid], function (err) {
                if (err) {
                    return callback(new ServerError('Server internal error whie updating policy.'));
                }
                return next(null);
            });
        }, function(next) { // assign policy again
            if (!isUpdateNeed || !ids) {
                return next(null);
            }

            async.each(ids, function (value, cb) {
                exports.assignPolicy({pid:pid, user:value.id}, cb);
            }, function(err) {
                return next(err);
            });
        }
    ], function(err) {
        if (err) {
            return callback(err);
        }

        sql = 'SELECT * FROM webida_policy WHERE pid=?';
        conn.query(sql, [pid], function (err, result) {
            if (err) {
                return callback(new ServerError(500, 'Server internal error.'));
            }

            if (result.length > 0) {
                result[0].action = JSON.parse(result[0].action);
                result[0].resource = JSON.parse(result[0].resource);

                if (isNotiNeed) {
                    notifyTopics(result[0], 'updatePolicy', sessionID);
                }

                return callback(null, result[0]);
            }
            return callback(null, null);
        });
    });*/
};

// info:{pid, user, sessionID}
exports.assignPolicy = function (info, callback, context) {
    async.waterfall([
        function(next) {
            policyDao.getRelation({policyId: info.pid, uid: info.user}, function(err, relation) {
                if (err) {
                    next(err);
                } else if (!relation || relation.length === 0) {
                    next();
                } else {
                    next('No such relation');
                }
            }, context);
        }, function(next) {
            policyDao.addRelation({policyId: info.pid, uid: info.user}, next, context);
        }, function(next) {
            policyDao.$findOne({policyId: info.pid}, function(/*err, policy*/) {
                //TODO rsccheck
                next();
            }, context);
        }
    ], function(err) {
        if (err && err !== 'No such relation') {
            callback(err);
        } else {
            callback();
        }
    });

    /*var transaction = new Transaction([
        policyDao.getRelation({policyId: info.pid, uid: info.user}),
        function(context, next) {
            var relation = context.getData(0);
            if (!relation || relation.length === 0) {
                next();
            } else {
                next('No such relation');
            }
        },
        policyDao.addRelation({policyId: info.pid, uid: info.user}),
        policyDao.$findOne({policyId: info.pid}),
        function(context, next) {
            //var policy = context.getData(3);
            *//* TODO rsccheck
            if (policy && policy.resource) {
                async.each(policy.resource, function (rsc, cb) {
                    conn.query(sql, [rsc, info.user, policy.action, policy.effect], function (err) {
                        return cb(err);
                    });
                }, function (err) {
                    if (err) {
                        return next(err);
                    }
                    return next(null, policy);
                });
            }*//*
            next();
        }
    ]);
    transaction.start(function(err) {
        if (err) {
            if (err === 'No such relation') {
                callback();
            } else {
                callback(err);
            }
        }
        callback();
    });*/


    /*var sql;

    async.waterfall([
        function(next) {
            sql = 'SELECT * FROM webida_userpolicy WHERE pid=? AND id=?';
            conn.query(sql, [info.pid, info.user], function(err, results) {
                if (err) {
                    return next(err);
                }
                if (results.length > 0) {
                    return callback(null);
                }
                return next(null);
            });
        }, function(next) {
            sql = 'INSERT INTO webida_userpolicy VALUES (?,?);';
            conn.query(sql, [info.pid, info.user], function(err) {
                if (err) {
                    return next(err);
                }
                return next(null);
            });
        }, function(next) {
            sql = 'SELECT * FROM webida_policy WHERE pid=?';
            conn.query(sql, [info.pid], function (err, result) {
                if (err) {
                    return next(err);
                }
                if (result.length > 0) {
                    result[0].resource = JSON.parse(result[0].resource);
                    return next(null, result[0]);
                }

                return callback(null);
            });
        }, function(policy, next) {
            sql = 'INSERT INTO webida_rsccheck VALUES (?,?,?,?);';
            async.each(policy.resource, function (rsc, cb) {
                conn.query(sql, [rsc, info.user, policy.action, policy.effect], function (err) {
                    return cb(err);
                });
            }, function (err) {
                if (err) {
                    return next(err);
                }
                return next(null, policy);
            });
        }, function(policy, next) {
            if (info.sessionID) {
                policy.action = JSON.parse(policy.action);
                notifyTopics(policy, 'assignPolicy', info.sessionID);
            }
            return next(null);
        }
    ], callback);*/
};

// info:{pid, user, sessionID}
exports.removePolicy = function (info, callback) {
    logger.info('[acl] removePolicy for ', info.pid, info.user);

    var transaction = new Transaction([
        policyDao.deleteRelation({policyId: info.pid, uid: info.user}),
        policyDao.$findOne({policyId: info.pid}),
        function(context, next) {
            /* TODO rsccheck
            var policy = context.getData(1);
            if (!policy || !policy.resource) {
                return next();
            }
            sql = 'DELETE FROM webida_rsccheck WHERE rsc=? AND id=? AND action=? AND effect=?;';
            async.each(policy.resource, function (rsc, cb) {
                conn.query(sql, [rsc, info.user, policy.action, policy.effect], function (err) {
                    if (err) {
                        cb(err);
                    } else {
                        cb();
                    }
                });
            }, function (err) {
                if (err) {
                    return next(err);
                }
                return next(null, policy);
            });
            */
            next();
        },
        function(context, next) {
            var policy = context.getData(1);
            if (info.sessionID && policy) {
                policy.action = JSON.parse(policy.action);
                notifyTopics(policy, 'removePolicy', info.sessionID);
            }
            next();
        }
    ]);
    transaction.start(callback);

    /*var sql;

    async.waterfall([
        function(next) {
            sql = 'DELETE FROM webida_userpolicy WHERE pid=? AND id=?';
            conn.query(sql, [info.pid, info.user], function (err) { next(err); });
        }, function(next) {
            sql = 'SELECT * FROM webida_policy WHERE pid=?';
            conn.query(sql, [info.pid], function (err, result) {
                if (err) {
                    return next(err);
                }

                if (result.length > 0) {
                    result[0].resource = JSON.parse(result[0].resource);
                    return next(null, result[0]);
                }

                return callback(null);
            });
        }, function(policy, next) {
            sql = 'DELETE FROM webida_rsccheck WHERE rsc=? AND id=? AND action=? AND effect=?;';
            async.each(policy.resource, function (rsc, cb) {
                conn.query(sql, [rsc, info.user, policy.action, policy.effect], function (err) {
                    if (err) {
                        cb(err);
                    } else {
                        cb();
                    }
                });
            }, function (err) {
                if (err) {
                    return next(err);
                }
                return next(null, policy);
            });
        }, function(policy, next) {
            if (info.sessionID) {
                policy.action = JSON.parse(policy.action);
                notifyTopics(policy, 'removePolicy', info.sessionID);
            }
            return next(null);
        }
    ], callback);*/
};

exports.getAssignedUser = function (pid, type, callback) {

    var queryFn = (type === 'u') ? userDao.getAllUsersByPolicyId : groupDao.getAllGroupsByPolicyId;

    queryFn({policyId: pid}, function(err, usersOrGroups) {
        callback(err, usersOrGroups);
    });

    /*var sql = 'SELECT id FROM webida_userpolicy WHERE pid=?';
    conn.query(sql, [pid], function(err, results) {
        if (results.length <= 0) {
            return callback(null, []);
        }

        var users = [];
        var queryUserInfoSql;
        if (type === 'u') {
            queryUserInfoSql = 'SELECT * FROM webida_user WHERE uid=?';
        } else {
            queryUserInfoSql = 'SELECT * FROM webida_group WHERE gid=?';
        }

        async.each(results, function (val, cb) {
            sql = 'SELECT type FROM webida_usertype where id=?';
            conn.query(sql, [val.id], function (err, types) {
                if (err) {
                    return cb(err);
                }

                if ((types.length <= 0) || (types[0].type !== type)) {
                    return cb();
                }

                conn.query(queryUserInfoSql, [val.id], function (err, user) {
                    if (err) {
                        return cb(err);
                    } else {
                        if (user.length > 0) {
                            users.push(user[0]);
                        }
                        return cb();
                    }
                });
            });
        }, function (err) {
            if (err) {
                return callback(err);
            }
            return callback(null, users);
        });
    });*/
};

exports.getAuthorizedUser = function(action, rsc, type, callback) {
    var index,
        resourceRegex,
        actionPrefix,
        users = [];
    var actionSplited = action.split(':');
    actionPrefix = (actionSplited[1] !== '*') ? actionSplited[0] : undefined;
    var patterns = [rsc];
    while ((index = rsc.lastIndexOf('/')) > -1) {
        rsc = rsc.slice(0, index);
        patterns.push(rsc + '\\\\*');
    }
    resourceRegex = patterns.join('|');

    policyDao.getPolicyIdsByActionAndResource({action: action, actionPrefix: actionPrefix,
        resourceRegex: resourceRegex}, function(err, pids) {
        if (err) {
            return callback(err);
        }

        async.eachSeries(pids, function (value, cb) {
            exports.getAssignedUser(value.policyId, type, function(err, results) {
                if (err) {
                    return cb(err);
                }

                users = users.concat(results);
                return cb();
            });
        }, function(err) {
            if (err) {
                logger.info('[acl] getAuthorizedUser failed', err);
                return callback(err);
            }

            // filtering as unique value
            var ret = [];
            for (var i = 0; i < users.length; i++) {
                if (ret.indexOf(users[i]) === -1) {
                    ret.push(users[i]);
                }
            }
            return callback(null, ret);
        });
    });

/*
    var sql = 'SELECT pid FROM webida_policy WHERE ';

    var res = action.split(':');
    var prefix = res[0];
    var str = res[1];

    sql += '(action LIKE \'%' + action + '%\'';
    if (str !== '*') {
        sql += ' OR action LIKE \'%' + prefix + ':*%\'';
    }

    sql += ') AND (resource LIKE \'%' + rsc + '%\'';
    var index;
    while (true) {
        index = rsc.lastIndexOf('/');
        if (index === -1) {
            break;
        }

        rsc = rsc.slice(0, index);
        sql += ' OR resource LIKE \'%' + rsc + '*//*%\'';
    }
    sql += ');';

    var users = [];
    logger.info('[acl] getAuthorizedUser', sql);
    conn.query(sql, function (err, pids) {
        if (err) {
            return callback(err);
        }

        async.eachSeries(pids, function (value, cb) {
            exports.getAssignedUser(value.pid, type, function(err, results) {
                if (err) {
                    return cb(err);
                }

                users = users.concat(results);
                return cb();
            });
        }, function(err) {
            if (err) {
                logger.info('[acl] getAuthorizedUser failed', err);
                return callback(err);
            }

            // filtering as unique value
            var ret = [];
            for (var i = 0; i < users.length; i++) {
                if (ret.indexOf(users[i]) === -1) {
                    ret.push(users[i]);
                }
            }
            return callback(null, ret);
        });
    });*/
};

exports.getAuthorizedRsc = function(uid, action, callback) {
    logger.info('getAuthorizedRsc', uid, action);

    var actionSplited = action.split(':');
    var actionPrefix = (actionSplited[1] !== '*') ? actionSplited[0] : undefined;

    async.waterfall([
        function(next) {
            var subjectIds = [];
            userDao.$findOne({uid: uid}, function(err, user) {
                if (err) {
                    next(err);
                } else {
                    subjectIds.push(user.userId);
                    groupDao.getAllGroupIdByUserId({userId: user.userId}, function(err, groups) {
                        if (err) {
                            next(err);
                        } else {
                            var groupIds = groups.map(function(group) {
                               return group.groupId;
                            });
                            subjectIds = subjectIds.concat(groupIds);
                            next(null, subjectIds);
                        }
                    });
                }
            });
        }, function(subjectIds, next) {
            policyDao.getResourcesByUidAndAction({subjectIds: subjectIds, action: action, actionPrefix: actionPrefix},
                function (err, resources) {
                if (err) {
                    next(err);
                } else {
                    var result = [];
                    _.forEach(resources, function (resourceStr) {
                        var resourceArr = JSON.parse(resourceStr);
                        result = result.concat(resourceArr);
                    });
                    next(null, result);
                }
             });
        }
    ], callback);


    /*var sql = 'SELECT rsc FROM webida_rsccheck WHERE effect=\'allow\' AND ' +
            '(action LIKE \'%' + action + '%\' OR action LIKE \'%' +
            action.split(':')[0] + ':*%\') AND (';

    async.waterfall([
        function(next) {
            sql += 'id=' + uid + ' OR ';
            conn.query('SELECT gid FROM webida_groupuser WHERE uid=?', [uid], function (err, results) {
                if (err) {
                    return next('Internal server error.');
                }

                if (results.length > 0) {
                    for (var i in results) {
                        sql += 'id=' + results[i].gid + ' OR ';
                    }
                }
                sql = sql.replace(/ OR $/, ');');
                return next();
            });
        }, function(next) {
            conn.query(sql, function (err, results) {
                logger.info('[acl]getAuthorizedRsc', sql, results);
                if (err) {
                    return next('Internal server error.');
                }

                var rsc = _.map(results, function(obj) {return obj.rsc;});
                return next(null, rsc);
            });
        }
    ], function (err, rsc) {
        if (err) {
            return callback(err);
        }
        return callback(null, rsc);
    });*/
};

exports.getAssignedPolicy = function (id, callback) {
    logger.info('[acl] getAssignedPolicy', id);
    policyDao.getPolicyByUid({uid: id}, function(err, policies) {
        if (err) {
            callback(err);
        } else {
            var result = policies.map(function (policy) {
                if (policy.hasOwnProperty('action')) {
                    policy.action = JSON.parse(policy.action);
                }
                if (policy.hasOwnProperty('resource')) {
                    policy.resource = JSON.parse(policy[0].resource);
                }
                return policy;
            });
            callback(null, result);
        }
    });

    /*var sql = 'SELECT pid FROM webida_userpolicy WHERE id=?';

    conn.query(sql, [id], function (err, results) {
        if (results.length <= 0) {
            return callback(null, []);
        }

        var policies = [];
        sql = 'SELECT * FROM webida_policy WHERE pid=?';
        async.each(results, function (value, cb) {
            conn.query(sql, [value.pid], function (err, policy) {
                if (err) {
                    cb(err);
                }

                if (policy.length > 0) {
                    if (policy[0].hasOwnProperty('action')) {
                        policy[0].action = JSON.parse(policy[0].action);
                    }
                    if (policy[0].hasOwnProperty('resource')) {
                        policy[0].resource = JSON.parse(policy[0].resource);
                    }
                    policies.push(policy[0]);
                }

                cb();
            });
        }, function (err) {
            if (err) {
                return callback(err);
            }
            return callback(null, policies);
        });
    });*/
};

exports.getOwnedPolicy = function (id, callback) {
    logger.info('[acl] getOwnedPolicy', id);

    policyDao.getPolicyByOwnerUid({uid: id}, callback);
    /*var sql = 'SELECT * FROM webida_policy WHERE owner=?';
    conn.query(sql, [id], callback);*/
};

exports.getPolicies = function (pidArr, callback) {

    policyDao.getPolicyByPolicyIds({policyIds: pidArr}, function(err, policies) {
        if (err) {
            callback(err);
        } else {
            var result = policies.map(function (policy) {
                if (policy.hasOwnProperty('action')) {
                    policy.action = JSON.parse(policy.action);
                }
                if (policy.hasOwnProperty('resource')) {
                    policy.resource = JSON.parse(policy[0].resource);
                }
                return policy;
            });
            callback(null, result);
        }
    });

    /*var policies = [];
    var sql = 'SELECT * FROM webida_policy WHERE pid=?';
    async.eachSeries(pidArr, function (pid, cb) {
        conn.query(sql, [pid], function (err, policy) {
            if (err) {
                cb(err);
            }

            if (policy.length > 0) {
                if (policy[0].hasOwnProperty('action')) {
                    policy[0].action = JSON.parse(policy[0].action);
                }
                if (policy[0].hasOwnProperty('resource')) {
                    policy[0].resource = JSON.parse(policy[0].resource);
                }
                policies.push(policy[0]);
            }

            cb();
        });
    }, function (err) {
        if (err) {
            return callback(err);
        }
        return callback(null, policies);
    });*/
};

//==========================================================
// groupdb using mysql
exports.createGroup = function (group, callback) {
    async.waterfall([
        function (next) {
            groupDao.getGroup(group, function(err, result) {
                if (err) {
                    return next(err);
                }
                if (result.length > 0) {
                    return next(new ClientError('The group is already exist.'));
                } else {
                    return next(null);
                }
            });

            /*var sql = 'select * from webida_group where owner=? AND name=?';
            conn.query(sql, [group.owner, group.name], function (err, results) {
                if (err) {
                    return next(err);
                }
                if (results.length > 0) {
                    return next(new ClientError('The group is already exist.'));
                } else {
                    return next(null);
                }
            });*/
        }, function (next) {
            getID('g', function (err, id) {
                if (err) {
                    return next(err);
                }
                return next(null, id);
            });
        }, function (gid, next) {
            group.groupId = shortid.generate();
            group.gid = gid;

            groupDao.addGroup(group, function(err) {
                if (err) {
                    return next(err);
                }
                return next(null, group);
            });

            /*var sql = 'INSERT INTO webida_group VALUES (?,?,?,?)';
            conn.query(sql, [gid, group.name, group.owner, group.userdata], function (err) {
                if (err) {
                    return next(err);
                }
                return next(null, {gid:gid, name:group.name, owner:group.owner, userdata:group.userdata});
            });*/
        }
    ], callback);
};

exports.deleteGroup = function (gid, callback) {
    var groupId;
    new Transaction([
        groupDao.$findOne({gid: gid}),
        function(context, next) {
            var group = context.getData(0);
            if (group) {
                groupId = group.groupId;
            } else {
                next(new ClientError('Unkown group: ' + gid));
            }
        },
        groupDao.deleteRelationWithPolicyByGroupId({groupId: groupId}),
        groupDao.deleteRelationWithUserByGroupId({groupId: groupId}),
        groupDao.deleteSubjectByGroupId({groupId: groupId}),
        groupDao.$remove({grouId: groupId})
    ]).start(callback);


    /*var sql;
    async.waterfall([
        function (next) {
            sql = 'DELETE FROM webida_group WHERE gid=?';
            logger.info('[group] deleteGroup query string is ', sql);
            conn.query(sql, [gid], function(err) {
                if (err) {
                    return next(err);
                }
                return next(null);
            });
        }, function (next) {
            sql = 'DELETE FROM webida_usertype WHERE id=? AND type=\'g\';';
            conn.query(sql, [gid], function(err) {
                if (err) {
                    return next(err);
                }
                return next(null);
            });
        }, function (next) {
            sql = 'DELETE FROM webida_groupuser WHERE gid=?';
            conn.query(sql, [gid], function(err) {
                if (err) {
                    return next(err);
                }
                return next(null);
            });
        }, function (next) {
            sql = 'SELECT * FROM webida_userpolicy WHERE id=?';
            conn.query(sql, [gid], function(err, results) {
                if (err) {
                    return next(err);
                } else if (results.length === 0) {
                    return next(null);
                } else {
                    async.eachSeries(results, function(value, cb) {
                        var info = {pid:value.pid, user:gid, sessionID:null};
                        exports.removePolicy(info, function(err) {
                            if (err) {
                                return cb(err);
                            } else {
                                return cb(null);
                            }
                        });
                    }, next);
                }
            });
        }
    ], callback);*/
};

exports.addUsersToGroup = function (uidArr, gid, callback) {
    if (uidArr.length === 0) {
        return callback(null);
    }

    groupDao.$findOne({gid: gid}, function(err, group) {
       if (err) {
           callback(err);
       } else if (group) {
           var groupId = group.groupId;
           groupDao.addUsersToGroup({groupId: groupId, userIds: uidArr}, callback);
       } else {
           callback(new ClientError('Unknown group: '+ gid));
       }
    });

   /* var sql = 'INSERT INTO webida_groupuser VALUES ';
    uidArr.forEach(function(uid) {
        sql += '(' + gid + ',' + uid + '), ';
    });
    sql = sql.replace(/, $/, ';');

    logger.info('[group] addUserToGroup query string is ', sql);
    conn.query(sql, callback);*/
};

exports.removeUsersFromGroup = function (uidArr, gid, callback) {
    if (uidArr.length === 0) {
        return callback(true);
    }

    groupDao.$findOne({gid: gid}, function(err, group) {
        if (err) {
            callback(err);
        } else if (group) {
            var groupId = group.groupId;
            groupDao.removeUsersFromGroup({groupId: groupId, userIds: uidArr}, callback);
        } else {
            callback(new ClientError('Unknown group: '+ gid));
        }
    });

   /* var sql = 'DELETE FROM webida_groupuser WHERE gid=' + gid + ' AND (';
    uidArr.forEach(function(value) {
        sql += 'uid=' + value + ' OR ';
    });
    sql = sql.replace(/OR $/, ')');

    logger.info('[group] removeUserFromGroup query string is ', sql);
    conn.query(sql, callback);*/
};


exports.getGroups = function (uid, callback) {
    groupDao.getAllGroupByOwnerUid({uid: uid}, callback);
    /*var sql = 'SELECT * FROM webida_group WHERE owner=?';
    logger.info('[group] getMyGroups query string is ', sql);
    conn.query(sql, [uid], callback);*/
};

exports.getAssignedGroups = function(uid, callback) {
    groupDao.getAllGroupByUid({uid: uid}, callback);

    /*var sql = 'SELECT * FROM webida_groupuser WHERE uid=?';
    logger.info('[group] getAssignedGroups query string is ', sql);
    conn.query(sql, [uid], function (err, results) {
        if (err) {
            return callback(err);
        }

        if (results.length <= 0) {
            return callback(null, []);
        }

        var groups = [];
        async.eachSeries(results, function (value, cb) {
            sql = 'SELECT * FROM webida_group where gid=?';
            conn.query(sql, [value.gid], function(err, group) {
                if (err || group.length <= 0) {
                    return cb('Failed to get the group ' + value.gid + ' information.');
                }

                groups.push(group[0]);
                return cb();
            });
        }, function(err) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, groups);
            }
        });
    });*/
};

exports.getGroupMembers = function (gid, callback) {
    userDao.getAllUserByGid({gid: gid}, callback);

    /*var sql = 'SELECT * FROM webida_groupuser WHERE gid=?';
    logger.info('[group] getGroupMembers query string is ', sql);
    conn.query(sql, [gid], function (err, results) {
        if (err) {
            return callback(err);
        }

        if (results.length <= 0) {
            return callback(null, []);
        }

        var members = [];
        async.eachSeries(results, function (value, cb) {
            sql = 'SELECT * FROM webida_user where uid=?';
            conn.query(sql, [value.uid], function(err, user) {
                if (err || user.length <= 0) {
                    return cb('Failed to get the user' + value.uid + ' information.');
                }

                members.push(user[0]);
                return cb();
            });
        }, function(err) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, members);
            }
        });
    });*/
};

exports.setGroupMembers = function (gid, uidArr, callback) {
    groupDao.$findOne({gid: gid}, function(err, group) {
        if (err) {
            callback(err);
        } else if (group) {
            var groupId = group.groupId;
            groupDao.deleteRelationWithUserByGroupId({groupId: groupId}, function(err) {
                if (err) {
                    callback(err);
                } else {
                    exports.addUsersToGroup(uidArr, gid, callback);
                }
            });
        } else {
            callback(new ClientError('Unknown group: '+ gid));
        }
    });

    /*conn.query('DELETE FROM webida_groupuser WHERE gid=' + gid, function(err) {
        if (err) {
            return callback(err);
        }

        return exports.addUsersToGroup(uidArr, gid, callback);
    });*/
};

exports.getAllGroups = function (callback) {
    groupDao.$find({}, callback);
    /*var sql = 'SELECT * FROM webida_group;';
    logger.info('[group] getAllGroups query string is ', sql);
    conn.query(sql, callback);*/
};

exports.UPDATABLE_GROUPINFO = ['name', 'userdata'];
exports.updateGroup = function (gid, groupInfo, callback) {
    new Transaction([
        groupDao.$findOne({gid: gid}),
        function(context, next) {
            var group = context.getData(0);
            if (group) {
                if (groupInfo.hasOwnProperty('name')) {
                    groupDao.$findOne({name: groupInfo.name, ownerId: group.ownerId}, function(err, result) {
                        if (err) {
                            next(err);
                        } else if (result) {
                            next(new ClientError('The group name is already exist.'));
                        } else {
                            next();
                        }
                    }, context);
                }
            } else {
                next(new ClientError('Group not found'));
            }
        },
        groupDao.$update({gid: gid, $set: groupInfo})
    ]).start(function(err) {
        if (err) {
            callback(err);
        }
        groupDao.$findOne({gid: gid}, callback);
    });

    /*async.waterfall([
        function (next) {
            var sql = 'SELECT * FROM webida_group WHERE gid=?';
            conn.query(sql, [gid], function(err, groups) {
                if (err) {
                    return next(err);
                } else if (groups.length === 0) {
                    return next(new ClientError('Group not found'));
                } else {
                    return next(null, groups[0]);
                }
            });
        }, function (group, next) {
            if (groupInfo.hasOwnProperty('name')) {
                var sql = 'SELECT * FROM webida_group WHERE owner=? AND name=?';
                conn.query(sql, [group.owner, groupInfo.name], function (err, results) {
                    if (err) {
                        return next(err);
                    }
                    if (results.length > 0) {
                        return next(new ClientError('The group name is already exist.'));
                    } else {
                        return next(null, group);
                    }
                });
            } else {
                return next(null, group);
            }
        }, function (group, next) {
            groupInfo = _.pick(groupInfo, exports.UPDATABLE_GROUPINFO);

            var sql = 'UPDATE webida_group SET ';
            for (var key in groupInfo) {
                sql = sql + key + '=\'' + groupInfo[key] + '\',';
            }
            sql = sql.slice(0, sql.length - 1);
            sql += ' WHERE gid=?';
            conn.query(sql, [gid], function (err) {
                if (err) {
                    return next(err);
                } else {
                    return next(null);
                }
            });
        }, function (next) {
            var sql = 'SELECT * FROM webida_group WHERE gid=?';
            conn.query(sql, [gid], function(err, groups) {
                if (err) {
                    return next(err);
                } else if (groups.length === 0) {
                    return next(new ClientError('New group not found'));
                } else {
                    return next(null, groups[0]);
                }
            });
        }
    ], function (err, group) {
        if (err) {
            return callback(err);
        }
        return callback(null, group);
    });*/
};

//==========================================================
// userdb using mysql

exports.findUserByUid = function (uid, callback, context) {
    userDao.$findOne({uid: uid}, callback, context);
    /*exports.findUser({uid:uid}, function(err, users) {
        if (users.length === 0) {
            return callback(err, null);
        } else {
            return callback(null, users[0]);
        }
    });*/
};

exports.findUserByEmail = function (email, callback) {
    exports.findUser({email:email}, function(err, users) {
        if (users.length === 0) {
            return callback(err, null);
        } else {
            return callback(null, users[0]);
        }
    });
};

exports.FINDABLE_USERINFO = ['userId', 'uid', 'email', 'name', 'company', 'telephone', 'department', 'url', 'location',
    'gravatar', 'activationKey', 'status', 'isAdmin'];
exports.findUser = function (info, callback) {
    info = _.pick(info, exports.FINDABLE_USERINFO);

    userDao.findUsers(info, callback);

   /* var sql = 'SELECT * FROM webida_user WHERE ';

    for (var key in info) {
        sql += key + ' LIKE \'%' + info[key] + '%\' AND ';
    }
    sql = sql.replace(/ AND $/, ';');

    logger.info('[user] findUser ', info);
    conn.query(sql, callback);*/
};

// authinfo : {email, password, name, company, telephone, department, activationKey}
// email, password must be exist.
exports.findOrAddUser = function (authinfo, callback, context) {
    logger.info('findOrAddUser authinfo', authinfo);

    if (!config.services.auth.signup.allowSignup) {
        return callback('Signup is forbidden');
    }

    if (!authinfo.email) {
        return callback('Email is required');
    }

    var emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailPattern.test(authinfo.email)) {
        return callback('Invalid email address format');
    }

    if (!authinfo.password) {
        return callback('Password is required');
    }

    userDao.$findOne({email: authinfo.email}, function(err, user) {
        if (err) {
            logger.info(err);
            callback(err);
        } else if (user) {
            if (user.status === STATUS.PENDING) {
                logger.info('found a PENDING user. update activation key', authinfo.email);
                exports.updateUserActivationKey(user.uid, authinfo.activationKey, callback);
            } else {
                logger.info('Found user', user);
                return callback('Email '+authinfo.email+' is already used.');
            }
        } else {
            logger.info('cannot find user. add it', authinfo.email);
            exports.addUser(authinfo, callback, context);
        }
    }, context);

    /*var sql = 'SELECT * FROM webida_user WHERE email=?';
    conn.query(sql, [authinfo.email], function (err, users) {
        if (err) {
            logger.info(err);
            return callback(err);
        } else if (users.length > 0) {
            if (users[0].status === STATUS.PENDING) {
                logger.info('found a PENDING user. update activation key', authinfo.email);
                exports.updateUserActivationKey(users[0].uid, authinfo.activationKey, callback);
            } else {
                logger.info('Found user', users);
                return callback('Email '+authinfo.email+' is already used.');
            }
        } else {
            logger.info('cannot find user. add it', authinfo.email);
            exports.addUser(authinfo, callback);
        }
    });*/
};

exports.updateUserActivationKey = function(uid, activationKey, callback) {
    userDao.$update({uid: uid, $set: {activationKey: activationKey}}, function(err) {
        if (err) {
            callback(err);
        } else {
            exports.findUserByUid(uid, function (err, user) {
                if (err) {
                    return callback(err);
                }
                if (!user) {
                    return callback(new ClientError('User not found'));
                }
                return callback(null, user);
            });
        }
    });
   /*conn.query('UPDATE webida_user SET activationKey = ? WHERE uid = ?', [activationKey, uid], function (err) {
        if (err) {
            callback(err);
        }
        exports.findUserByUid(uid, function (err, user) {
            if (err) {
                return callback(err);
            }
            if (!user) {
                return callback(new ClientError('User not found'));
            }
            return callback(null, user);
        });
    });*/
};

// authinfo : {email, password, name, company, telephone, department, activationKey}
exports.addUser = function (authinfo, callback) {
    getID('u', function (err, uid) {
        if (err) {
            return callback(err);
        } else {
            authinfo.userId = shortid.generate();
            authinfo.passwordDigest = utils.getSha256Digest(authinfo.password);
            authinfo.uid = uid;
            authinfo.status = authinfo.status || STATUS.PENDING;
            authinfo.isAdmin = authinfo.isAdmin || 0;

            userDao.addUser(authinfo, function(err) {
                if (err) {
                    return callback(err);
                }
                return exports.findUserByUid(uid, callback);
            });

            /*var digest = utils.getSha256Digest(authinfo.password);
            var sql = 'INSERT INTO webida_user VALUES (' +
                id + ',' +
                '\'' + authinfo.email + '\',' +
                '\'' + digest + '\',' +
                '\'' + authinfo.name + '\',' +
                '\'' + authinfo.company + '\',' +
                '\'' + authinfo.telephone + '\',' +
                '\'' + authinfo.department + '\',' +
                '\'' + authinfo.url + '\',' +
                '\'' + authinfo.location + '\',' +
                '\'' + authinfo.gravatar + '\',' +
                '\'' + authinfo.activationKey + '\',' +
                (authinfo.status ? authinfo.status : STATUS.PENDING) + ',' +
                (authinfo.isAdmin ? authinfo.isAdmin : 0) + ',' +
                'NOW(),NOW());';
            logger.info('[user] addUser ', sql);
            conn.query(sql, function(err) {
                if (err) {
                    return callback(err);
                }
                return exports.findUserByUid(id, callback);
            });*/
        }
    });
};

exports.UPDATABLE_USERINFO = ['password', 'name', 'company', 'telephone', 'department', 'url', 'location',
    'gravatar', 'status', 'isAdmin'];
exports.updateUser = function (field, fields, callback, context) {
    exports.findUser(field, function (err, users) {
        if (err) {
            return callback(err);
        }
        if (users.length === 0) {
            return callback(new ClientError('User not found'));
        }

        fields = _.pick(fields, exports.UPDATABLE_USERINFO);
        if (fields.hasOwnProperty('password')) {
            var digest = utils.getSha256Digest(fields.password);
            fields.passwordDigest = digest;
            delete fields.password;

            if (users[0].status === STATUS.PASSWORDRESET) {
                fields.status = STATUS.APPROVED;
            }
        }
        logger.debug('updateUser', users[0].email, fields);

        userDao.$update({uid: users[0].uid, $set: fields}, function(err) {
            if (err) { callback(err); }

            exports.findUserByUid(users[0].uid, function (err, user) {
                if (err) {
                    return callback(err);
                }
                if (!user) {
                    return callback(new ClientError('User not found'));
                }
                return callback(null, user);
            }, context);
        }, context);

       /* var sql = 'UPDATE webida_user SET ';
        for (var key in fields) {
            sql = sql + key + '=\'' + fields[key] + '\',';
        }
        sql = sql.slice(0, sql.length - 1);
        sql += ' WHERE uid=' + users[0].uid;

        conn.query(sql, function (err, result) {
            if (err) { callback(err); }

            exports.findUserByUid(users[0].uid, function (err, user) {
                if (err) {
                    return callback(err);
                }
                if (!user) {
                    return callback(new ClientError('User not found'));
                }
                return callback(null, user);
            });
        });*/
    }, context);
};

exports.getAllUsers = function (callback) {
    function date(timestamp) {
        return dateformat(new Date(timestamp), 'yyyy-mm-dd HH:MM:ss Z');
    }
    exports.getSessions(function (err, sessions) {
        if (err) { throw err; }
        var sessMap = {};
        sessions.forEach(function (session) {
            var sessObj = JSON.parse(session.session);
            if (sessObj.passport && sessObj.passport.user) {
                sessMap[sessObj.passport.user] = sessObj;
            }
        });

        userDao.$find({}, function(err, users) {
            if (users.length <= 0) {
                return callback(null, []);
            }
            var result = {};
            users.forEach(function (user) {
                logger.debug('session user: ', user, sessMap[user.email]);
                if (user.lastLoginTimestampUTC) {   // FIXME ???
                    user.lastLoginStr = date(user.lastLoginTimestampUTC);
                }
                result[user.email] = user;
            });
            return callback(err, result);
        });

        /*var sql = 'SELECT * FROM webida_user';
        logger.info('[acl] getAllUsers query string is ', sql);
        conn.query(sql, function (err, users) {
            if (users.length <= 0)
                return callback(null, new Array());

            var result = {};
            users.forEach(function (user) {
                logger.debug('session user: ', user, sessMap[user.email]);
                if (user.lastLoginTimestampUTC) {
                    user.lastLoginStr = date(user.lastLoginTimestampUTC);
                }
                result[user.email] = user;
            });
            return callback(err, result);
        });*/
    });
};

exports.deleteUser = function (uid, callback) {

    userDao.$findOne({uid: uid}, function (err, user) {
        var userId;

        if (err) {
            callback(err);
        } else if (!user) {
            callback(new ClientError('Unknown user: ' + uid));
        } else {
            userId = user.userId;

            new Transaction([
                policyDao.deletePolicyAndRelationByOwnerId({ownerId: userId}),
                policyDao.deleteRelationWithUserBySubjectId({subjectId: userId}),
                groupDao.deleteGroupAndRelationWithUserByOwnerId({ownerId: userId}),
                groupDao.deleteRelationWithUserByUserId({userId: userId}),
                tokenDao.deletePersonalTokensByUid({uid: uid})
                // TODO rsccheck
            ]).start(callback);
        }
    });

    /*var sql;
    async.waterfall([
        function (next) {
            // delete from webida_user
            sql = 'DELETE FROM webida_user WHERE uid=?';
            conn.query(sql, [uid], function(err) {
                return next(err);
            });
        }, function (next) {
            // delete from webida_usertype
            sql = 'DELETE FROM webida_usertype WHERE id=?';
            conn.query(sql, [uid], function(err) {
                return next(err);
            });
        }, function (next) {
            // delete from webida_userpolicy
            sql = 'DELETE FROM webida_userpolicy WHERE id=?';
            conn.query(sql, [uid], function(err) {
                return next(err);
            });
        }, function (next) {
            // delete from webida_group
            sql = 'DELETE FROM webida_group WHERE owner=?';
            conn.query(sql, [uid], function(err) {
                return next(err);
            });
        }, function (next) {
            // delete from webida_groupuser
            sql = 'DELETE FROM webida_groupuser WHERE uid=?';
            conn.query(sql, [uid], function(err) {
                return next(err);
            });
        }, function (next) {
            // delete from webida_policy
            sql = 'DELETE FROM webida_policy WHERE owner=?';
            conn.query(sql, [uid], function(err) {
                return next(err);
            });
        }, function (next) {
            // delete from webida_rsccheck
            sql = 'DELETE FROM webida_rsccheck WHERE id=?';
            conn.query(sql, [uid], function(err) {
                return next(err);
            });
        }
    ], function (err) {
        return callback(err);
    });*/
};

exports.setLastLogin = function (uid, callback) {
    userDao.$update({uid: uid, $set: {lastLoginTime: new Date()}}, callback);
    /*var sql = 'UPDATE webida_user SET lastLogin=NOW(), WHERE uid=?';
    logger.info('[acl] setLastLogin query string is ', sql);
    conn.query(sql, [uid], callback);*/
};

// aclInfo : {uid:int, action:string, rsc:string}
exports.checkAuthorize = function (aclInfo, res, callback) {
    // if uid === owner then return true;

    function makeRscArr(rsc) {
        var rscArr = [
            rsc,
            rsc + '/*',
            Path.dirname(rsc) + '/+'    // FIXME ??
        ];
        var res = rsc.split(':');
        var prefix = res[0];
        var str = res[1];
        if (str === '*') {
            return rscArr;
        }

        var index;
        while (true) {
            index = str.lastIndexOf('/');
            if (index === -1) {
                break;
            }

            str = str.slice(0, index);
            rscArr.push(prefix + ':' + str + '/*');
        }
        rscArr.push(prefix + ':*');
        return rscArr;
    }

    var rscArr = makeRscArr(aclInfo.rsc);
    var idArr = [0, 1];

    async.waterfall([
        function(next) {
            if (aclInfo.uid === 0) {
                next(null, 0);
            } else {
                userDao.$findOne({uid: aclInfo.uid}, function(err, user) {
                    if (err) {
                        next(new ServerError(500, 'Server error while check authorization.'));
                    } else if (!user) {
                        next(new ClientError(400, 'Unknown User: ' + aclInfo.uid));
                    } else {
                        next(null, user.userId);
                    }
                });
            }
        },
        function(userId, next) {
            if (userId === 0) {
                next();
            } else {
                idArr.push(userId);
                groupDao.getAllGroupIdByUserId({userId: userId}, function(err, groupIds) {
                   if (err) {
                       next(new ServerError(500, 'Server error while check authorization.'));
                   } else {
                       idArr = idArr.concat(_.toArray(groupIds));
                       next();
                   }
                });
            }
        }, function(next) {
            policyDao.getPolicyBySubjectIdsAndResources({subjectIds: idArr, resources: rscArr}, function(err, result) {
                if (err) {
                    next(new ServerError(500, 'Server error while check authorization.'));
                } else {
                    var allowed = false;
                    for (var i=0; i<result; i++) {
                        var policy = result[i];
                        if ((policy.action.indexOf(aclInfo.action) > -1) || (policy.action.indexOf('*') > -1)) {
                            if (policy.effect === 'deny') {
                                logger.info('[acl] checkAuthorize find deny policy, so return 401');
                                next(new ClientError(401, utils.fail('Not authorized.')));
                                break;
                            } else {
                                allowed = true;
                            }
                        }
                    }
                    if (allowed) {
                        return next();
                    } else {
                        return next(new ClientError(401, 'Not authorized.'));
                    }
                }
            });
        }
    ], function(err) {
        if (err) {
            res.sendfail(err);
            logger.info('[acl] checkAuthorize denied for ', aclInfo);
            return callback(null, false);
        } else {
            logger.info('[acl] checkAuthorize allowed for ', aclInfo);
            return callback(null, true);
        }
    });

/*

    var sql = 'SELECT action, effect FROM webida_rsccheck WHERE rsc=? AND (';

    async.waterfall([
        function (next) {
            var res = aclInfo.rsc.split(':');
            var prefix = res[0];
            var str = res[1];
            if (str === '*') {
                return next();
            }

            var index;
            while (true) {
                index = str.lastIndexOf('/');
                if (index === -1) {
                    break;
                }

                str = str.slice(0, index);
                rscArr.push(prefix + ':' + str + '*//*');
            }
            rscArr.push(prefix + ':*');
            return next();
        }, function (next) {
            if (aclInfo.uid === 0) {
                sql += 'id=0);';
                return next();
            }

            sql += 'id=0 OR id=1 OR id=' + aclInfo.uid + ' OR ';
            conn.query('SELECT gid FROM webida_groupuser WHERE uid=?', [aclInfo.uid],
                function (err, results) {
                    if (err) {
                        return res.send(500, utils.fail('Internal server error.'));
                    }

                    if (results.length > 0) {
                        for (var i in results) {
                            sql += 'id=' + results[i].gid + ' OR ';
                        }
                    }
                    sql = sql.replace(/ OR $/, ');');
                    return next();
                }
            );
        }
    ], function (err) {
        if (err) {
            return res.send(500, utils.fail('Server error while checking authorization.'));
        }

        async.eachSeries(rscArr, function (value, cb) {
            conn.query(sql, [value], function (err, rows) {
                if (err) {
                    return res.send(500, utils.fail('Server error while check authorization.'));
                } else if (rows.length > 0) {
                    for (var i in rows) {
                        if ((rows[i].action.indexOf(aclInfo.action) === -1) &&
                            (rows[i].action.indexOf('*') === -1)) {
                            continue;
                        }
                        ret = true;
                        if (rows[i].effect === 'deny') {
                            logger.info('[acl] checkAuthorize find deny policy, so return 401');
                            return res.send(401, utils.fail('Not authorized.'));
                        }
                    }

                    if (ret) {
                        return cb(ret); // If find allow, return with error to control flow
                    } else {
                        return cb(); // If not found, continue to search the parent resource
                    }
                } else {
                    return cb();
                }
            });
        }, function (err) {
            if (err) {
                logger.info('[acl] checkAuthorize allowed for ', aclInfo);
                return callback(null, true);
            }
            logger.info('[acl] checkAuthorize denied for ', aclInfo);
            return callback(null, false);
        });
    });*/
};

exports.createSQLTable = function(callback) {
    logger.info('[acl] createSQLTable called.');

    new Transaction([
        schemaDao.createUserTable(),
        schemaDao.createTempKeyTable(),
        schemaDao.createGroupTable(),
        schemaDao.createGroupUserTable(),
        schemaDao.createSubjectTable(),
        schemaDao.createPolicyTable(),
        schemaDao.createPolicySubjectTable(),
        schemaDao.createSequenceTable(),
        schemaDao.createClientTable(),
        schemaDao.createCodeTable(),
        schemaDao.createTokenTable(),
        function(context, next) {
            userDao.$findOne({userId: '0'}, function(err, system) {
                if (err) {
                    next(err);
                } else if (!system) {
                    schemaDao.addSystemUser({}, function(err) {
                        if (err) {
                            next(err);
                        } else {
                            schemaDao.addSystemSubject({}, function(err) {
                                next(err);
                            }, context);
                        }
                    }, context);
                } else {
                    next();
                }
            }, context);
        }
    ]).start(callback);

/*

    // TODO : create webida user of mysql and webida database
    var sql;
    async.series([
        function(cb) { // webida_user table
            sql = 'CREATE TABLE IF NOT EXISTS webida_user(' +
                'uid int(10) primary key,' +
                'email varchar(255) not null,' +
                'passwordDigest varchar(255) not null,' +
                'name varchar(255),' +
                'company varchar(255),' +
                'telephone varchar(16),' +
                'department varchar(255),' +
                'url varchar(255),' +
                'location varchar(1024),' +
                'gravatar varchar(255),' +
                'activationKey varchar(255),' +
                'status tinyint(1),' +
                'isAdmin tinyint(1),' +
                'issueDate datetime,' +
                'lastLogin datetime);';

            logger.info('[acl] createSQLTable create webida_user', sql);
            conn.query(sql, function(err, result) {
                return cb(err);
            });
        }, function(cb) { // webida_group table
            sql = 'CREATE TABLE IF NOT EXISTS webida_group(' +
                'gid int(10) primary key,' +
                'name varchar(255) not null,' +
                'owner int(10) not null,' +
                'userdata varchar(1024));';
            conn.query(sql, function(err) {
                return cb(err);
            });
        }, function(cb) { // webida_groupuser table
            var sql = 'CREATE TABLE IF NOT EXISTS webida_groupuser(' +
                'gid int(10) not null,' +
                'uid int(10) not null);';
            conn.query(sql, function(err) {
                return cb(err);
            });
        }, function(cb) { // webida_usertype table
            var sql = 'CREATE TABLE IF NOT EXISTS webida_usertype(' +
                'id int(10) primary key,' +
                'type char(1));';
            conn.query(sql, function(err) {
                return cb(err);
            });
        }, function(cb) { // webida_userpolicy table
            var sql = 'CREATE TABLE IF NOT EXISTS webida_userpolicy(' +
                'pid varchar(255) not null,' +
                'id int(10) not null);';
            conn.query(sql, function(err) {
                return cb(err);
            });
        }, function(cb) { // webida_policy table
            var sql = 'CREATE TABLE IF NOT EXISTS webida_policy(' +
                'pid varchar(255) primary key,' +
                'name varchar(255) not null,' +
                'owner int(10) not null,' +
                'effect varchar(5),' +
                'action varchar(1024),' +
                'resource varchar(16384));';
            conn.query(sql, function(err) {
                return cb(err);
            });
        }, function(cb) { // webida_rsccheck table
            var sql = 'CREATE TABLE IF NOT EXISTS webida_rsccheck(' +
                'rsc varchar(16384) not null,' +
                'id int(10) not null,' +
                'action varchar(1024),' +
                'effect varchar(5));';
            conn.query(sql, function(err) {
                return cb(err);
            });
        }
    ], function (err) {
        if (err) {
            return callback(err);
        }
        return callback(null);
    });*/
};

exports.createSystemFSPolicy = function(callback) {
    logger.info('[acl] createSystemFSPolicy called.');
    async.each(config.services.auth.systemFS, function(rsc, cb) {
        //TODO rsccheck
        var systemPolicy = {
            policyId: shortid.generate(),
            name:'systemFs',
            ownerId: '0',
            resource: rsc,
            action: '["fs:*"]',
            effect: 'allow'
        };
        policyDao.$findOne(systemPolicy, function(err, result) {
           if (err) {
               cb(err);
           } else if (result) {
               cb();
           } else {
               policyDao.$save(systemPolicy, function(err) {
                   cb(err);
               });
           }
        });
    }, function (err) {
        logger.info('[acl] createSystemFSPolicy end.', err);
        return callback(err);
    });

    /*

    var sql1 = 'SELECT * FROM webida_rsccheck WHERE rsc=? AND id=? AND action=? and effect=?;';
    var sql2 = 'INSERT INTO webida_rsccheck VALUES (?,?,?,?);';
    async.each(config.services.auth.systemFS, function(rsc, cb) {
        conn.query(sql1, [rsc, 0, '["fs:*"]', 'allow'], function(err, results) {
            if (err) {
                return cb(err);
            }
            if (results.length > 0) {
                return cb();
            }

            conn.query(sql2, [rsc, 0, '["fs:*"]', 'allow'], function(err) {
                return cb(err);
            });
        });
    }, function(err) {
        logger.info('[acl] createSystemFSPolicy end.', err);
        return callback(err);
    });*/
};

exports.updatePolicyRsc = function (src, dst, callback) {
    policyDao.updatePolicyResource({src: src, dest: dst}, callback);
    // TODO rsccheck update

    /*var sql;
    async.waterfall([
        function (next) {
            sql = 'UPDATE webida_policy SET resource=REPLACE(resource, \'' + src + '\', \'' + dst + '\');';
            conn.query(sql, function (err, results) {
                if (err) {
                    return next(new ServerError(500, 'Server internal error while updating resource.'));
                } else {
                    return next(null);
                }
            });
        }, function (next) {
            sql = 'UPDATE webida_rsccheck SET rsc=REPLACE(rsc, \'' + src + '\', \'' + dst + '\');';
            conn.query(sql, function (err, results) {
                if (err) {
                    return next(new ServerError(500, 'Server internal error while updating resource.'));
                } else {
                    return next(null);
                }
            });
        }
    ], function(err) {
        return callback(err);
    });*/
};

exports.isGroupOwner = function(uid, gid, callback, context) {
    groupDao.getOwnerUidByGid({gid: gid}, function(err, group) {
        if (err) {
            callback(err);
        } else if (!group) {
            callback(new ClientError('Unknown group: ' + gid));
        } else if (uid === group.ownerUid) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    }, context);
   /* var sql = 'SELECT owner from webida_group where gid=?';
    conn.query(sql, [gid], function(err, result) {
        if (err) {
            return callback(new ServerError('Group owner check failed.'));
        } else if (result.length === 0) {
            return callback(new ClientError(400, 'Unknown group'));
        } else if (uid === result[0].owner) {
            return callback(null, true);
        } else {
            return callback(null, false);
        }
    });*/
};

exports.isGroupOwnerOrMember = function(uid, gid, callback) {
    exports.isGroupOwner(uid, gid, function(err, result) {
        if (err) {
            return callback(err);
        } else if (result) {
            return callback(null, true);
        } else {
            groupDao.countRelationWithUserByGidAndUid({gid: gid, uid: uid}, function(err, count) {
               if (err) {
                   return callback(err);
               } else {
                   return callback(null, (count > 0) ? true : false);
               }
            });
        }
    });

    /*async.waterfall([
        function (next) {
            exports.isGroupOwner(uid, gid, function(err, result) {
                if (err) {
                    return callback(err);
                } else if (result) {
                    return callback(null, true);
                } else {
                    return next(null);
                }
            });
        }, function (next) {
            var sql = 'SELECT * from webida_groupuser where gid=? AND uid=?';
            conn.query(sql, [gid, uid], function(err, result) {
                if (err) {
                    return callback(new ServerError('Group member check failed.'));
                } else if (result.length === 0) {
                    return callback(null, false);
                } else {
                    return callback(null, true);
                }
            });
        }
    ]);*/
};

exports.isPolicyOwner = function(uid, pid, callback, context) {
    policyDao.getOwnerUidByPolicyId({policyId: pid}, function(err, policy) {
        if (err) {
            callback(err);
        } else if (!policy) {
            callback(new ClientError('Unknown policy: ' + pid));
        } else if (uid === policy.ownerUid) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    }, context);
    /*var sql = 'SELECT owner from webida_policy where pid=?';
    conn.query(sql, [pid], function(err, result) {
        if (err) {
            return callback(err);
        } else if (result.length === 0) {
            return callback(new ClientError(400, 'Unknown user'));
        } else if (uid === result[0].owner) {
            return callback(null, true);
        } else {
            return callback(null, false);
        }
    });*/
};

exports.isPoliciesOwner = function(uid, pidArr, callback) {
    async.eachSeries(pidArr, function(pid, cb) {
        exports.isPolicyOwner(uid, pid, function(err, result) {
            if (err) {
                return callback(err);
            } else if (result) {
                return cb(null);
            } else {
                return callback(null, false);
            }
        });
    }, function() {
        return callback(null, true);
    });
};

exports.signupUser = function(email, key, sendEmail, callback) {
    var transaction = new Transaction([
        function (context, next) {
            var authinfo = {email: email, password: key, activationKey: key};
            exports.findOrAddUser(authinfo, function (err/*, result*/) {
                return next(err);
            }, context);
        },
        function (context, next) {
            var redirect = config.services.auth.signup.activatingURL + key;
            var emailBody = '<b>Welcome to Webida!!</b>' +
                'This is the sign up validation email to webida.org of ' + email + ',' +
                'Please click belows.<br><br>' +
                '<a href="' + redirect + '">' + redirect + '</a>';

            var mailOptions = {
                from: config.services.auth.signup.emailSender,
                to: email,
                subject: 'Email validation check for webida.org signup',
                html: emailBody
            };

            sendEmail(mailOptions, function (err/*, data*/) {
                if (err) {
                    return next(err);
                }
                return next();
            });
        }
    ]);
    transaction.start(callback);
    /*sqlConn.beginTransaction(function (err) {
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
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function() {
                                return res.sendfail('deleteAccount failed(server internal error)');
                            });
                        }

                        return res.sendok();
                    });
                }
            });
    });*/
};

exports.activateAccount = function(password, activationKey, callback) {
    if (password.length < 6) {
        return callback('password length must be longer than 5 chareacters.');
    }
    new Transaction([
        userDao.$findOne({activationKey: activationKey}),
        function(context, next) {
            var user = context.getData(0);
            if (user) {
                exports.updateUser({userId:user.userId}, {password: password, status: STATUS.APPROVED},
                    function (err, result) {
                    if (err || !result) {
                        return next(new ServerError(503, 'Activating failed'));
                    }

                    user = result;
                    return next();
                });
                next();
            } else {
                next('Unknown user activationKey: ' + activationKey);
            }
        },
        function(context, next) {
            var user = context.getData(0);
            exports.createDefaultPolicy(user, function(err) {
                next(err);
            }, context);
        }
    ]).start(callback);

    /*async.waterfall([
        function(next) {
            if (password.length < 6) {
                return next('password length must be longer than 5 chareacters.');
            }
            return next(null);
        }, function(next) {
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
        }, function(uid, next) {
            userdb.updateUser({uid:uid}, {password: password, status: userdb.STATUS.APPROVED}, function (err, result) {
                if (err || !result) {
                    return next(new ServerError(503, 'Activating failed'));
                }

                user = result;
                return next(null);
            });
        }, function(next) {
            return createDefaultPolicy(user, next);
        }
    ], function(err) {
        if (err || !user) {
            callback(err);
        } else {
            sqlConn.commit(function (err) {
                if (err) {
                    sqlConn.rollback(function() {
                        return res.sendfail('activateAccount failed(server internal error)');
                    });
                }

                req.session.opener = config.services.auth.signup.webidaSite;
                loginHandler(req, res)(null, user);
            });
        }
    });*/
};

exports.createDefaultPolicy = function (user, callback, context) {
    var token;
    async.waterfall([
        function(next) {
            exports.getPersonalTokens(100000, function(err, result) {
                if (err) {
                    return next(err);
                }
                if (result.length === 0) {
                    return next(new ServerError(500, 'Creating default policy failed'));
                }
                token = result[0].data;
                return next(null);
            }, context);
        }, function(next) {
            exports.createPolicy(user.uid, config.services.auth.defaultAuthPolicy, token, function(err, policy) {
                if (err) {
                    return next(new ServerError(500, 'Set default auth policy failed'));
                }
                return next(null, policy.pid);
            }, context);
        }, function(pid, next) {
            exports.assignPolicy({pid:pid, user:user.uid}, function(err) {
                if (err) {
                    return next(new ServerError(500, 'Assign default auth policy failed'));
                }
                return next(null);
            }, context);
        }, function(next) {
            exports.createPolicy(user.uid, config.services.auth.defaultAppPolicy, token, function(err, policy) {
                if (err) {
                    return next(new ServerError(500, 'Set default app policy failed'));
                }
                return next(null, policy.pid);
            }, context);
        }, function(pid, next) {
            exports.assignPolicy({pid:pid, user:user.uid}, function(err) {
                if (err) {
                    return next(new ServerError(500, 'Assign default app policy failed'));
                }
                return next(null);
            }, context);
        }, function(next) {
            exports.createPolicy(user.uid, config.services.auth.defaultFSSvcPolicy, token, function(err, policy) {
                if (err) {
                    return next(new ServerError(500, 'Set default fssvc policy failed'));
                }
                return next(null, policy.pid);
            }, context);
        }, function(pid, next) {
            exports.assignPolicy({pid:pid, user:user.uid}, function(err) {
                if (err) {
                    return next(new ServerError(500, 'Assign default fssvc policy failed'));
                }
                return next(null);
            }, context);
        }
    ], function(err) {
        return callback(err);
    });
}