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
var util = require('util');
var utils = require('./utils');
var _ = require('lodash');

var querystring = require('querystring');

var logger = require('./log-manager');
var config = require('./conf-manager').conf;

var internalAccessInfo = config.internalAccessInfo;

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

exports.init = function (db) {
    logger.info('auth-manager initialize. (' + db + ')');
};

function _requestTokenInfo(token, callback) {
    var template = _.template('/webida/api/oauth/verify?token=<%= token %>');
    var options = {
        hostname: internalAccessInfo.auth.host,
        port: internalAccessInfo.auth.port,
        path: template({token: token})
    };
    var req;

    logger.debug('request token info', options);
    function handleResponse(err, res, body) {
        var tokenInfo;
        if (err) { return callback(err); }
        if (res.statusCode === 200) {
            try {
                tokenInfo = JSON.parse(body).data;
            } catch (e) {
                logger.error('Invalid oauth/verify response: ' + body, e);
                return callback(500);
            }
            return callback(0, tokenInfo);
        } else if (res.statusCode === 419) {
            return callback(419);
        } else {
            return callback(500);
        }
    }

    req = http.request(options, function (res) {
        var data = '';
        logger.info('res', res.statusCode);
        res.setEncoding('utf8');
        //res.on('data', function (chunk) {
        //    logger.info('data chunk', chunk);
        //    data += chunk;
        //});
        res.on('end', function () {
            logger.info('end', data);
            handleResponse(null, res, data);
        });
    });
    req.on('error', function (err) {
        handleResponse(err);
    });
    req.end();
}

function _checkExpired(info, callback) {
    var current;
    var expire;
    if (!info) {
        return callback(500);
    }

    if (info.validityPeriod <= 0) { // INFINITE
        return callback(0, info);
    }

    current = new Date().getTime();
    expire = new Date(info.expireTime).getTime();
    logger.info('_checkExpired', current, info, expire);
    if (expire - current < 0) {
        return callback(419);
    } else {
        return callback(0, info);
    }
}

function _verifyToken(token, callback) {
    if (!token) {
        logger.debug('token is null');
        return callback(400);
    }
    _requestTokenInfo(token, function (err, info) {
        if (err) {
            logger.debug('_requestTokenInfo failed', err);
            return callback(err);
        }
        return _checkExpired(info, callback);
    });
}

function _getTokenFromRequest(req) {
    /* jshint camelcase: false */
    return req.headers.authorization || req.access_token ||
        req.query.access_token || req.parsedUrl.query.access_token;
}

// this function allows 'anonymous user' by default, but will not set req.user
// for the anonymous user

function getUserInfo(req, res, next) {
    var token = _getTokenFromRequest(req);
    var allowAnonymous = req.disallowAnonymous ? false : true;

    logger.debug('checking token : ' + token);
    _verifyToken(token, function (err, info) {
        var errMsg = 'Internal server error';
        if (err) {
            logger.debug('_verifyToken failed with ' + err);
            if (err === 400 || err === 419) {
                if (allowAnonymous) {
                    return next();
                }
                errMsg = (err === 400) ? 'requires access token' : 'invalid access token';
            }
            return res.status(err).send(utils.fail(errMsg));
        }
        req.user = info;
        return next();
    });
}
exports.getUserINfo = getUserInfo;

function ensureLogin(req, res, next) {
    req.disallowAnonymous = true;
    return getUserInfo(req, res, next);
}
exports.ensureLogin = ensureLogin;

exports.ensureAdmin = function ensureAdmin (req, res, next) {
    ensureLogin(req, res, function () {
        if (!req.user.isAdmin) {
            return res.status(400).send(utils.fail('Unauthorized Access'));
        }
        next();
    });
};

function _verifyToken(token, callback) {
    if (!token) {
        logger.debug('token is null');
        return callback(400);
    }
    _requestTokenInfo(token, function (err, info) {
        if (err) {
            logger.debug('_requestTokenInfo failed', err);
            return callback(err);
        }
        return _checkExpired(info, callback);
    });
}

exports.getUserInfoByToken = _verifyToken;

function sendCheckAuthorizeRequest(aclInfo, options, res, next) {
    var req;
    logger.info('checkAuthorize', aclInfo);
    req = http.request(options, function (response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('checkAuthorize data chunk', chunk);
            data += chunk;
        });
        response.on('end', function () {
            if (response.statusCode === 200) {
                return next();
            } else if (response.statusCode === 401) {
                return res.status(401).send(utils.fail('Not authorized.'));
            } else {
                return res.status(500).send(utils.fail('Internal server error(checking authorization)'));
            }
        });
    });
    req.on('error', function (e) {
        return res.send(500, utils.fail(e));
    });
    req.end();
}
function checkAuthorize(aclInfo, res, next) {
    var template = _.template('/checkauthorize?uid=<%= uid %>&action=<%= action %>&rsc=<%= rsc %>');
    var options = {
        hostname: internalAccessInfo.auth.host,
        port: internalAccessInfo.auth.port,
        path: encodeURI(template(aclInfo))
    };
    sendCheckAuthorizeRequest(aclInfo, options, res, next);
}
exports.checkAuthorize = checkAuthorize;

function checkAuthorizeMulti(aclInfo, res, next) {
    var template = _.template('/checkauthorizemulti' +
        '?uid=<%= uid %>' +
        '&action=<%= action %>' +
        '&rsc=<%= rsc %>' +
        '&fsid=<%= fsid %>');
    var options = {
        hostname: internalAccessInfo.auth.host,
        port: internalAccessInfo.auth.port,
        path: encodeURI(template(aclInfo))
    };
    sendCheckAuthorizeRequest(aclInfo, options, res, next);
}
exports.checkAuthorizeMulti = checkAuthorizeMulti;

function createPolicy(policy, token, callback) {
    var data = querystring.stringify({
        name: policy.name,
        action: JSON.stringify(policy.action),
        resource: JSON.stringify(policy.resource)
    });
    var template = _.template('/webida/api/acl/createpolicy?access_token=<%= token %>');
    var options = {
        hostname: internalAccessInfo.auth.host,
        port: internalAccessInfo.auth.port,
        path: template({token: token}),
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': data.length
        }
    };
    var req;

    logger.info('createPolicy', policy);

    req = http.request(options, function (response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('createPolicy data chunk', chunk);
            data += chunk;
        });
        response.on('end', function () {
            if (response.statusCode === 200) {
                try {
                    return callback(null, JSON.parse(data).data);
                } catch (e) {
                    logger.error('Invalid createpolicy response');
                    return callback(new ServerError('Invalid createpolicy response'));
                }
            } else {
                return callback(new ServerError('createPolicy failed'),
                    policy);
            }
        });
    });

    req.on('error', function (e) {
        return callback(e);
    });

    req.write(data);

    req.end();
}
exports.createPolicy = createPolicy;

function deletePolicy(pid, token, callback) {
    var req;
    var template = _.template('/webida/api/acl/deletepolicy?access_token=<%= token %>&pid=<%= pid %>');
    var options = {
        hostname: internalAccessInfo.auth.host,
        port: internalAccessInfo.auth.port,
        path: template({ token: token, pid: pid })
    };

    logger.info('deletePolicy', pid);

    req = http.request(options, function (response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('deletePolicy data chunk', chunk);
            data += chunk;
        });
        response.on('end', function () {
            if (response.statusCode === 200) {
                return callback(null, pid);
            } else {
                return callback(new ServerError('deletePolicy failed'),
                    pid);
            }
        });
    });

    req.on('error', function (e) {
        return callback(e);
    });

    req.end();
}
exports.deletePolicy = deletePolicy;

function assignPolicy(id, pid, token, callback) {
    var template = _.template('/webida/api/acl/assignpolicy?pid=<%= pid %>&user=<%= user %>&access_token=<%= token %>');
    var options = {
        hostname: internalAccessInfo.auth.host,
        port: internalAccessInfo.auth.port,
        path: template({pid: pid, user: id, token: token})
    };
    var req;
    logger.info('assignPolicy', id, pid);

    req = http.request(options, function (response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('assignPolicy data chunk', chunk);
            data += chunk;
        });
        response.on('end', function () {
            if (response.statusCode === 200) {
                return callback(null);
            } else {
                return callback(new ServerError('assignPolicy failed'));
            }
        });
    });

    req.on('error', function (e) {
        return callback(e);
    });

    req.end();
}
exports.assignPolicy = assignPolicy;

function removePolicy(pid, token, callback) {
    var template = _.template('/webida/api/acl/removepolicy?access_token=<%= token %>&pid=<%= pid %>');
    var options = {
        hostname: internalAccessInfo.auth.host,
        port: internalAccessInfo.auth.port,
        path: template({ token: token, pid: pid })
    };
    var req;

    logger.info('removePolicy', pid);

    req = http.request(options, function (response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('removePolicy data chunk', chunk);
            data += chunk;
        });
        response.on('end', function () {
            if (response.statusCode === 200) {
                return callback(null, pid);
            } else {
                return callback(new ServerError('removePolicy failed'),
                    pid);
            }
        });
    });

    req.on('error', function (e) {
        return callback(e);
    });

    req.end();
}
exports.removePolicy = removePolicy;

function getPolicy(policyRule, token, callback) {
    /* TODO: define & use another API such as getpolicy */
    var template = _.template('/webida/api/acl/getownedpolicy?access_token=<%= token %>');
    var options = {
        hostname: internalAccessInfo.auth.host,
        port: internalAccessInfo.auth.port,
        path: template({ token: token })
    };
    var req;
    logger.info('getPolicy', policyRule);
    policyRule.action = JSON.stringify(policyRule.action);
    policyRule.resource = JSON.stringify(policyRule.resource);

    req = http.request(options, function (response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('getPolicy data chunk', chunk);
            data += chunk;
        });
        response.on('end', function () {
            var policies;
            var policy = null;
            if (response.statusCode !== 200) {
                return callback(new ServerError('getPolicy failed'));
            }

            try {
                policies = JSON.parse(data).data;
            } catch (e) {
                logger.error('Invalid getownedpolicy response');
                return callback(new ServerError('Invalid getownedpolicy response'));
            }
            policies = _.filter(policies, _.matches(policyRule));
            if (policies.length) {
                policy = policies[0];
            }
            callback(null, policy);
        });
    });

    req.on('error', function (e) {
        return callback(e);
    });

    req.end();
}
exports.getPolicy = getPolicy;

function updatePolicyResource(oldPath, newPath, token, callback) {
    var req;
    var path = '/webida/api/acl/updatepolicyrsc' +
        '?src=' + oldPath +
        '&dst=' + newPath +
        '&access_token=' + token;
    var options = {
        hostname: internalAccessInfo.auth.host,
        port: internalAccessInfo.auth.port,
        path: encodeURI(path)
    };
    logger.info('updatePolicyResource', oldPath, newPath);

    req = http.request(options, function (response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.info('updatePolicyResource data chunk', chunk);
            data += chunk;
        });
        response.on('end', function () {
            if (response.statusCode === 200) {
                return callback(null);
            } else {
                return callback(new ServerError('updatePolicyResource failed'));
            }
        });
    });


    req.on('error', function (e) {
        return callback(e);
    });

    req.end();
}
exports.updatePolicyResource = updatePolicyResource;


// TODO : move this function into userdb.js, or somewhere else
// why not use fs-manager, instead?
function getFSInfo(fsid, token, callback) {
    var req;
    var path = '/webida/api/fs/' + fsid + '?access_token=' + token;
    var options = {
        hostname: internalAccessInfo.fs.host,
        port: internalAccessInfo.fs.port,
        path: path
    };
    logger.info('getFSInfo', fsid, token, options);

    req = http.request(options, function (response) {
        var data = '';
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            logger.debug('getFSInfo data chunk', chunk);
            data += chunk;
        });
        response.on('end', function () {
            if (response.statusCode === 200) {
                try {
                    return callback(null, JSON.parse(data).data);
                } catch (e) {
                    logger.error('Invalid fs response');
                    return callback(new ServerError('Invalid fs response'));
                }
            } else if (response.statusCode === 401) {
                return callback(new ClientError(401, 'Not authorized'));
            } else {
                return callback(new ServerError('Internal error while check createPolicy authority.'));
            }
        });
    });

    req.on('error', function (e) {
        return callback(e);
    });

    req.end();
}
exports.getFSInfo = getFSInfo;
