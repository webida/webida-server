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
var cuid = require('cuid');
var async = require('async');
var mysql = require('mysql');
var Path = require('path');

var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var authMgr = require('../../common/auth-manager');
var config = require('../../common/conf-manager').conf;

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

var collections = ['users', 'clients', 'codes', 'tokens', 'conf', 'tempkey'];

var d = null;
var ntf = null;

d = require('mongojs').connect(config.db.authDb, collections);

d.codes.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.codeExpireTime});
d.tokens.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.tokenExpireTime});
d.users.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.tempUserExpireTime});
d.tempkey.ensureIndex({issueDate: 1}, {expireAfterSeconds: config.services.auth.tempKeyExpireTime});
d.tempkey.ensureIndex({key: 1, uid: 1}, {unique: true});
d.clients.ensureIndex({clientID: 1}, {unique: true});
d.users.ensureIndex({activationKey: 1, uid: 1, email: 1}, {unique: true});
d.conf.ensureIndex({name: 1}, {unique: true});


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

var conn = mysql.createConnection(config.db.mysqlDb);

conn.connect(function (err) {
    if (err)
        logger.info('[acl] error mysql connecting: ' + err.stack);
    logger.info('[acl] connected as id ' + conn.threadId);
});
exports.sqlConn = conn;



var ACTIONS_TO_NOTI = ['fs:*', 'fs:list', 'fs:readFile', 'fs:writeFile', 'fs:getMeta'];

function notifyTopics(policy, trigger, sessionID) {
    if (!sessionID)
        return;

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
        if (rsc.search('fs:') !== 0)
            return;

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
        ntf.sysnoti2(_.uniq(topics), msg, function (err) {
            logger.info('notified topics - ', topics);
            logger.info('notified data - ', msg);
            return;
        });
    }
}

function getID (type, callback) {
    d.conf.findAndModify({
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
    });
};

exports.addClient = function (name, id, secret, redirect, isSystemApp, callback) {
    d.clients.save({clientName: name, clientID: id, clientSecret: secret,
        redirectURL: redirect, isSystemApp: isSystemApp},
        function () {
            d.clients.findOne({clientID: id}, callback);
        }
    );
};

exports.updateClient = function (client, callback) {
    d.clients.update({clientID: client.clientID}, {$set: client}, {upsert: true}, callback);
}

exports.findClientByClientID = function (clientID, callback) {
    d.clients.findOne({clientID: clientID}, callback);
};

exports.addNewCode = function (code, clientID, redirectURI, uid, callback) {
    d.codes.save({issueDate: new Date(), code: code, clientID: clientID,
        redirectURI: redirectURI, userID: uid, expireTime: config.services.auth.codeExpireTime},
        function () {
            d.codes.findOne({code: code}, callback);
        }
    );
};

exports.findCode = function (code, callback) {
    d.codes.findOne({code: code}, callback);
};

exports.getTokenInfo = function (token, callback) {
    d.tokens.findOne({token: token}, callback);
};

exports.addNewToken = function (uid, clientID, token, callback) {
    d.tokens.save({issueDate: new Date(), uid: uid, clientID: clientID,
        token: token, expireTime: config.services.auth.tokenExpireTime},
        function () {
            d.tokens.findOne({token: token}, callback);
        }
    );
};

exports.addNewPersonalToken = function (uid, token, callback) {
    d.tokens.save({issueDate: Date.now(), uid: uid, clientID: ('any_' + token),
        token: token, expireTime: 'INFINITE'},
        function () {
            d.tokens.findOne({token: token}, callback);
        }
    );
};

exports.deletePersonalToken = function (uid, token, callback) {
    d.tokens.findOne({token: token}, function (err, info) {
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
    });
};

exports.deleteAllPersonalTokens = function (uid, callback) {
    d.tokens.remove({uid: uid, expireTime: 'INFINITE'}, callback);
};

exports.getPersonalTokens = function (uid, callback) {
    d.tokens.find({uid: uid, expireTime: 'INFINITE'},
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
    );
};

exports.verifyToken = function (req, res, next) {
    var token = req.headers['authorization'] || url.parse(req.url, true).query.access_token;
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
    d.conf.update({name: 'system'},
        {$set: { name: 'system', currentUID: config.services.auth.baseUID, maxUID: config.services.auth.maxUID }},
        {upsert: true}, callback);
};

exports.checkSystemApp = function (clientID, callback) {
    d.clients.findOne({clientID: clientID}, function (err, client) {
        if (err || !client) {
            return callback(new Error('Check system app failed(' + clientID + ')'));
        } else {
            return callback(null, client.isSystemApp);
        }
    });
};

exports.close = function (callback) {
    d.close();
};

exports.addTempKey = function (uid, key, callback) {
    d.tempkey.findOne({uid: uid}, function (err, keyInfo) {
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
    });
};

exports.findTempKey = function (field, callback) {
    d.tempkey.findOne(field, callback);
};

exports.removeTempKey = function (field, callback) {
    d.tempkey.remove(field, callback);
};

//==========================================================
// acldb using mysql
exports.createPolicy = function (uid, policy, token, callback) {
    async.waterfall([
        function (next) {
            // check resource (fs, auth, app, acl, group)
            async.each(policy.resource, function(rsc, cb) {
                var prefix = rsc.split(':')[0];
                if (!prefix)
                    return callback(new ClientError('Service prefix of resource ' + rsc + ' is invalid.'));

                if (prefix === 'fs') { // fs resource check
                    var fsid = rsc.substr(3).split('/')[0];
                    authMgr.getFSInfo(fsid, token, function(err, info) {
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
                    if (!pid)
                        return callback(new ClientError('Invalid policy id'));

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
                    });
                } else if (prefix === 'group') { // group resource check
                    var gid = rsc.split(':')[1];
                    if (!gid)
                        return callback(new ClientError('Invalid group id'));

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
                    });
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
            var pid = cuid();

            if (!policy.hasOwnProperty('effect')) {
                policy.effect = 'allow';
            }

            var sql = 'INSERT INTO webida_policy VALUES ('
                + '\'' + pid + '\','                                // pid
                + '\'' + policy.name + '\','                        // name
                + uid + ','                                         // owner
                + '\'' + policy.effect + '\','                      // effect
                + '\'' + JSON.stringify(policy.action) + '\','      // action
                + '\'' + JSON.stringify(policy.resource) + '\');';  // resource

            conn.query(sql, function (err) {        // add to webida_policy table
                if (err)
                    return next(new ServerError('Internal server error while creating policy'));

                return next(null, {pid:pid, name:policy.name, owner:uid,
                    effect:policy.effect, action:policy.action, resource:policy.resource});
            });
        }
    ], callback);
};

exports.deletePolicy = function (pid, callback) {
    var sql;
    var policy;
    var ids = null;

    logger.info('[acl] deletePolicy', pid);
    async.waterfall([
        function(next) { // get policy from webida_policy
            sql = 'SELECT * FROM webida_policy WHERE pid=?';
            conn.query(sql, [pid], function (err, result) {
                if (err)
                    return callback(err);

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
                if (err)
                    return callback(err);

                return next(null);
            });
        }, function(next) { // get user-policy relation from webida_userpolicy
            sql = 'SELECT id FROM webida_userpolicy WHERE pid=?';
            conn.query(sql, [pid], function(err, result) {
                if (err)
                    return callback(err);

                if (result.length > 0) {
                    ids = result;
                    return next(null);
                }

                callback(null);
            });
        }, function(next) { // delete user-policy relation from webida_userpolicy
            sql = 'DELETE FROM webida_userpolicy WHERE pid=?';
            conn.query(sql, [pid], function(err) {
                if (err)
                    return callback(err);

                return next(null);
            });
        }, function(next) { // delete webida_rsccheck data
            if (!ids)
                return callback(null);

            sql = 'DELETE FROM webida_rsccheck WHERE action=? AND effect=? AND ';

            var rscCond = '';
            policy.resource.forEach(function(value, index) {
                rscCond += 'rsc=\'' + value + '\' OR';
            });
            rscCond = rscCond.replace(/ OR$/, '');

            var uidCond = '';
            ids.forEach(function(value, index) {
                uidCond += ' id=' + value.id+ ' OR';
            });
            uidCond = uidCond.replace(/ OR$/, '');

            sql += '(' + rscCond + ') AND (' + uidCond + ')';

            conn.query(sql, [policy.action, policy.effect], function (err) {
                if (err)
                    return callback(err);

                return callback(null);
            });
        }
    ]);
};

exports.updatePolicy = function (pid, fields, sessionID, callback) {
    var policy;
    var ids = null;
    var sql;

    var isUpdateNeed = false;
    var isNotiNeed = false;

    if (!fields)
        return callback(null, null);

    if (fields.hasOwnProperty('action')) {
        if(_.intersection(fields.action, ACTIONS_TO_NOTI).length > 0)
            isNotiNeed = true;

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


    async.waterfall([
        function(next) { // get old policy
            sql = 'SELECT * FROM webida_policy WHERE pid=?';
            conn.query(sql, [pid], function (err, result) {
                if (err)
                    return callback(new ServerError('Server internal error.'));

                if (result.length > 0) {
                    if(_.intersection(JSON.parse(result[0].action), ACTIONS_TO_NOTI).length > 0)
                        isNotiNeed = true;
                    return next();
                } else {
                    return callback(new ClientError('Unknown policy id.'));
                }
            });
        }, function(next) { // get user-policy relation from webida_userpolicy
            if (!isUpdateNeed)
                return next(null);

            sql = 'SELECT id FROM webida_userpolicy WHERE pid=?';
            conn.query(sql, [pid], function(err, result) {
                if (err)
                    return callback(new ServerError(500, 'Server internal error.'));

                if (result.length > 0)
                    ids = result;

                return next(null);
            });
        }, function(next) { // remove policy
            if (!isUpdateNeed || !ids)
                return next(null);

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
                if (err)
                    return callback(new ServerError('Server internal error whie updating policy.'));
                return next(null);
            });
        }, function(next) { // assign policy again
            if (!isUpdateNeed || !ids)
                return next(null);

            async.each(ids, function (value, cb) {
                exports.assignPolicy({pid:pid, user:value.id}, cb);
            }, function(err) {
                return next(err);
            });
        }
    ], function(err) {
        if (err)
            return callback(err);

        sql = 'SELECT * FROM webida_policy WHERE pid=?';
        conn.query(sql, [pid], function (err, result) {
            if (err)
                return callback(new ServerError(500, 'Server internal error.'));

            if (result.length > 0) {
                result[0].action = JSON.parse(result[0].action);
                result[0].resource = JSON.parse(result[0].resource);

                if (isNotiNeed)
                    notifyTopics(result[0], 'updatePolicy', sessionID);

                return callback(null, result[0]);
            }
            return callback(null, null);
        });
    });
};

// info:{pid, user, sessionID}
exports.assignPolicy = function (info, callback) {
    var sql;

    async.waterfall([
        function(next) {
            sql = 'SELECT * FROM webida_userpolicy WHERE pid=? AND id=?';
            conn.query(sql, [info.pid, info.user], function(err, results) {
                if (err)
                    return next(err);
                if (results.length > 0)
                    return callback(null);
                return next(null);
            });
        }, function(next) {
            sql = 'INSERT INTO webida_userpolicy VALUES (?,?);';
            conn.query(sql, [info.pid, info.user], function(err) {
                if (err)
                    return next(err);
                return next(null);
            });
        }, function(next) {
            sql = 'SELECT * FROM webida_policy WHERE pid=?';
            conn.query(sql, [info.pid], function (err, result) {
                if (err)
                    return next(err);

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
                if (err)
                    return next(err);
                return next(null, policy);
            });
        }, function(policy, next) {
            if (info.sessionID) {
                policy.action = JSON.parse(policy.action);
                notifyTopics(policy, 'assignPolicy', info.sessionID);
            }
            return next(null);
        }
    ], callback);
};

// info:{pid, user, sessionID}
exports.removePolicy = function (info, callback) {
    var sql;
    logger.info('[acl] removePolicy for ', info.pid, info.user);
    async.waterfall([
        function(next) {
            sql = 'DELETE FROM webida_userpolicy WHERE pid=? AND id=?';
            conn.query(sql, [info.pid, info.user], function (err) { next(err); });
        }, function(next) {
            sql = 'SELECT * FROM webida_policy WHERE pid=?';
            conn.query(sql, [info.pid], function (err, result) {
                if (err)
                    return next(err);

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
                if (err)
                    return next(err);
                return next(null, policy);
            });
        }, function(policy, next) {
            if (info.sessionID) {
                policy.action = JSON.parse(policy.action);
                notifyTopics(policy, 'removePolicy', info.sessionID);
            }
            return next(null);
        }
    ], callback);
};

exports.getAssignedUser = function (pid, type, callback) {
    var sql = 'SELECT id FROM webida_userpolicy WHERE pid=?';
    conn.query(sql, [pid], function(err, results) {
        if (results.length <= 0)
            return callback(null, new Array());

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
                if (err)
                    return cb(err);

                if ((types.length <= 0) || (types[0].type !== type))
                    return cb();

                conn.query(queryUserInfoSql, [val.id], function (err, user) {
                    if (err) {
                        return cb(err);
                    } else {
                        if (user.length > 0)
                            users.push(user[0]);
                        return cb();
                    }
                });
            });
        }, function (err) {
            if (err)
                return callback(err);
            return callback(null, users);
        });
    });
};

exports.getAuthorizedUser = function(action, rsc, type, callback) {
    var sql = 'SELECT pid FROM webida_policy WHERE ';

    var res = action.split(':');
    var prefix = res[0];
    var str = res[1];

    sql += '(action LIKE \'%' + action + '%\'';
    if (str !== '*')
        sql += ' OR action LIKE \'%' + prefix + ':*%\'';

    sql += ') AND (resource LIKE \'%' + rsc + '%\'';
    var index;
    while (true) {
        index = rsc.lastIndexOf('/');
        if (index === -1) {
            break;
        }

        rsc = rsc.slice(0, index);
        sql += ' OR resource LIKE \'%' + rsc + '/*%\'';
    }
    sql += ');';

    var users = [];
    logger.info('[acl] getAuthorizedUser', sql);
    conn.query(sql, function (err, pids) {
        if (err)
            return callback(err);

        async.eachSeries(pids, function (value, cb) {
            exports.getAssignedUser(value.pid, type, function(err, results) {
                if (err)
                    return cb(err);

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
                if (ret.indexOf(users[i]) == -1)
                    ret.push(users[i]);
            }
            return callback(null, ret);
        });
    });
}

exports.getAuthorizedRsc = function(uid, action, callback) {
    logger.info('getAuthorizedRsc', uid, action);

    var sql = 'SELECT rsc FROM webida_rsccheck WHERE effect=\'allow\' AND '
            + '(action LIKE \'%' + action + '%\' OR action LIKE \'%'
            + action.split(':')[0] + ':*%\') AND (';

    async.waterfall([
        function(next) {
            sql += 'id=' + uid + ' OR ';
            conn.query('SELECT gid FROM webida_groupuser WHERE uid=?', [uid], function (err, results) {
                if (err)
                    return next('Internal server error.');

                if (results.length > 0) {
                    for (var i in results)
                        sql += 'id=' + results[i].gid + ' OR ';
                }
                sql = sql.replace(/ OR $/, ');');
                return next();
            });
        }, function(next) {
            conn.query(sql, function (err, results) {
                logger.info('[acl]getAuthorizedRsc', sql, results);
                if (err)
                    return next('Internal server error.');

                var rsc = _.map(results, function(obj) {return obj.rsc;});
                return next(null, rsc);
            });
        }
    ], function (err, rsc) {
        if (err)
            return callback(err);
        return callback(null, rsc);
    });
}

exports.getAssignedPolicy = function (id, callback) {
    var sql = 'SELECT pid FROM webida_userpolicy WHERE id=?';
    logger.info('[acl] getAssignedPolicy', sql, id);
    conn.query(sql, [id], function (err, results) {
        if (results.length <= 0)
            return callback(null, new Array());

        var policies = [];
        sql = 'SELECT * FROM webida_policy WHERE pid=?';
        async.each(results, function (value, cb) {
            conn.query(sql, [value.pid], function (err, policy) {
                if (err)
                    cb(err);

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
            if (err)
                return callback(err);
            return callback(null, policies);
        });
    });
};

exports.getOwnedPolicy = function (id, callback) {
    var sql = 'SELECT * FROM webida_policy WHERE owner=?';
    logger.info('[acl] getOwnedPolicy', sql, id);
    conn.query(sql, [id], callback);
};

exports.getPolicies = function (pidArr, callback) {
    var policies = [];
    var sql = 'SELECT * FROM webida_policy WHERE pid=?';
    async.eachSeries(pidArr, function (pid, cb) {
        conn.query(sql, [pid], function (err, policy) {
            if (err)
                cb(err);

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
        if (err)
            return callback(err);
        return callback(null, policies);
    });
};

//==========================================================
// groupdb using mysql
exports.createGroup = function (group, callback) {
    async.waterfall([
        function (next) {
            var sql = 'select * from webida_group where owner=? AND name=?';
            conn.query(sql, [group.owner, group.name], function (err, results) {
                if (err)
                    return next(err);
                if (results.length > 0) {
                    return next(new ClientError('The group is already exist.'));
                } else {
                    return next(null);
                }
            });
        }, function (next) {
            getID('g', function (err, id) {
                if (err) {
                    return next(err);
                }
                return next(null, id);
            });
        }, function (gid, next) {
            var sql = 'INSERT INTO webida_group VALUES (?,?,?,?)';
            conn.query(sql, [gid, group.name, group.owner, group.userdata], function (err) {
                if (err)
                    return next(err);
                return next(null, {gid:gid, name:group.name, owner:group.owner, userdata:group.userdata});
            });
        }
    ], callback);
};

exports.deleteGroup = function (gid, callback) {
    var sql;
    async.waterfall([
        function (next) {
            sql = 'DELETE FROM webida_group WHERE gid=?';
            logger.info('[group] deleteGroup query string is ', sql);
            conn.query(sql, [gid], function(err) {
                if (err)
                    return next(err);
                return next(null);
            });
        }, function (next) {
            sql = 'DELETE FROM webida_usertype WHERE id=? AND type=\'g\';';
            conn.query(sql, [gid], function(err) {
                if (err)
                    return next(err);
                return next(null);
            });
        }, function (next) {
            sql = 'DELETE FROM webida_groupuser WHERE gid=?';
            conn.query(sql, [gid], function(err) {
                if (err)
                    return next(err);
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
    ], callback);
};

exports.addUsersToGroup = function (uidArr, gid, callback) {
    if (uidArr.length === 0)
        return callback(null);

    var sql = 'INSERT INTO webida_groupuser VALUES ';
    uidArr.forEach(function(uid) {
        sql += '(' + gid + ',' + uid + '), ';
    });
    sql = sql.replace(/, $/, ';');

    logger.info('[group] addUserToGroup query string is ', sql);
    conn.query(sql, callback);
};

exports.removeUsersFromGroup = function (uidArr, gid, callback) {
    if (uidArr.length === 0)
        return callback(true);

    var sql = 'DELETE FROM webida_groupuser WHERE gid=' + gid + ' AND (';
    uidArr.forEach(function(value) {
        sql += 'uid=' + value + ' OR ';
    });
    sql = sql.replace(/OR $/, ')');

    logger.info('[group] removeUserFromGroup query string is ', sql);
    conn.query(sql, callback);
};


exports.getGroups = function (uid, callback) {
    var sql = 'SELECT * FROM webida_group WHERE owner=?';
    logger.info('[group] getMyGroups query string is ', sql);
    conn.query(sql, [uid], callback);
};

exports.getAssignedGroups = function(uid, callback) {
    var sql = 'SELECT * FROM webida_groupuser WHERE uid=?';
    logger.info('[group] getAssignedGroups query string is ', sql);
    conn.query(sql, [uid], function (err, results) {
        if (err)
            return callback(err);

        if (results.length <= 0)
            return callback(null, new Array());

        var groups = [];
        async.eachSeries(results, function (value, cb) {
            sql = 'SELECT * FROM webida_group where gid=?';
            conn.query(sql, [value.gid], function(err, group) {
                if (err || group.lenght <= 0)
                    return cb('Failed to get the group ' + value.gid + ' information.');

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
    });
};

exports.getGroupMembers = function (gid, callback) {
    var sql = 'SELECT * FROM webida_groupuser WHERE gid=?';
    logger.info('[group] getGroupMembers query string is ', sql);
    conn.query(sql, [gid], function (err, results) {
        if (err) {
            return callback(err);
        }

        if (results.length <= 0)
            return callback(null, new Array());

        var members = [];
        async.eachSeries(results, function (value, cb) {
            sql = 'SELECT * FROM webida_user where uid=?';
            conn.query(sql, [value.uid], function(err, user) {
                if (err || user.lenght <= 0)
                    return cb('Failed to get the user' + value.uid + ' information.');

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
    });
};

exports.setGroupMembers = function (gid, uidArr, callback) {
    conn.query('DELETE FROM webida_groupuser WHERE gid=' + gid, function(err) {
        if (err)
            return callback(err);

        return exports.addUsersToGroup(uidArr, gid, callback);
    });
};

exports.getAllGroups = function (callback) {
    var sql = 'SELECT * FROM webida_group;';
    logger.info('[group] getAllGroups query string is ', sql);
    conn.query(sql, callback);
};

exports.UPDATABLE_GROUPINFO = ['name', 'userdata'];
exports.updateGroup = function (gid, groupInfo, callback) {
    async.waterfall([
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
                    if (err)
                        return next(err);
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
        if (err)
            return callback(err);
        return callback(null, group);
    });
};

//==========================================================
// userdb using mysql

exports.findUserByUid = function (uid, callback) {
    exports.findUser({uid:uid}, function(err, users) {
        if (users.length === 0) {
            return callback(err, null);
        } else {
            return callback(null, users[0]);
        }
    });
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

exports.FINDABLE_USERINFO = ['uid', 'email', 'name', 'company', 'telephone', 'department', 'url', 'location', 'gravatar', 'activationKey', 'status', 'isAdmin'];
exports.findUser = function (info, callback) {
    info = _.pick(info, exports.FINDABLE_USERINFO);

    var sql = 'SELECT * FROM webida_user WHERE ';

    for (var key in info) {
        sql += key + ' LIKE \'%' + info[key] + '%\' AND ';
    }
    sql = sql.replace(/ AND $/, ';');

    logger.info('[user] findUser ', sql, info);
    conn.query(sql, callback);
};

// authinfo : {email, password, name, company, telephone, department, activationKey}
// email, password must be exist.
exports.findOrAddUser = function (authinfo, callback) {
    logger.info('findOrAddUser authinfo', authinfo);

    if (!config.services.auth.signup.allowSignup)
        return callback('Signup is forbidden.');

    if (!authinfo.email)
        return callback('Email is required');

    var emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailPattern.test(authinfo.email))
        return callback('Invalid email address format');

    if (!authinfo.password)
        return callback('Password is required');

    var sql = 'SELECT * FROM webida_user WHERE email=?';
    conn.query(sql, [authinfo.email], function (err, users) {
        if (err) {
            logger.info(err);
            return callback(err);
        } else if (users.length > 0) {
            logger.info('Found user', users);
            return callback('Email '+authinfo.email+' is already used.');
        } else {
            logger.info('cannot find user. add it', authinfo.email);
            exports.addUser(authinfo, callback);
        }
    });
};

// authinfo : {email, password, name, company, telephone, department, activationKey}
exports.addUser = function (authinfo, callback) {
    getID('u', function (err, id) {
        if (err) {
            return callback(err);
        } else {
            var digest = utils.getSha256Digest(authinfo.password);
            var sql = 'INSERT INTO webida_user VALUES ('
                + id + ','
                + '\'' + authinfo.email + '\','
                + '\'' + digest + '\','
                + '\'' + authinfo.name + '\','
                + '\'' + authinfo.company + '\','
                + '\'' + authinfo.telephone + '\','
                + '\'' + authinfo.department + '\','
                + '\'' + authinfo.url + '\','
                + '\'' + authinfo.location + '\','
                + '\'' + authinfo.gravatar + '\','
                + '\'' + authinfo.activationKey + '\','
                + (authinfo.status ? authinfo.status : STATUS.PENDING) + ','
                + (authinfo.isAdmin ? authinfo.isAdmin : 0) + ','
                + 'NOW(),NOW());';
            logger.info('[user] addUser ', sql);
            conn.query(sql, function(err) {
                if (err)
                    return callback(err);
                return exports.findUserByUid(id, callback);
            });
        }
    });
};

exports.UPDATABLE_USERINFO = ['password', 'name', 'company', 'telephone', 'department', 'url', 'location', 'gravatar', 'status', 'isAdmin'];
exports.updateUser = function (field, fields, callback) {
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

            if (users[0].status === STATUS.PASSWORDRESET)
                fields.status = STATUS.APPROVED;
        }
        logger.debug('updateUser', users[0].email, fields);

        var sql = 'UPDATE webida_user SET ';
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
        });
    });
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

        var sql = 'SELECT * FROM webida_user';
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
        });
    });
};

exports.deleteUser = function (uid, callback) {
    var sql;
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
    });
};

exports.setLastLogin = function (uid, callback) {
    var sql = 'UPDATE webida_user SET lastLogin=NOW(), WHERE uid=?';
    logger.info('[acl] setLastLogin query string is ', sql);
    conn.query(sql, [uid], callback);
};

// aclInfo : {uid:int, action:string, rsc:string}
exports.checkAuthorize = function (aclInfo, res, callback) {
    // if uid === owner then return true;
    var rscArr = [
        aclInfo.rsc,
        aclInfo.rsc + '/*',
        Path.dirname(aclInfo.rsc) + '/+'
    ];

    var ret = false;

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
                rscArr.push(prefix + ':' + str + '/*');
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
                        if ((rows[i].action.indexOf(aclInfo.action) === -1)
                            && (rows[i].action.indexOf('*') === -1)) {
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
    });
};

exports.createSQLTable = function(callback) {
    logger.info('[acl] createSQLTable called.');

    // TODO : create webida user of mysql and webida database
    var sql;
    async.series([
        function(cb) { // webida_user table
            sql = 'CREATE TABLE IF NOT EXISTS webida_user('
                + 'uid int(10) primary key,'
                + 'email varchar(255) not null,'
                + 'passwordDigest varchar(255) not null,'
                + 'name varchar(255),'
                + 'company varchar(255),'
                + 'telephone varchar(16),'
                + 'department varchar(255),'
                + 'url varchar(255),'
                + 'location varchar(1024),'
                + 'gravatar varchar(255),'
                + 'activationKey varchar(255),'
                + 'status tinyint(1),'
                + 'isAdmin tinyint(1),'
                + 'issueDate datetime,'
                + 'lastLogin datetime);';

            logger.info('[acl] createSQLTable create webida_user', sql);
            conn.query(sql, function(err, result) {
                return cb(err);
            });
        }, function(cb) { // webida_group table
            sql = 'CREATE TABLE IF NOT EXISTS webida_group('
                + 'gid int(10) primary key,'
                + 'name varchar(255) not null,'
                + 'owner int(10) not null,'
                + 'userdata varchar(1024));';
            conn.query(sql, function(err, result) {
                return cb(err);
            });
        }, function(cb) { // webida_groupuser table
            var sql = 'CREATE TABLE IF NOT EXISTS webida_groupuser('
                + 'gid int(10) not null,'
                + 'uid int(10) not null);';
            conn.query(sql, function(err, result) {
                return cb(err);
            });
        }, function(cb) { // webida_usertype table
            var sql = 'CREATE TABLE IF NOT EXISTS webida_usertype('
                + 'id int(10) primary key,'
                + 'type char(1));';
            conn.query(sql, function(err, result) {
                return cb(err);
            });
        }, function(cb) { // webida_userpolicy table
            var sql = 'CREATE TABLE IF NOT EXISTS webida_userpolicy('
                + 'pid varchar(255) not null,'
                + 'id int(10) not null);';
            conn.query(sql, function(err, result) {
                return cb(err);
            });
        }, function(cb) { // webida_policy table
            var sql = 'CREATE TABLE IF NOT EXISTS webida_policy('
                + 'pid varchar(255) primary key,'
                + 'name varchar(255) not null,'
                + 'owner int(10) not null,'
                + 'effect varchar(5),'
                + 'action varchar(1024),'
                + 'resource varchar(16384));';
            conn.query(sql, function(err, result) {
                return cb(err);
            });
        }, function(cb) { // webida_rsccheck table
            var sql = 'CREATE TABLE IF NOT EXISTS webida_rsccheck('
                + 'rsc varchar(16384) not null,'
                + 'id int(10) not null,'
                + 'action varchar(1024),'
                + 'effect varchar(5));';
            conn.query(sql, function(err, result) {
                return cb(err);
            });
        }
    ], function (err, result) {
        if (err)
            return callback(err);
        return callback(null);
    });
};

exports.createSystemFSPolicy = function(callback) {
    logger.info('[acl] createSystemFSPolicy called.');

    var sql1 = 'SELECT * FROM webida_rsccheck WHERE rsc=? AND id=? AND action=? and effect=?;';
    var sql2 = 'INSERT INTO webida_rsccheck VALUES (?,?,?,?);';
    async.each(config.services.auth.systemFS, function(rsc, cb) {
        conn.query(sql1, [rsc, 0, '["fs:*"]', 'allow'], function(err, results) {
            if (err)
                return cb(err);
            if (results.length > 0)
                return cb();

            conn.query(sql2, [rsc, 0, '["fs:*"]', 'allow'], function(err) {
                return cb(err);
            });
        });
    }, function(err) {
        logger.info('[acl] createSystemFSPolicy end.', err);
        return callback(err);
    });
};

exports.updatePolicyRsc = function (src, dst, callback) {
    var sql;
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
    });
};

exports.isGroupOwner = function(uid, gid, callback) {
    var sql = 'SELECT owner from webida_group where gid=?';
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
    });
};

exports.isGroupOwnerOrMember = function(uid, gid, callback) {
    async.waterfall([
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
    ]);
};

exports.isPolicyOwner = function(uid, pid, callback) {
    var sql = 'SELECT owner from webida_policy where pid=?';
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
    });
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
    }, function(err) {
        return callback(null, true);
    });
};
