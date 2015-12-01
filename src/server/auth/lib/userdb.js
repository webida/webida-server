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
var async = require('async');
var Path = require('path');

var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var authMgr = require('../../common/auth-manager');
var config = require('../../common/conf-manager').conf;

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

var ntf = null;

// TODO implement 'expireAfterSeconds' feature on Mysql DB

var shortid = require('shortid');
var db = require('../../common/db-manager')('sequence', 'user', 'group', 'client', 'code', 'token', 'tempKey',
    'policy', 'system');
var dao = db.dao;

var emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
var integerPattern = /^[0-9]+$/;
var STATUS = Object.freeze({PENDING: 0, APPROVED: 1, REJECTED: 2, PASSWORDRESET: 3});
var ACTIONS_TO_NOTI = ['fs:*', 'fs:list', 'fs:readFile', 'fs:writeFile', 'fs:getMeta'];

exports.STATUS = STATUS;
exports.start = function (svc, ntfMgr) {
    ntf = ntfMgr;
};

function notifyTopics(policy, trigger, sessionID) {
    var data;
    var msg;
    var topics;

    if (!sessionID) {
        return;
    }

    data = {
        eventType: 'acl.changed',
        trigger: trigger,
        policy: policy,
        sessionID: sessionID
    };
    msg = {
        topic: 'reserved',
        eventType: 'acl.change',
        data: data
    };
    topics = [];
    policy.resource.forEach(function (rsc) {
        var arr = rsc.substr(3).split('/');
        if (rsc.search('fs:') !== 0) {
            return;
        }

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

exports.createGuestSequence = function (callback) {
    db.transaction([
        dao.sequence.updateSequence({space: 'guestid'}),
        function (context, next) {
            dao.sequence.getSequence({space: 'guestid'}, function (err, context) {
                if (err) {
                    return next(err);
                } else {
                    var result = context.result();
                    if (result[0].seq > result[0].maxSeq) {
                        return next('guest id sequence reached to limit.');
                    } else {
                        context.data('seq', result[0].seq);
                        return next(null);
                    }
                }
            }, context);
        }
    ], function (err, context) {
        if (err) {
            logger.error(err);
        }
        callback(err, context.data('seq'));
    });
};

function createSubject(type, callback) {
    db.transaction([
        dao.sequence.updateSequence({space: 'uid'}),
        function (context, next) {
            dao.sequence.getSequence({space: 'uid'}, function (err, context) {
                var result = context.result();
                if (err) {
                    return next(err);
                } else {
                    if (result[0].seq > result[0].maxSeq) {
                        return next('User account reached the max limit.');
                    } else {
                        context.data('seq', result[0].seq);
                        return next(null);
                    }
                }
            }, context);
        }, function (context, next) {
            var uid = context.data('seq');
            var subjectId = shortid.generate();
            context.data('subjectId', subjectId);
            dao.user.addSubject({subjectId: subjectId, type: type, uid: uid}, function (err) {
                next(err);
            }, context);
        }
    ], function (err, context) {
        callback(err, {subjectId: context.data('subjectId'), seq: context.data('seq')});
    });
}

exports.addClient = function (client, callback) {
    client.clientId = shortid.generate();

    dao.client.$save(client, function (err) {
        if (err) {
            callback(err);
        } else {
            dao.client.$findOne({clientId: client.clientId}, callback);
        }
    });
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
    exports.findClientByClientID(client.clientID, function (err, result) {
        if (err) {
            callback(err);
        } else if (result) {
            dao.client.$update({oauthClientId: client.clientID, $set: updateClient}, callback);
        } else {
            updateClient.oauthClientId = client.clientID;
            exports.addClient(updateClient, callback);
        }
    });
};

exports.findClientByClientID = function (oauthClientId, callback) {
    dao.client.$findOne({oauthClientId: oauthClientId}, function (err, context) {
        callback(err, context.result());
    });
};

exports.addNewCode = function (code, clientID, redirectURI, uid, callback) {
    exports.findUserByUid(uid, function (err, user) {
        var msPeriod = config.services.auth.codeExpireTime * 1000;
        var expireTime = new Date(new Date().getTime() + msPeriod);
        if (err) {
            callback(err);
        } else if (!user) {
            callback('unknown user uid: ' + uid);
        } else {
            dao.code.$save({codeId: shortid.generate(), code: code, oauthClientId: clientID, redirectUrl: redirectURI,
                userId: user.userId, expireTime: expireTime}, function (err) {
                if (err) {
                    callback(err);
                } else {
                    exports.findCode(code, function (err, context) {
                        callback(err, context.result());
                    });
                }
            });
        }
    });
};

exports.findCode = function (code, callback) {
    dao.code.findValidCode({code: code, currentTime: new Date()}, function (err, context) {
        callback(err, context.result());
    });
};

exports.getTokenInfo = function (token, callback) {
    dao.token.findValidToken({token: token, currentTime: new Date()}, function (err, context) {
        var result;
        if (err) {
            callback(err);
        } else {
            result = context.result();
            if (result.length === 0) {
                callback();
            } else {
                callback(null, result[0]);
            }
        }
    });
};

exports.addNewToken = function (uid, clientID, token, callback) {
    exports.findUserByUid(uid, function (err, user) {
        var msPeriod = config.services.auth.tokenExpireTime * 1000;
        var expireTime = new Date(new Date().getTime() + msPeriod);
        if (err) {
            callback(err);
        } else if (!user) {
            callback('unknown user uid: ' + uid);
        } else {
            dao.token.$save({tokenId: shortid.generate(), token: token, oauthClientId: clientID, userId: user.userId,
                    expireTime: expireTime, validityPeriod: config.services.auth.tokenExpireTime},
                function (err) {
                if (err) {
                    callback(err);
                } else {
                    dao.token.$findOne({token: token}, function (err, context) {
                        callback(err, context.result());
                    });
                }
            });
        }
    });
};

exports.addNewPersonalToken = function (uid, token, callback) {
    exports.findUserByUid(uid, function (err, user) {
        if (err) {
            callback(err);
        } else if (!user) {
            callback('unknown user uid: ' + uid);
        } else {
            dao.token.$save({tokenId: shortid.generate(), token: token, oauthClientId: 'any_' + token,
                userId: user.userId, validityPeriod: 0/* 0:INFINITE */}, function (err) {
                    if (err) {
                        callback(err);
                    } else {
                        dao.token.$findOne({token: token}, function (err, context) {
                            callback(err, context.result());
                        });
                    }
                });
        }
    });
};

exports.deletePersonalToken = function (uid, token, callback) {
    dao.token.$findOne({token: token}, function (err, context) {
        var info = context.result();
        if (err) {
            callback(err);
        } else if (!info) {
            callback(new ClientError('Token not exist.'));
        } else {
            dao.user.$findOne({userId: info.userId}, function (err, context) {
                var user = context.result();
                if (err) {
                    callback('Unknown user: ' + info.userId);
                } else {
                    if (user.uid !== uid) {
                        callback(new ClientError(401, 'Unauthorized access.'));
                    } else {
                        dao.token.$remove({tokenId: info.tokenId}, function (err, context) {
                            callback(err, context.result());
                        });
                    }
                }
            });
        }
    });
};

exports.deleteAllPersonalTokens = function (uid, callback) {
    dao.token.deletePersonalTokensByUid({uid: uid}, function (err, context) {
        callback(err, context.result());
    });
    //d.tokens.remove({uid: uid, expireTime: 'INFINITE'}, callback);
};

exports.getPersonalTokens = function (uid, callback, context) {
    dao.token.getPersonalTokensByUid({uid: uid}, function (err, context) {
        var tokens = context.result();
        if (err) {
            return callback(err);
        }
        callback(null, tokens.map(function (token) {
            return {
                issueTime: token.created,
                data: token.token
            };
        }));
    }, context);
};

exports.verifyToken = function (req, res, next) {
    /* jshint camelcase: false */
    var token = req.headers.authorization || url.parse(req.url, true).query.access_token;
    /* jshint camelcase: true */
    if (!token) {
        req.user = null;
        return next();
    }

    logger.info('verifyToken', token);
    exports.getTokenInfo(token, function (err, info) {
        if (err) {
            return res.status(500).send(utils.fail(err));
        } else if (!info) {
            return res.status(419).send(utils.fail('Token is expired.'));
        } else {
            dao.user.$findOne({userId: info.userId}, function (err, context) {
                var user;
                if (err) {
                    return res.status(500).send(utils.fail(err));
                } else if (!context.result()) {
                    return res.status(400).send(utils.fail('user not found: ' + info.userId));
                } else {
                    user = context.result();
                    console.log('login user: ', user);
                    req.user = user;
                    req.user.token = token;
                    return next();
                }
            });
        }
    });
};

exports.createServerConf = function (callback) {
    dao.sequence.$findOne({space: 'uid'}, function (err, context) {
        var sequence = context.result();
        if (err) {
            callback(err);
        } else if (!sequence) {
            dao.sequence.$save({space: 'uid', currentSeq: config.services.auth.baseUID,
                    maxSeq: config.services.auth.maxUID}, callback);
        } else {
            dao.sequence.$update({space: 'uid', $set: {
                currentSeq: config.services.auth.baseUID, maxSeq: config.services.auth.maxUID}}, callback);
        }
    });

    dao.sequence.$findOne({space: 'guestid'}, function (err, context) {
        var sequence = context.result();
        if (err) {
            callback(err);
        } else if (!sequence) {
            dao.sequence.$save({space: 'guestid', currentSeq:0, maxSeq: 4000000000});
        } else {
            dao.sequence.$update({space: 'guestid',
                $set: {space: 'guestid', currentSeq:0, maxSeq: 4000000000}}, callback);
        }
    });
};

exports.checkSystemApp = function (clientID, callback) {
    dao.client.$findOne({oauthClientId: clientID}, function (err, context) {
        var client = context.result();
        if (err || !client) {
            return callback(new Error('Check system app failed(' + clientID + ')'));
        } else {
            return callback(null, (client.isSystem === 1));
        }
    });
};

exports.close = function (/*callback*/) {
    //d.close();
};

exports.addTempKey = function (uid, key, callback) {
    exports.findUserByUid(uid, function (err, user) {
        if (err) {
            callback(err);
        } else if (!user) {
            callback('unknown user uid: ' + uid);
        } else {
            dao.tempKey.upsertTempKey({keyId: shortid.generate(), userId: user.userId, key: key}, callback);
        }
    });
};

exports.findTempKey = function (field, callback) {
    dao.tempKey.$findOne(field, function (err, context) {
        callback(err, context.result());
    });
};

exports.removeTempKey = function (field, callback) {
    dao.tempKey.$remove(field, function (err, context) {
        callback(err, context.result());
    });
};

//==========================================================
// acldb using mysql
exports.createPolicy = function (uid, policy, token, callback, context) {
    async.waterfall([
        function (next) {
            var gid;
            var pid;
            var fsid;
            var prefix;
            var aclInfo;
            // check resource (fs, auth, app, acl, group)
            async.each(policy.resource, function (rsc, cb) {
                prefix = rsc.split(':')[0];
                if (!prefix) {
                    return callback(new ClientError('Service prefix of resource ' + rsc + ' is invalid.'));
                }

                if (prefix === 'fs') { // fs resource check
                    fsid = rsc.substr(3).split('/')[0];
                    authMgr.getFSInfo(fsid, token, function (err/*, info*/) {
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
                    pid = rsc.split(':')[1];
                    if (!pid) {
                        return callback(new ClientError('Invalid policy id'));
                    }

                    exports.isPolicyOwner(uid, pid, function (err, result) {
                        if (err) {
                            return callback(err);
                        } else if (result) {
                            return cb();
                        } else {
                            rsc = 'acl:' + pid;
                            aclInfo = {uid: uid, action: 'acl:createPolicy', rsc: rsc};
                            exports.checkAuthorize(aclInfo, function (err, result) {
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
                    gid = rsc.split(':')[1];
                    if (!gid) {
                        return callback(new ClientError('Invalid group id'));
                    }
                    exports.isGroupOwner(uid, gid, function (err, result) {
                        var rsc;
                        var aclInfo;
                        if (err) {
                            return callback(err);
                        } else if (result) {
                            return cb();
                        } else {
                            rsc = 'group:' + gid;
                            aclInfo = {uid: uid, action: 'group:createGroup', rsc: rsc};
                            exports.checkAuthorize(aclInfo, function (err, result) {
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
            }, function (err) {
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

            exports.findUserByUid(uid, function (err, user) {
                if (err) {
                    logger.error('createPolicy error', err);
                    return next(new ServerError('Internal server error while creating policy'));
                } else if (!user) {
                    logger.error('createPolicy error: user not found: ' + uid);
                    return next(new ServerError('Internal server error while creating policy'));
                } else {
                    dao.policy.$save({pid: pid, name: policy.name, effect: policy.effect, ownerId: user.userId,
                        action: JSON.stringify(policy.action), resource: JSON.stringify(policy.resource)},
                        function (err) {
                            if (err) {
                                return next(new ServerError('Internal server error while creating policy'));
                            } else {
                                dao.policy.$findOne({pid: pid}, function (err, context) {
                                    var result = context.result();
                                    if (err) {
                                        return next(err);
                                    } else {
                                        result.action = JSON.parse(result.action);
                                        result.resource = JSON.parse(result.resource);
                                        return next(null, result);
                                    }
                                }, context);
                            }
                        },
                    context);
                }
            }, context);
        }
    ], callback);
};

exports.createPolicies = function (uid, policies, token, callback) {
    var results = [];
    db.transaction([
        function (context, next) {
            logger.info('[acl] createPolicies', policies);
            async.eachSeries(policies, function (policy, cb) {
                exports.createPolicy(uid, policy, token, function (err, result) {
                    if (err) {
                        logger.error('[acl] createPolicies error: ', err);
                        return cb(err);
                    } else {
                        results.push(result);
                        return cb();
                    }
                }, context);
            }, next);
        }
    ], function (err) {
        callback(err, results);
    });
};

exports.deletePolicy = function (pid, callback) {
    //var sql;
    var policy;
    var ids = null;

    logger.info('[acl] deletePolicy', pid);

    db.transaction([
        dao.policy.getUidsByPolicyId({pid: pid}),
        function (context, next) {
            ids = context.result();
            if (ids.length > 0) {
                dao.policy.deleteRelationWithUserByPolicyId({pid: pid}, next, context);
            } else {
                next();
            }
        },   // TODO rsccheck
        dao.policy.$findOne({pid: pid}),
        function (context, next) {
            policy = context.result();
            if (!policy) {
                return next(new ClientError(404, 'No such policy.'));
            } else {
                policy.resource = JSON.parse(policy.resource);
                dao.policy.$remove({pid: pid}, next, context);
            }
        }
    ], callback);
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

    db.transaction([
        dao.policy.$findOne({pid: pid}),
        function (context, next) {
            var policy = context.result();
            if (policy) {
                isNotiNeed = _.intersection(JSON.parse(policy.action), ACTIONS_TO_NOTI).length > 0;
                next();
            } else {
                next(new ClientError('Unknown policy id: ' + pid));
            }
        },
        dao.policy.getUidsByPolicyId({pid: pid}),
        function (context, next) {
            var relation = context.result();
            if (relation) {
                ids = relation;
            }
            next();
        },
        function (context, next) {
            if (!isUpdateNeed || !ids) {
                next();
            } else {
                async.each(ids, function (value, cb) {
                    exports.removePolicy({pid: pid, user: value.uid}, cb, context);
                }, function (err) {
                    return next(err);
                });
            }
        },
        dao.policy.$update({pid: pid, $set: fields}),
        function (context, next) {
            if (!isUpdateNeed || !ids) {
                next();
            }
            async.each(ids, function (value, cb) {
                exports.assignPolicy({pid: pid, user: value.uid}, cb, context);
            }, function (err) {
                return next(err);
            });
        }
    ], function (err) {
        if (err) {
            return callback(err);
        }
        dao.policy.$findOne({pid: pid}, function (err, context) {
            var policy = context.result();
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
};

// info:{pid, user, sessionID}
exports.assignPolicy = function (info, callback, context) {
    async.waterfall([
        function (next) {
            dao.policy.getRelation({pid: info.pid, uid: info.user}, function (err, context) {
                var relation = context.result();
                if (err) {
                    next(err);
                } else if (!relation || relation.length === 0) {
                    next();
                } else {
                    next('No need to add relation');
                }
            }, context);
        }, function (next) {
            dao.policy.addRelation({pid: info.pid, uid: info.user}, next, context);
        }, function (result, next) {
            dao.policy.$findOne({pid: info.pid}, function (err, context) {
                var policy = context.result();
                if (err) {
                    next(err);
                } else if (policy && info.sessionID) {
                    policy.resource = JSON.parse(policy.resource);
                    policy.action = JSON.parse(policy.action);
                    notifyTopics(policy, 'assignPolicy', info.sessionID);
                }
                //TODO rsccheck
                next();
            }, context);
        }
    ], function (err) {
        if (err && err !== 'No need to add relation') {
            callback(err);
        } else {
            callback();
        }
    });
};

exports.assignPolicies = function (info, callback) {
    var uidArr;
    var pidArr;
    if (info.user) {
        uidArr = info.user.split(';');
    }
    if (info.pid) {
        pidArr = info.pid.split(';');
    }
    db.transaction([
        function (context, next) {
            logger.info('[acl] assignPolicies', info);
            async.eachSeries(pidArr, function (pid, cb) {
                async.eachSeries(uidArr, function (user, cb2) {
                    exports.assignPolicy({
                        pid: pid,
                        user: user,
                        sessionID: info.sessionID
                    }, function (err) {
                        if (err) {
                            logger.error('[acl] assignPolicy failed for user: ' + user, err);
                            return cb2(new ServerError('[acl] assignPolicy failed for user: ' + user));
                        } else {
                            return cb2(null);
                        }
                    }, context);
                }, cb);
            }, next);
        }
    ], callback);
};

// info:{pid, user, sessionID}
exports.removePolicy = function (info, callback) {
    logger.info('[acl] removePolicy for ', info.pid, info.user);

    db.transaction([
        dao.policy.deleteRelation({pid: info.pid, uid: info.user}),
        dao.policy.$findOne({pid: info.pid}),
        function (context, next) {
            context.data('policy', context.result());
            // TODO caching
            next();
        },
        function (context, next) {
            var policy = context.data('policy');
            if (info.sessionID && policy) {
                policy.action = JSON.parse(policy.action);
                policy.resource = JSON.parse(policy.resource);
                notifyTopics(policy, 'removePolicy', info.sessionID);
            }
            next();
        }
    ], callback);
};

exports.getAssignedUser = function (pid, type, callback) {

    var queryFn = (type === 'u') ? dao.user.getAllUsersByPolicyId : dao.group.getAllGroupsByPolicyId;

    queryFn({pid: pid}, function (err, context) {
        var usersOrGroups = context.result();
        logger.info('getAssigned: ', type, pid, usersOrGroups);
        callback(err, usersOrGroups);
    });
};

exports.getAuthorizedUser = function (action, rsc, type, callback) {
    var index;
    var resourceRegex;
    var actionPrefix;
    var users = [];
    var actionSplited = action.split(':');
    var patterns = [rsc];
    actionPrefix = (actionSplited[1] !== '*') ? actionSplited[0] : undefined;
    while ((index = rsc.lastIndexOf('/')) > -1) {
        rsc = rsc.slice(0, index);
        patterns.push(rsc + '\\\\*');
    }
    resourceRegex = patterns.join('|');

    dao.policy.getPolicyIdsByActionAndResource({action: action, actionPrefix: actionPrefix,
        resourceRegex: resourceRegex}, function (err, context) {
        var pids = context.result();
        if (err) {
            return callback(err);
        }

        async.eachSeries(pids, function (value, cb) {
            exports.getAssignedUser(value.pid, type, function (err, results) {
                if (err) {
                    return cb(err);
                }

                users = users.concat(results);
                return cb();
            });
        }, function (err) {
            var ret = [];
            var i;
            if (err) {
                logger.info('[acl] getAuthorizedUser failed', err);
                return callback(err);
            }

            // filtering as unique value
            for (i = 0; i < users.length; i++) {
                if (ret.indexOf(users[i]) === -1) {
                    ret.push(users[i]);
                }
            }
            return callback(null, ret);
        });
    });

};

exports.getAuthorizedRsc = function (uid, action, callback) {
    var actionSplited = action.split(':');
    var actionPrefix = (actionSplited[1] !== '*') ? actionSplited[0] : undefined;

    logger.info('getAuthorizedRsc', uid, action);

    async.waterfall([
        function (next) {
            var subjectIds = [];
            dao.user.$findOne({uid: uid}, function (err, context) {
                var user = context.result();
                if (err) {
                    next(err);
                } else {
                    subjectIds.push(user.userId);
                    dao.group.getAllGroupIdByUserId({userId: user.userId}, function (err, context) {
                        var groups = context.result();
                        var groupIds;
                        if (err) {
                            next(err);
                        } else {
                            groupIds = groups.map(function (group) {
                                return group.groupId;
                            });
                            subjectIds = subjectIds.concat(groupIds);
                            next(null, subjectIds);
                        }
                    });
                }
            });
        }, function (subjectIds, next) {
            dao.policy.getResourcesByUidAndAction({subjectIds: subjectIds, action: action, actionPrefix: actionPrefix},
                function (err, context) {
                    var resources = context.result();
                    var result = [];
                    if (err) {
                        next(err);
                    } else {
                        _.forEach(resources, function (r) {
                            var resourceArr = JSON.parse(r.resource);
                            result = result.concat(resourceArr);
                        });
                        next(null, result);
                    }
                });
        }
    ], callback);

};

exports.getAssignedPolicy = function (id, callback) {
    logger.info('[acl] getAssignedPolicy', id);
    dao.policy.getPolicyByUid({uid: id}, function (err, context) {
        var result;
        var policies = context.result();
        logger.info('policies', policies);
        if (err) {
            callback(err);
        } else {
            result = policies.map(function (policy) {
                if (policy.hasOwnProperty('action')) {
                    policy.action = JSON.parse(policy.action);
                }
                if (policy.hasOwnProperty('resource')) {
                    policy.resource = JSON.parse(policy.resource);
                }
                return policy;
            });
            callback(null, result);
        }
    });
};

exports.getOwnedPolicy = function (id, callback) {
    logger.info('[acl] getOwnedPolicy', id);

    dao.policy.getPolicyByOwnerUid({uid: id}, function (err, context) {
        callback(err, context.result());
    });
};

exports.getPolicies = function (pidArr, callback) {

    dao.policy.getPolicyByPolicyIds({policyIds: pidArr}, function (err, context) {
        var policies = context.result();
        var result;
        if (err) {
            callback(err);
        } else {
            result = policies.map(function (policy) {
                if (policy.hasOwnProperty('action')) {
                    policy.action = JSON.parse(policy.action);
                }
                if (policy.hasOwnProperty('resource')) {
                    policy.resource = JSON.parse(policy.resource);
                }
                return policy;
            });
            callback(null, result);
        }
    });
};

//==========================================================
// groupdb using mysql
exports.createGroup = function (group, callback) {
    async.waterfall([
        function (next) {
            dao.group.getGroup(group, function (err, context) {
                var result = context.result();
                if (err) {
                    return next(err);
                }
                if (result.length > 0) {
                    return next(new ClientError('The group is already exist.'));
                } else {
                    return next(null);
                }
            });
        }, function (next) {
            createSubject('g', next);
        }, function (result, next) {
            group.groupId = result.subjectId;
            group.gid = result.seq;

            dao.group.addGroup(group, function (err) {
                if (err) {
                    return next(err);
                }
                dao.group.$findOne({groupId: group.groupId}, function (err, context) {
                    return next(err, context.result());
                });
            });
        }
    ], callback);
};

exports.deleteGroup = function (gid, callback) {
    var groupId;
    db.transaction([
        dao.group.$findOne({gid: gid}),
        function (context, next) {
            var group = context.result();
            if (group) {
                groupId = group.groupId;
                next();
            } else {
                next(new ClientError('Unkown group: ' + gid));
            }
        },
        function (context, next) {
            dao.group.deleteRelationWithPolicyByGroupId({groupId: groupId}, next, context);
        },
        function (context, next) {
            dao.group.deleteRelationWithUserByGroupId({groupId: groupId}, next, context);
        },
        function (context, next) {
            dao.group.deleteSubjectByGroupId({groupId: groupId}, next, context);
        },
        function (context, next) {
            dao.group.$remove({groupId: groupId}, next, context);
        }
    ], callback);

};

exports.addUsersToGroup = function (uidArr, gid, callback) {
    if (uidArr.length === 0) {
        return callback(null);
    }

    dao.group.$findOne({gid: gid}, function (err, context) {
        var group = context.result();
        if (err) {
            callback(err);
        } else if (group) {
            dao.group.addUsersToGroup({groupId: group.groupId, userIds: uidArr}, callback);
        } else {
            callback(new ClientError('Unknown group: ' + gid));
        }
    });
};

exports.removeUsersFromGroup = function (uidArr, gid, callback) {
    if (uidArr.length === 0) {
        return callback(true);
    }

    dao.group.$findOne({gid: gid}, function (err, context) {
        var group = context.result();
        if (err) {
            callback(err);
        } else if (group) {
            dao.group.removeUsersFromGroup({groupId: group.groupId, userIds: uidArr}, callback);
        } else {
            callback(new ClientError('Unknown group: ' + gid));
        }
    });
};


exports.getGroups = function (uid, callback) {
    dao.group.getAllGroupByOwnerUid({uid: uid}, function (err, context) {
        callback(err, context.result());
    });
};

exports.getAssignedGroups = function (uid, callback) {
    dao.group.getAllGroupByUid({uid: uid}, function (err, context) {
        callback(err, context.result());
    });
};

exports.getGroupMembers = function (gid, callback) {
    dao.user.getAllUserByGid({gid: gid}, function (err, context) {
        callback(err, context.result());
    });
};

exports.setGroupMembers = function (gid, uidArr, callback) {
    dao.group.$findOne({gid: gid}, function (err, context) {
        var group = context.result();
        if (err) {
            callback(err);
        } else if (group) {
            dao.group.deleteRelationWithUserByGroupId({groupId: group.groupId}, function (err) {
                if (err) {
                    callback(err);
                } else {
                    exports.addUsersToGroup(uidArr, gid, callback);
                }
            });
        } else {
            callback(new ClientError('Unknown group: ' + gid));
        }
    });
};

exports.getAllGroups = function (callback) {
    dao.group.$find({}, function (err, context) {
        callback(err, context.result());
    });
};

exports.UPDATABLE_GROUPINFO = ['name', 'userdata'];
exports.updateGroup = function (gid, groupInfo, callback) {
    db.transaction([
        dao.group.$findOne({gid: gid}),
        function (context, next) {
            var group = context.result();
            if (group) {
                if (groupInfo.hasOwnProperty('name')) {
                    dao.group.$findOne({name: groupInfo.name, ownerId: group.ownerId}, function (err, context) {
                        var result = context.result();
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
        dao.group.$update({gid: gid, $set: groupInfo})
    ], function (err) {
        if (err) {
            callback(err);
        }
        dao.group.$findOne({gid: gid}, function (err, context) {
            callback(err, context.result());
        });
    });
};

//==========================================================
// userdb using mysql

exports.findUserByUid = function (uid, callback, context) {
    dao.user.$findOne({uid: uid}, function (err, context) {
        if (err) {
            callback(err);
        } else {
            callback(null, context.result());
        }
    }, context);
};

exports.findUserByEmail = function (email, callback) {
    dao.user.$findOne({email: email}, function (err, context) {
        if (err) {
            callback(err);
        } else {
            callback(null, context.result());
        }
    });
};

exports.FINDABLE_USERINFO = ['userId', 'uid', 'email', 'name', 'company', 'telephone', 'department', 'url', 'location',
        'gravatar', 'activationKey', 'status', 'isAdmin'];
exports.findUser = function (info, callback, context) {
    var invalidate;
    // check integer fields validity
    ['uid', 'status', 'isAdmin'].every(function (field) {
        if (info[field] !== undefined && !integerPattern.test(info[field])) {
            invalidate = 'Invalid ' + field + ' format';
            return false;
        }
        return true;
    });
    if (invalidate) {
        return callback(new ClientError(400, invalidate));
    }
    info = _.pick(info, exports.FINDABLE_USERINFO);
    dao.user.findUsers(info, function (err, context) {
        callback(err, context.result());
    }, context);
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

    if (!emailPattern.test(authinfo.email)) {
        return callback('Invalid email address format');
    }

    if (!authinfo.password) {
        return callback('Password is required');
    }

    dao.user.$findOne({email: authinfo.email}, function (err, context) {
        var user = context.result();
        if (err) {
            logger.info(err);
            callback(err);
        } else if (user) {
            if (user.status === STATUS.PENDING) {
                logger.info('found a PENDING user. update activation key', authinfo.email);
                exports.updateUserActivationKey(user.uid, authinfo.activationKey, callback, context);
            } else {
                logger.info('Found user', user);
                return callback('Email ' + authinfo.email + ' is already used.');
            }
        } else {
            logger.info('cannot find user. add it', authinfo.email);
            exports.addUser(authinfo, callback, context);
        }
    }, context);
};

exports.updateUserActivationKey = function (uid, activationKey, callback, context) {
    dao.user.$update({uid: uid, $set: {activationKey: activationKey}}, function (err) {
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
            }, context);
        }
    }, context);
};

// authinfo : {email, password, name, company, telephone, department, activationKey}
exports.addUser = function (authinfo, callback) {
    createSubject('u', function (err, result) {
        if (err) {
            return callback(err);
        } else {
            authinfo.userId = result.subjectId;
            authinfo.passwordDigest = utils.getSha256Digest(authinfo.password);
            authinfo.uid = result.seq;
            authinfo.status = authinfo.status || STATUS.PENDING;
            authinfo.isAdmin = authinfo.isAdmin || 0;

            dao.user.addUser(authinfo, function (err) {
                if (err) {
                    return callback(err);
                }
                logger.debug('added user - now should find by uid ' + result.seq); 
                return exports.findUserByUid(result.seq, callback);
            });
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
            fields.password = utils.getSha256Digest(fields.password);
            //delete fields.password;

            if (users[0].status === STATUS.PASSWORDRESET) {
                fields.status = STATUS.APPROVED;
            }
        }
        logger.debug('updateUser', users[0].email, fields);

        dao.user.$update({uid: users[0].uid, $set: fields}, function (err) {
            if (err) { return callback(err); }

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
    }, context);
};

exports.getAllUsers = function (callback) {
    function date(timestamp) {
        return dateformat(new Date(timestamp), 'yyyy-mm-dd HH:MM:ss Z');
    }
    exports.getSessions(function (err, sessions) {
        var sessMap = {};
        if (err) { throw err; }
        sessions.forEach(function (session) {
            var sessObj = JSON.parse(session.session);
            if (sessObj.passport && sessObj.passport.user) {
                sessMap[sessObj.passport.user] = sessObj;
            }
        });

        dao.user.$find({}, function (err, context) {
            var users = context.result();
            var result = {};
            if (users.length <= 0) {
                return callback(null, []);
            }

            users.forEach(function (user) {
                logger.debug('session user: ', user, sessMap[user.email]);
                if (user.lastLoginTimestampUTC) {   // FIXME ???
                    user.lastLoginStr = date(user.lastLoginTimestampUTC);
                }
                result[user.email] = user;
            });
            return callback(err, result);
        });
    });
};

exports.deleteUser = function (uid, callback) {

    dao.user.$findOne({uid: uid}, function (err, context) {
        var user = context.result();
        var userId;

        if (err) {
            callback(err);
        } else if (!user) {
            callback(new ClientError('Unknown user: ' + uid));
        } else {
            userId = user.userId;

            db.transaction([
                dao.policy.deleteRelationByOwnerId({ownerId: userId}),
                dao.policy.deletePolicyByOwnerId({ownerId: userId}),
                dao.policy.deleteRelationWithUserBySubjectId({subjectId: userId}),
                dao.group.deleteRelationWithUserByOwnerId({ownerId: userId}),
                dao.group.deleteGroupByOwnerId({ownerId: userId}),
                dao.group.deleteRelationWithUserByUserId({userId: userId}),
                dao.token.$remove({userId: userId}),
                dao.tempKey.$remove({userId: userId}),
                dao.user.$remove({userId: userId})
                // TODO rsccheck
            ], callback);
        }
    });
};

exports.setLastLogin = function (uid, callback) {
    dao.user.$update({uid: uid, $set: {lastLoginTime: new Date()}}, callback);
};

// aclInfo : {uid:int, action:string, rsc:string}
exports.checkAuthorize = function (aclInfo, callback) {
    // if uid === owner then return true;
    var rscArr;
    var idArr = ['0', '1'];

    function makeRscArr(rsc) {
        var rscArr = [
            '["' + rsc + '"]',
            '["' + rsc + '/*"]',
            '["' + Path.dirname(rsc) + '/+"]'    // FIXME ??
        ];
        var res = rsc.split(':');
        var prefix = res[0];
        var str = res[1];
        var index;
        if (str === '*') {
            return rscArr;
        }

        while (true) {
            index = str.lastIndexOf('/');
            if (index === -1) {
                break;
            }

            str = str.slice(0, index);
            rscArr.push('["' + prefix + ':' + str + '/*"]');
        }
        rscArr.push('["' + prefix + ':*"]');
        return rscArr;
    }

    rscArr = makeRscArr(aclInfo.rsc);

    async.waterfall([
        function (next) {
            if (aclInfo.uid === 0) {
                next(null, 0);
            } else {
                dao.user.$findOne({uid: aclInfo.uid}, function (err, context) {
                    var user = context.result();
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
        function (userId, next) {
            if (userId === 0) {
                next();
            } else {
                idArr.push(userId);
                dao.group.getAllGroupIdByUserId({userId: userId}, function (err, context) {
                    var groupIds = context.result();
                    if (err) {
                        next(new ServerError(500, 'Server error while check authorization.'));
                    } else {
                        idArr = idArr.concat(groupIds.map(function (group) {
                            return group.groupId;
                        }));
                        next();
                    }
                });
            }
        }, function (next) {
            var policy;
            var allowed = false;
            var daoRequest = {
                subjectIds : idArr,
                resources : rscArr
            };
            logger.debug('getPolicyBySubjectIdAndResources - policy dao request', daoRequest);
            dao.policy.getPolicyBySubjectIdsAndResources(daoRequest, 
                function (err, context) {
                    var i;
                    var result = context.result();
                    if (err) {
                        next(new ServerError(500, 'Server error while check authorization.'));
                    } else {
                        logger.debug('getPolicyBySubjectIdAndResources - result = ', result);
                        for (i = 0; i < result.length; i++) {
                            policy = result[i];
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
                }
            );
        }
    ], function (err) {
        if (err) {
            logger.info('[acl] checkAuthorize denied for ', aclInfo);
            return callback(err);
        } else {
            logger.info('[acl] checkAuthorize allowed for ', aclInfo);
            return callback(null);
        }
    });
};

exports.createSQLTable = function (callback) {
    logger.info('[acl] createSQLTable called.');

    db.transaction([
        dao.system.createUserTable(),
        dao.system.createTempKeyTable(),
        dao.system.createGroupTable(),
        dao.system.createGroupUserTable(),
        dao.system.createSubjectTable(),
        dao.system.createPolicyTable(),
        dao.system.createPolicySubjectTable(),
        dao.system.createSequenceTable(),
        dao.system.createClientTable(),
        dao.system.createCodeTable(),
        dao.system.createTokenTable(),
        function (context, next) {
            dao.user.$findOne({userId: '0'}, function (err, context) {
                var system = context.result();
                if (err) {
                    next(err);
                } else if (!system) {
                    dao.system.addSystemUser({}, function (err) {
                        if (err) {
                            next(err);
                        } else {
                            dao.system.addSystemSubject({}, function (err) {
                                next(err);
                            }, context);
                        }
                    }, context);
                } else {
                    next();
                }
            }, context);
        }
    ], callback);
};

exports.createSystemFSPolicy = function (callback) {
    logger.info('[acl] createSystemFSPolicy called.');
    async.each(config.services.auth.systemFS, function (rsc, cb) {
        //TODO caching
        var pid = shortid.generate();
        var systemPolicy = {
            pid: pid,
            name: 'systemFs',
            ownerId: '0',
            resource: '["' + rsc + '"]',
            action: '["fs:*"]',
            effect: 'allow'
        };

        db.transaction([
            dao.policy.$findOne(systemPolicy),
            function (context, next) {
                var result = context.result();
                if (!result) {
                    dao.policy.$save(systemPolicy, function (err) {
                        if (err) {
                            next(err);
                        } else {
                            dao.policy.addRelationBySubjectId({pid: pid, subjectId: '0'}, next, context);
                        }
                    }, context);
                } else {
                    next();
                }
            }
        ], function (err) {
            logger.info('[acl] createSystemFSPolicy end.', err);
            return cb(err);
        });
    }, function (err) {
        logger.info('[acl] createSystemFSPolicy end.', err);
        return callback(err);
    });
};

exports.updatePolicyRsc = function (src, dst, callback) {
    dao.policy.updatePolicyResource({src: src, dest: dst}, callback);
    // TODO cache update
};

exports.isGroupOwner = function (uid, gid, callback, context) {
    dao.group.getOwnerUidByGid({gid: gid}, function (err, context) {
        var group = context.result();
        if (err) {
            callback(err);
        } else if (!group || group.length === 0) {
            callback(new ClientError('Unknown group: ' + gid));
        } else if (uid === group[0].ownerUid) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    }, context);
};

exports.isGroupOwnerOrMember = function (uid, gid, callback) {
    exports.isGroupOwner(uid, gid, function (err, result) {
        if (err) {
            return callback(err);
        } else if (result) {
            return callback(null, true);
        } else {
            dao.group.countRelationWithUserByGidAndUid({gid: gid, uid: uid}, function (err, context) {
                var count = context.result();
                if (err) {
                    return callback(err);
                } else {
                    return callback(null, (count > 0));
                }
            });
        }
    });
};

exports.isPolicyOwner = function (uid, pid, callback, context) {
    dao.policy.getOwnerUidByPolicyId({pid: pid}, function (err, context) {
        var policy = context.result();
        if (err) {
            callback(err);
        } else if (!policy || policy.length === 0) {
            callback(new ClientError('Unknown policy: ' + pid));
        } else if (uid === policy[0].ownerUid) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    }, context);
};

exports.isPoliciesOwner = function (uid, pidArr, callback) {
    async.eachSeries(pidArr, function (pid, cb) {
        exports.isPolicyOwner(uid, pid, function (err, result) {
            if (err) {
                return callback(err);
            } else if (result) {
                return cb(null);
            } else {
                return callback(null, false);
            }
        });
    }, function () {
        return callback(null, true);
    });
};

exports.signupUser = function (email, key, sendEmail, callback) {
    db.transaction([
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
    ], callback);
};

exports.signup2 = function (authInfoArr, callback) {
    db.transaction([
        function (context, next) {
            async.eachSeries(authInfoArr, function (authInfo, cb) {
                if (authInfo.admin) {
                    authInfo.status = exports.STATUS.PASSWORDRESET;
                }

                if (!authInfo.password) {
                    authInfo.password = authInfo.email;
                }

                exports.findOrAddUser(authInfo, function (err, result) {
                    if (err) {
                        return cb('Failed to signup2 ' + err);
                    }

                    exports.createDefaultPolicy(result, function (err) {
                        if (err) {
                            return cb('Failed to signup2. ' + err);
                        }
                        return cb();
                    }, context);
                }, context);
            }, next);
        }
    ], function (err) {
        callback(err);
    });
};

exports.activateAccount = function (password, activationKey, callback) {
    var user;
    if (password.length < 6) {
        return callback('password length must be longer than 5 chareacters.');
    }
    db.transaction([
        dao.user.$findOne({activationKey: activationKey}),
        function (context, next) {
            var passwordDigest;
            user = context.result();
            if (user) {
                passwordDigest = utils.getSha256Digest(password);
                dao.user.$update({userId: user.userId, $set: {password: passwordDigest, status: STATUS.APPROVED}},
                    function (err) {
                    if (err) {
                        next(new ServerError(503, 'Activating failed'));
                    } else {
                        user.status = STATUS.APPROVED;
                        next();
                    }
                }, context);
            } else {
                next('Unknown user activationKey: ' + activationKey);
            }
        },
        function (context, next) {
            exports.createDefaultPolicy(user, function (err) {
                next(err);
            }, context);
        }
    ], function (err) {
        if (err) {
            callback(err);
        } else {
            callback(null, user);
        }
    });
};

exports.createDefaultPolicy = function (user, callback, context) {
    var token;
    async.waterfall([
        function (next) {
            exports.getPersonalTokens(100000, function (err, result) {
                if (err) {
                    return next(err);
                }
                if (result.length === 0) {
                    return next(new ServerError(500, 'Creating default policy failed'));
                }
                token = result[0].data;
                return next(null);
            }, context);
        }, function (next) {
            var userId = (user.isAdmin === 1) ? '*' : user.userId;
            var defaultAuthPolicy = _.clone(config.services.auth.defaultAuthPolicy);
            defaultAuthPolicy.resource = defaultAuthPolicy.resource.map(function (rsc) {
                return _.template(rsc)({userId: userId});
            });
            exports.createPolicy(user.uid, defaultAuthPolicy, token, function (err, policy) {
                if (err) {
                    return next(new ServerError(500, 'Set default auth policy failed'));
                }
                return next(null, policy.pid);
            }, context);
        }, function (pid, next) {
            exports.assignPolicy({pid: pid, user: user.uid}, function (err) {
                if (err) {
                    console.error('Assign default auth policy failed', err);
                    return next(new ServerError(500, 'Assign default auth policy failed'));
                }
                return next(null);
            }, context);
        }, function (next) {
            exports.createPolicy(user.uid, config.services.auth.defaultAppPolicy, token, function (err, policy) {
                if (err) {
                    return next(new ServerError(500, 'Set default app policy failed'));
                }
                return next(null, policy.pid);
            }, context);
        }, function (pid, next) {
            exports.assignPolicy({pid: pid, user: user.uid}, function (err) {
                if (err) {
                    return next(new ServerError(500, 'Assign default app policy failed'));
                }
                return next(null);
            }, context);
        }, function (next) {
            exports.createPolicy(user.uid, config.services.auth.defaultFSSvcPolicy, token, function (err, policy) {
                if (err) {
                    return next(new ServerError(500, 'Set default fssvc policy failed'));
                }
                return next(null, policy.pid);
            }, context);
        }, function (pid, next) {
            exports.assignPolicy({pid: pid, user: user.uid}, function (err) {
                if (err) {
                    return next(new ServerError(500, 'Assign default fssvc policy failed'));
                }
                return next(null);
            }, context);
        }
    ], function (err) {
        return callback(err);
    });
};

