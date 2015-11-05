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

var util = require('util');
var fs = require('fs');
var crypto = require('crypto');
var request = require('request');

var logger = require('./log-manager');
var conf = require('./conf-manager').conf;

exports.getSha256Digest = function (data) {
    var shasum = crypto.createHash('sha256');
    shasum.update(data);
    return shasum.digest('base64');
};

exports.copyFile = function (source, target, cb) {
    var cbCalled = false;

    var rd = fs.createReadStream(source);
    rd.on('error', function (err) {
        done(err);
    });
    var wr = fs.createWriteStream(target);
    wr.on('error', function (err) {
        done(err);
    });
    wr.on('close', function () {
        done();
    });
    rd.pipe(wr);

    function done(err) {
        if (!cbCalled) {
            cb(err);
            cbCalled = true;
        }
    }
};

function ClientError(statusCode, message) {
    if (!message) {
        this.message = statusCode;
        this.statusCode = 400;
    } else {
        this.message = message;
        this.statusCode = statusCode;
    }
    Error.call(this); //super constructor
    Error.captureStackTrace(this, this.constructor); //super helper method to include stack trace in error object
    this.name = this.constructor.name; //set our function’s name as error name.
}
util.inherits(ClientError, Error);
exports.ClientError = ClientError;

function ServerError(statusCode, message) {
    if (!message) {
        this.message = statusCode;
        this.statusCode = 500;
    } else {
        this.message = message;
        this.statusCode = statusCode;
    }
    Error.call(this); //super constructor
    Error.captureStackTrace(this, this.constructor); //super helper method to include stack trace in error object
    this.name = this.constructor.name; //set our function’s name as error name.
}
util.inherits(ServerError, Error);
exports.ServerError = ServerError;

exports.err = function (name, message) {
    return {name: name, message: message};
};

exports.ok = function (data) {
    if (undefined === data) {
        return JSON.stringify({result: 'ok'});
    } else {
        return JSON.stringify({result: 'ok', data: data});
    }
};
exports.fail = function (reason) {
    if (reason instanceof Error) {
        reason = reason.toString();
    }
    return JSON.stringify({result: 'failed', reason: reason});
};

/* Middleware that extends Response object with sendfail() and sendok() methods */
exports.senders = function (req, res, next) {
    /* If error is ClientError or ServerError, use its message as dafault.
     * If error is ServerError and serverReason is set, serverReason is used.
     * So set serverReason with general message without sensitive internal server info. 
     */
    res.sendfail = function (error, serverReason) {
        var reason; 
        var statusCode;

        if (error instanceof Error) {
            reason = error.toString();
            if (error.statusCode) {
                statusCode = error.statusCode;
            } else {
                statusCode = 500;
            }
        } else { 
            // not an error object
            reason = error;
            statusCode = 500;
        }

        if (error instanceof ServerError) {
            if (serverReason) {
                reason = serverReason;
            } 
        }
        logger.info('reason = ', reason, '; status code = ', statusCode);
        res.status(statusCode).send(JSON.stringify({result: 'failed', reason: reason}));
    };
    res.sendok = function (data, jsonp) {
        if (jsonp) {
            res.jsonp(data);
        } else {
            res.send(exports.ok(data));
        }
    };
    res.sendErrorPage = function(statusCodeOrError, reason){
        var err = {};
        if (statusCodeOrError instanceof Error) {
            err.statusCode = statusCodeOrError.statusCode || 500;
            err.reason = statusCodeOrError.message;
        } else {
            err.statusCode = statusCodeOrError;
            err.reason = reason;
        }
        res.status(err.statusCode).render('error', err);
    };
    
    next();
};

/* Global error handler that first handled the error */
exports.onConnectError = function (err, req, res, next) {
    if(err) {
        logger.error('Unhandled Error', err, err.stack);
        if (err instanceof ServerError || err instanceof ClientError) {
            res.sendfail(err);
        } else {
            res.end('Failed');
        }
    } else {
        next();
    }
};

// Request the uid matching with usernmae to the auth server.
// Create temporary api "getuid" because addNewFS is called without login currently.
// Should be removed later.
exports.getUID = function (email, cb) {
    var options = {};
    options.uri = conf.authHostUrl + '/webida/api/oauth/userinfo/' + '?email=' + email;
    options.strictSSL = false;

    request(options, function (err, res, body) {
        if (err) {
            return cb(err);
        }

        try {
            var data = JSON.parse(body);
            if (res.statusCode == 200) {
                logger.info('getuid', email, data.data.uid);
                return cb(null, parseInt(data.data.uid));
            } else {
                return cb(res.statusCode, data);
            }
        } catch (e) {
            return cb(new Error('Invalid response:', body));
        }
    });
};

// Request the username matching with uid to the auth server.
// Create temporary api "getuid" because addNewFS is called without login currently.
// Should be removed later.
exports.getEmail = function (uid, cb) {
    var options = {};
    options.uri = conf.authHostUrl + '/webida/api/oauth/userinfo/' + '?uid=' + uid;
    options.strictSSL = false;

    request(options, function (err, res, body) {
        if (err) {
            return cb(err);
        }

        try {
            var data = JSON.parse(body);
            if (res.statusCode == 200) {
                logger.info('get email', uid, data.data.email);
                return cb(null, data.data.email);
            } else {
                return cb(res.statusCode, data);
            }
        } catch (e) {
            return cb(new Error('Invalid response:', body));
        }
    });
};

/* This returns a middleware that keeps connection for long time.
 * The middleware sends 100-continue responses at interval(in secs) rate for the current request for timeout(secs).
 * If timeout is not specified or is 0, there's no timeout.
 * Minimum interval is 5 secs. If interval is not specified, default is 60 secs.
 * keepConnect([interval, [timeout]])
 * It's useful when server will start to send response after a long time(more than browser timeout. 2min in Chrome).
 * Such request will be disconnected by client and this middleware prevents it.
 * This implementation does not exactly comply with RFC2616 because this sends 100-continue regardless of expect header.
 * But most browsers support this. See RFC2616 8.2.3, RFC2068 8.2
 */ 
exports.keepConnect = function (interval, timeout) {
    return function (req, res, next) {
        if (!timeout) {
            timeout = 0;
        }
        if (!interval) {
            interval = 60;
        }
        if (interval < 5) {
            interval = 5;
        }
        var timer = setInterval(function () {
            res.writeContinue();
        }, interval * 1000);
        var cleared = false;

        if (timeout !== 0) {
            setTimeout(function () {
                if (!cleared) {
                    clearInterval(timer);
                    cleared = true;
                }
            }, timeout * 1000);
        }

        res.on('finish', function () {
            if (!cleared) {
                clearInterval(timer);
                cleared = true;
            }
        });
        next();
    };
};

