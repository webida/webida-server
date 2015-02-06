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

var http = require('http');
var utils = require('./utils');

var mongojs = require('mongojs');
var querystring = require('querystring');

var logger = require('./log-manager');
var config = require('./conf-manager').conf;

var tdb = null;


var authHost = 'http://' + config.hostInfo.auth.host + ':' + config.hostInfo.auth.port

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

exports.init = function (db) {
    logger.info('auth-manager initialize. (' + db + ')');
    tdb = mongojs(db, ['tokeninfo']);
    tdb.tokeninfo.ensureIndex({expireDate: 1}, {expireAfterSeconds: 0});
    tdb.tokeninfo.ensureIndex({token: 1}, {unique: true});
};

function isTokenRegistered(token, callback) {
    tdb.tokeninfo.findOne({token: token}, callback);
}

function registerToken(info, callback) {
    var expireDate = new Date(info.issueDate).getTime();
    expireDate += info.expireTime * 1000;

    var newInfo = {expireDate: new Date(expireDate),
        uid: info.uid, email: info.email, clientID: info.clientID, token: info.token,
        issueDate: info.issueDate, expireTime: info.expireTime, isAdmin: info.isAdmin};

    logger.info('registerToken info', info, newInfo);
    tdb.tokeninfo.update({token: info.token}, {$set: newInfo}, {upsert: true}, function (err) {
        if (err) {
            callback('token info registration failed');
        } else {
            callback(null, newInfo);
        }
    });
    // TODO consider keeping token cache in memory not in db,
    // because central db is located on other server and causes more latency for every api requests.
    // It also reduces race condition of simultaneous updates of same token.
}

function deleteToken(token, callback) {
    tdb.tokeninfo.remove({token: token}, callback);
}
exports.deleteToken = deleteToken;

function requestTokenInfo(token, isRegister, callback) {
    var verifyUri = config.oauthSettings.webida.verifyTokenURL + '?token=' + token;
    function handleResponse(err, res, body) {
        if (err) { return callback(err); }

        var tokenInfo;
        if (res.statusCode === 200) {
            try {
                tokenInfo = JSON.parse(body).data;
            } catch (e) {
                logger.error('Invalid verifyToken reponse:', arguments);
                return callback(500);
            }
            if (isRegister) {
                registerToken(tokenInfo, function (err, registered) {
                    if (err || !registered) {
                        logger.info('registerToken failed', arguments);
                        return callback(500);
                    }
                    return callback(0, registered);
                });
            } else {
                return callback(0, tokenInfo);
            }
        } else if (res.statusCode === 419) {
            return callback(419);
        } else {
            return callback(500);
        }
    }
    logger.info('req', verifyUri);
    var req = http.request(verifyUri, function (res) {
        var data = '';
        logger.info('res', res.statusCode);
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            logger.info('data chunk', chunk);
            data += chunk;
        });
        res.on('end', function (){
            logger.info('end', data);
            handleResponse(null, res, data);
        });
    });
    req.on('error', function (err) {
        handleResponse(err);
    });
    req.end();
}

function checkExpired(info, callback) {
    if (!info) {
        return callback(500);
    }

    if (info.expireTime === 'INFINITE') {
        return callback(0, info);
    }

    var current = new Date().getTime();
    var expire = new Date(info.expireDate).getTime();
    logger.info('checkExpired', current, expire);
    if (expire - current < 0) {
        return callback(419);
    } else {
        return callback(0, info);
    }
}

function _verifyToken(token, callback) {
    if (!tdb) {
        logger.debug('auth-manager is not initialized.');
        return callback(400);
    }
    if (!token) {
        logger.debug('token is null');
        return callback(400);
    }

    isTokenRegistered(token, function (err, tokenInfo) {
        if (err) {
            logger.debug(err);
            return callback(500);
        }

        if (!tokenInfo) {
            requestTokenInfo(token, true, function (err, info) {
                if (err) {
                    logger.debug('requestTokenInfo failed', err);
                    return callback(err);
                }
                return checkExpired(info, callback);
            });
        } else {
            checkExpired(tokenInfo, callback);
        }
    });
}
exports._verifyToken = _verifyToken;

function getTokenVerifier(errHandler) {
    var verifyToken = function (req, res, next) {
        if (!tdb) {
            logger.debug('auth-manager is not initialized');
            return res.status(500).send(utils.fail('Internal Server Error'));
        }

        var token = req.headers['authorization'] || req.access_token || req.query.access_token ||  req.parsedUrl.query.access_token;
        if (!token) {
            return errHandler(utils.err('TokenNotSpecified'), req, res, next);
        }
        logger.info('verifyToken', token);

        _verifyToken(token, function (err, info) {
            if (err) {
                logger.info('_verifyToken failed', err);
                errHandler(err, req, res, next);
            } else {
                req.user = info;
                next();
            }
        });
    };
    return verifyToken;
}
exports.getTokenVerifier = getTokenVerifier;

function getUserInfo(req, res, next) {
    getTokenVerifier(function (err, req, res, next) {
        if (err) {
            if (err.name === 'TokenNotSpecified') {
                next();
            } else if (err === 419)  {
                return res.status(err).send(utils.fail('Access token is invalid or expired'));
            } else {
                return res.status(err).send(utils.fail('Internal server error'));
            }
        }
    })(req, res, next);
}
exports.getUserInfo = getUserInfo;
function ensureLogin(req, res, next) {
    getTokenVerifier(function (err, req, res, next) {
        if (err.name === 'TokenNotSpecified') {
            return res.status(400).send(utils.fail('Access token is required'));
        } else if (err === 419)  {
            return res.status(err).send(utils.fail('Access token is invalid or expired'));
        } else {
            return res.status(err).send(utils.fail('Internal server error'));
        }
        next();
    })(req, res, next);
}
exports.ensureLogin = ensureLogin;
exports.verifyToken = ensureLogin; // deprecated

function ensureAdmin(req, res, next) {
    ensureLogin(req, res, function () {
        if (!req.user.isAdmin) {
            return res.status(400).send(utils.fail('Unauthorized Access'));
        }
        next();
    });
}
exports.ensureAdmin = ensureAdmin;

function verifySession(token, callback) {
    if (!token) {
        logger.debug('token is null');
        return callback(400);
    }

    requestTokenInfo(token, false, function (err, info) {
        if (err) {
            logger.debug('requestTokenInfo failed', err);
            return callback(err);
        }
        return checkExpired(info, callback);
    });
}

exports.verifySession = verifySession;

function checkAuthorize(aclInfo, res, next) {
    logger.info('checkAuthorize', aclInfo);
    var uri =  authHost + '/checkauthorize'
        + '?uid=' + aclInfo.uid
        + '&action=' + aclInfo.action
        + '&rsc=' + aclInfo.rsc;

    var req = http.request(uri, function(response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('checkAuthorize data chunk', chunk);
            data += chunk;
        });
        response.on('end', function (){
            if (response.statusCode === 200) {
                return next();
            } else if (response.statusCode === 401) {
                return res.send(401, utils.fail('Not authorized.'));
            } else {
                return res.send(500, utils.fail('Internal server error(checking authorization)'));
            }
        });
    });

    req.on('error', function(e) {
        return res.send(500, utils.fail(e));
    });

    req.end();
}
exports.checkAuthorize = checkAuthorize;

function checkAuthorizeMulti(aclInfo, res, next) {
    logger.info('checkAuthorizeMulti', aclInfo);
    var uri = authHost + '/checkauthorizemulti'
        + '?uid=' + aclInfo.uid
        + '&action=' + aclInfo.action
        + '&rsc=' + aclInfo.rsc
        + '&fsid=' + aclInfo.fsid;

    var req = http.request(uri, function(response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('data chunk', chunk);
            data += chunk;
        });
        response.on('end', function (){
            if (response.statusCode === 200) {
                return next();
            } else if (response.statusCode === 401) {
                return res.send(401, utils.fail('Not authorized.'));
            } else {
                return res.send(500, utils.fail('Internal server error(checking authorization)'));
            }
        });
    });

    req.on('error', function(e) {
        return res.send(500, utils.fail(e));
    });

    req.end();
}
exports.checkAuthorizeMulti = checkAuthorizeMulti;


function createPolicy(policy, token, callback) {
    logger.info('createPolicy', policy);

    var data = querystring.stringify({
        name: policy.name,
        action: JSON.stringify(policy.action),
        resource: JSON.stringify(policy.resource)
    });

    var options = {
        host: config.hostInfo.auth.host,
        port: config.hostInfo.auth.port,
        path: '/webida/api/acl/createpolicy?access_token=' + token,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': data.length
        }
    };

    var req = http.request(options, function(response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('createPolicy data chunk', chunk);
            data += chunk;
        });
        response.on('end', function (){
            if (response.statusCode === 200) {
                return callback(null, JSON.parse(data).data);
            } else {
                return callback('createPolicy failed.', policy);
            }
        });
    });


    req.on('error', function(e) {
        return callback(e);
    });

    req.write(data);

    req.end();
}
exports.createPolicy = createPolicy;

function assignPolicy(id, pid, token, callback) {
    logger.info('assignPolicy', id, pid);
    var uri = authHost + '/webida/api/acl/assignpolicy'
        + '?pid=' + pid
        + '&user=' + id
        + '&access_token=' + token;

    var req = http.request(uri, function(response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('assignPolicy data chunk', chunk);
            data += chunk;
        });
        response.on('end', function (){
            if (response.statusCode === 200) {
                return callback();
            } else {
                return callback('assignPolicy for ' + fsid + ' failed.');
            }
        });
    });


    req.on('error', function(e) {
        return callback(e);
    });

    req.end();
}
exports.assignPolicy = assignPolicy;

function updatePolicyResource(oldPath, newPath, token, callback) {
    logger.info('updatePolicyResource', oldPath, newPath);
    var uri = config.checkAuthorizeHost + '/webida/api/acl/updatepolicyrsc'
        + '?src=' + oldPath
        + '&dst=' + newPath
        + '&access_token=' + token;

    var req = http.request(uri, function(response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('updatePolicyResource data chunk', chunk);
            data += chunk;
        });
        response.on('end', function (){
            if (response.statusCode === 200) {
                return callback();
            } else {
                return callback('updatePolicyResource failed.');
            }
        });
    });


    req.on('error', function(e) {
        return callback(e);
    });

    req.end();
}
exports.updatePolicyResource = updatePolicyResource;

function getFSInfo(fsid, token, callback) {
    var uri = config.hostInfo.fs + '/webida/api/fs/' + fsid
        + '?access_token=' + token;
    logger.info('getFSInfo', fsid, token, uri);

    var req = http.request(uri, function(response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('getFSInfo data chunk', chunk);
            data += chunk;
        });
        response.on('end', function (){
            if (response.statusCode === 200) {
                return callback(null, JSON.parse(data).data);
            } else if (response.statusCode === 401) {
                return callback(new ClientError(401, 'Not authorized'));
            } else {
                return callback(new ServerError('Internal error while check createPolicy authority.'));
            }
        });
    });


    req.on('error', function(e) {
        return callback(e);
    });

    req.end();
}
exports.getFSInfo = getFSInfo;
