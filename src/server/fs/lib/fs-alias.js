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

var shortid = require('shortid');

var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;
var db = require('./webidafs-db').getDb();

/*var aliasCol = db.collection('alias');
aliasCol.ensureIndex({owner: 1});
aliasCol.ensureIndex({key: 1}, {unique: true});
aliasCol.ensureIndex({expireDate: 1}, {expireAfterSeconds: 0});*/

var db = require('../../common/db-manager')('alias', 'wfs');
var dao = db.dao;

function addAlias(ownerId, fsid, path, expireTime, callback) {
    var aliasKey = shortid.generate();
    var expireDate = new Date(new Date().getTime() + expireTime * 1000);

    dao.wfs.$findOne({wfsId: fsid}, function (err, context) {
        var wfsInfo = context.result();
        if (err) {
            logger.info('addAlias db fail', err);
            return callback(err);
        } else if (wfsInfo) {
            var aliasInfo = {
                aliasId: aliasKey,
                key: aliasKey,
                ownerId: ownerId,
                wfsId: wfsInfo.wfsId,
                path: path,
                validityPeriod: expireTime,
                expireDate: expireDate,
                url: config.fsHostUrl + config.services.fs.fsAliasUrlPrefix + '/' + aliasKey
            };
            logger.info('addAlias', aliasInfo);
            dao.alias.$save(aliasInfo, function (err) {
                if (err) {
                    logger.info('addAlias db fail', err);
                    return callback(err);
                }
                callback(null, aliasInfo);
            });
        } else {
            callback('Unkown WFS: ' + fsid);
        }
    });

    /*var aliasInfo = {
        _id: aliasKey,
        key: aliasKey,
        owner: owner,
        fsid: fsid,
        path: path,
        expireTime: expireTime,
        expireDate: expireDate,
        url: config.fsHostUrl + config.services.fs.fsAliasUrlPrefix + '/' + aliasKey
    };
    logger.info('addAlias', aliasInfo);
    aliasCol.save(aliasInfo, function (err) {
        if (err) {
            logger.info('addAlias db fail', err);
            return callback(err);
        }
        callback(null, aliasInfo);
    });*/
}
exports.addAlias = addAlias;

function deleteAlias(aliasKey, callback) {
    logger.info('deleteAlias', aliasKey);
    dao.alias.$remove({key: aliasKey}, function(err){
    //aliasCol.remove({key: aliasKey}, function (err) {
        if (err) {
            logger.info('deleteAlias db fail', err);
            return callback(err);
        }
        callback(null);
    });
}
exports.deleteAlias = deleteAlias;

function getAliasInfo(aliasKey, callback) {
    dao.alias.$findOne({key: aliasKey}, function (err, context) {
        var aliasInfo = context.result();
        //aliasCol.findOne({key: aliasKey}, function (err, aliasInfo) {
        if (err) {
            logger.info('getAlias db fail', err);
            return callback(err);
        }
        logger.info('getAliasInfo', aliasKey, aliasInfo);
        callback(null, aliasInfo);
    });
}
exports.getAliasInfo = getAliasInfo;

function getNumOfAliasPerOwner(userId, callback) {
    dao.alias.$count({ownerId: userId}, function(err, context){
        callback(err, context.result());
    });
    /*aliasCol.count({owner: uid}, function (err, count) {
        if (err) { return callback(err); }
        callback(null, count);
    });*/
}
exports.getNumOfAliasPerOwner = getNumOfAliasPerOwner;

