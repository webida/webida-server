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

var logger = require('../../common/log-manager');
var shortid = require('shortid');
var db = require('../../common/db-manager')('user', 'gcmInfo');
var dao = db.dao;

//
// gcm query
//
exports.registerGcmInfo = function (uid, regid, info, cb) {
    dao.user.$findOne({uid: uid}, function (err, context) {
        var user = context.result();
        if (err) {
            cb(err);
        } else if (user) {
            var query = {gcmInfoId: shortid.generate(), userId: user.userId, regid: regid, info: info};
            dao.gcmInfo.$save(query, function (err) {
                if (err) {
                    cb(err);
                } else {
                    cb(null, query);
                }
            });
        } else {
            cb('Unkown User');
        }
    });
};

exports.removeGcmInfo = function (uid, regid, cb) {
    dao.user.$findOne({uid: uid}, function (err, context) {
        var user = context.result();
        if (err) {
            cb(err);
        } else if(user) {
            dao.gcmInfo.$remove({userId: user.userId, regid: regid}, function (err) {
                if (err) {
                    cb(err);
                } else {
                    cb();
                }
            });
        } else {
            cb('Unkown User');
        }
    });
};

exports.getGcmInfo = function (uid, cb) {
    dao.user.$findOne({uid: uid}, function (err, context) {
        var user = context.result();
        if (err) {
            cb(err);
        } else if (user) {
            dao.gcmInfo.$find({userId: user.userId}, function (err, context) {
                var result = context.result();
                if (err) {
                    logger.error('err : ', err);
                    cb(err);
                } else {
                    logger.info('rs = ', result);
                    cb(null, result);
                }
            });
        } else {
            cb('Unkown User');
        }
    });
};


