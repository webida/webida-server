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

//var config = require('../../common/conf-manager').conf;
var logger = require('../../common/log-manager');
/*var db = require('mongojs').connect(config.services.build.buildDb, ['gcm_info']);
db.gcm_info.ensureIndex({ uid: 1, regid: 1 }, { unique: true });
db.gcm_info.ensureIndex({ uid: 1 }, { unique: false });*/

var shortid = require('shortid');
var db = require('../../common/db-manager')('user', 'gcmInfo');
var dao = db.dao;

//
// gcm query
//
exports.registerGcmInfo = function (uid, regid, info, cb) {
    dao.user.$findOne({uid: uid}, function (err, user) {
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
   /* var query = { uid: uid, regid: regid, info: info };
    logger.info('query = ', query);
    db.gcm_info.save(query, function (err) {
        if (err) {
            logger.error('err : ', err);
            return cb(err);
        } else {
            return cb(null, query);
        }
    });*/
};

exports.removeGcmInfo = function (uid, regid, cb) {
    dao.user.$findOne({uid: uid}, function (err, user) {
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
    /*var query = { uid: uid, regid: regid };
    logger.info('query = ', query);
    db.gcm_info.remove(query, function (err) {
        if (err) {
            logger.error('err : ', err);
            return cb(err);
        } else {
            return cb();
        }
    });*/
};

exports.getGcmInfo = function (uid, cb) {
    dao.user.$findOne({uid: uid}, function (err, user) {
        if (err) {
            cb(err);
        } else if (user) {
            dao.gcmInfo.$find({userId: user.userId}, function (err, result) {
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
    /*var query = { uid: uid };
    logger.info('query = ', query);
    db.gcm_info.find(query, function (err, rs) {
        if (err) {
            logger.error('err : ', err);
            return cb(err);
        } else {
            logger.info('rs = ', rs);
            return cb(null, rs);
        }
    });*/
};


