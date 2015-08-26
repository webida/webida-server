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

var logger = require('../common/log-manager');
var extend = require('../common/inherit').extend;
var utils = require('../common/utils');
var config = require('../common/conf-manager').conf; 
var db = require('../common/db-manager')('token', 'user', 'wfs');
var fs = require('../common/fs-client.js'); 

var async = require('async');
var request = require('request');

var dao = db.dao;
var adminAccount = config.services.auth.adminAccount; 
var adminToken = null; 

function deleteGuest(guest, callback) {
    // step 2-A : read deployed app list
    // step 2-B : delete each app
    // step 2-C : read all fs info
    // step 2-D : delete each fs
    // step 2-E : delete account
    var fsid;
    logger.debug('deleting guest %s (%s) start', guest.email, guest.userId);
    async.waterfall([

        // step A : read deployed app list
        function(cb) {
            logger.debug('reading deployed app list of %s', guest.email);

            request.get( {
                uri: config.appHostUrl + '/webida/api/app/myapps',
                headers: {
                    Authorization: adminToken
                },
                encoidng:null,
                json : {
                    user : { userId: guest.userId}
                }
            }, function (err, rsp, rspBody) {
                if (err) {
                    logger.err('get app infos - http client error' + err);
                    return cb('get app infos http client err' + err);
                }
                if (rsp.statusCode >= 200 && rsp.statusCode < 299) {
                    logger.info('get app infos successs ' + rsp.statusCode, rspBody);
                    cb(null, rspBody.data);
                } else {
                    cb('get app infos http server error ' + rsp.statusCode + ' ' + rspBody);
                }
            });
        },

        // step B : delete each app

        function(appInfos, cb) {
            if (!appInfos || appInfos.length < 1) {
                logger.debug('guest %s seems to have no apps to delete ', guest.userId);
                return cb(null);
            }
            callback(null);
            var q = async.queue(function (appinfo, pcb) {
                var options = {
                    uri: config.appHostUrl + '/webida/api/app/delete' + fsInfo.fsid,
                    headers: {
                        Authorization: adminToken
                    },
                    qs : {
                        appid : appinfo.appid
                    }
                };
                logger.debug('guest %s delete single app ' + options.uri);
                request.del( options, function (err, rsp, rspBody) {
                    if (err) {
                        logger.err('http client error' + err);
                        return pcb('delete app http client err' + err);
                    }
                    if (rsp.statusCode >= 200 && rsp.statusCode < 299) {
                        logger.info('delete app successed ' + rsp.statusCode + ' ' + rspBody);
                        pcb(null);
                    } else {
                        pcb('delete app http server error ' + rsp.statusCode + ' ' + rspBody);
                    }
                });
            }, 1);
            q.drain = function() {
                logger.debug('deleted all fs of guest  %s', guest.email);
                cb(null);
            }
            q.push(fsInfos, function(err, x) {
                if(err) {
                    q.kill();
                    callback(err);
                }
                logger.debug("deleted app", x);
            });
        },

        // step C : get fs list
        function(cb) {
            logger.debug('reading fs info of %s', guest.email);
            request.get( {
                uri: config.fsHostUrl + '/webida/api/fs',
                headers: {
                    Authorization: adminToken
                },
                encoidng:null,
                json : {
                    user : { userId: guest.userId}
                }
            }, function (err, rsp, rspBody) {
                if (err) {
                    logger.err('get fs info - http client error' + err);
                    return cb('delete fs http client err' + err);
                }
                if (rsp.statusCode >= 200 && rsp.statusCode < 299) {
                    logger.info('get fs info successs ' + rsp.statusCode, rspBody);
                    cb(null, rspBody.data);
                } else {
                    cb('get fs info fs http server error ' + rsp.statusCode + ' ' + rspBody);
                }
            });
        },

        // step D : delete each fs
        function(fsInfos, cb) {
            if (!fsInfos || fsInfos.length < 1) {
                logger.debug('guest %s seems to have no FS to delete ', guest.userId);
                return cb(null);
            }

            var q = async.queue(function (fsInfo, pcb) {
                var options = {
                    uri: config.fsHostUrl + '/webida/api/fs/' + fsInfo.fsid,
                    headers: {
                        Authorization: adminToken
                    }
                };
                logger.debug('guest %s delete single fs ' + options.uri);
                request.del( options, function (err, rsp, rspBody) {
                    if (err) {
                        logger.err('http client error' + err);
                        return pcb('delete fs http client err' + err);
                    }
                    if (rsp.statusCode >= 200 && rsp.statusCode < 299) {
                        logger.info('delete fs successed ' + rsp.statusCode + ' ' + rspBody);
                        pcb(null);
                    } else {
                        pcb('delete fs http server error ' + rsp.statusCode + ' ' + rspBody);
                    }
                });
            }, 1);
            q.drain = function() {
                logger.debug('deleted all fs of guest  %s', guest.email);
                cb(null);
            }
            q.push(fsInfos, function(err, x) {
               if(err) {
                   q.kill();
                   callback(err);
               }
                logger.debug("deleted a FS", x);
            });
        },

        // step E : delete account
        function(cb) {
            logger.debug('delete account of %s', guest.email);

            request.get( {
                uri: config.authHostUrl + '/webida/api/oauth/deleteaccount',
                headers: {
                    Authorization: adminToken
                },
                encoidng:null,
                qs : {
                    uid : guest.uid
                }
            }, function (err, rsp, rspBody) {
                if (err) {
                    logger.err('delete account - http client error' + err);
                    return cb('delete account http client err' + err);
                }
                if (rsp.statusCode >= 200 && rsp.statusCode < 299) {
                    logger.info('delete account successs ' + rsp.statusCode, rspBody);
                    cb(null, rspBody.data);
                } else {
                    cb('delete account http server error ' + rsp.statusCode + ' ' + rspBody);
                }
            });
        },

    ], function(err) {
        callback(err);
    })
}

var guestReaper = {
    cronTime: '0 0 3 * * *',

    jobMain: function(jobContext) {
        async.waterfall([
            function (callback) {
                if ( adminToken == null) {
                    var where = {email:adminAccount.email}; 
                    dao.token.getPersonalTokensByEmail(where, function(err, dbContext) {
                        if(err) {
                            return callback(err); 
                        }
                        var tokens = dbContext.result();
                        logger.debug('got tokens', tokens); 
                        adminToken = tokens[0].token;
                        callback(null); 
                    }); 
                } else {
                    logger.debug('already have admin token'); 
                    callback(null); 
                } 

            }, 

            function (callback) {
                var where = { 
                    prefix:config.guestMode.accountPrefix, 
                    ttl:config.guestMode.ttl
                };
                logger.debug('guest reaper step 1 : read expired guests where = ', where); 
                dao.user.findExpiredGuests(where, function(err, context) {
                    if(err) {
                        return callback(err); 
                    }
                    var guests = context.result();
                    callback(null, guests)
                }); 
            },
            function (guests, callback) {
                // TODO : add concurrency configuration.
                var q = async.queue( deleteGuest, 2); 
                q.drain = function() { 
                    logger.debug('tasks done!'); 
                    callback(null); 
                }
                q.push(guests, function(err) { 
                    // this inner callback function is called from deleteGuest, indirectly
                    if (err) {
                        logger.warn('short-cut job finish for failed task'); 
                        q.kill(); 
                        callback(err); 
                    } 
                }); 
            }
        ], function(err) {
            var elapsed = Date.now() - jobContext.runAt.getTime(); 
            if(err) {
                logger.error('job %s run %s failed. elapsed %s ms', 
                    jobContext.name, jobContext.runId, elapsed, err); 
            } else {
                logger.info('job %s run %s completed. elapsed %s ms', 
                    jobContext.name, jobContext.runId, elapsed); 
            }
        }); 
    }, 
};

exports.jd = guestReaper; 

