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
var db = require('../../common/db-manager')('alias', 'wfs');
var dao = db.dao;

function addAlias(ownerId, fsid, path, period, callback) {
    var aliasKey = shortid.generate();
    var expireTime = new Date(new Date().getTime() + period * 1000);

    dao.wfs.$findOne({fsid: fsid}, function (err, context) {
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
                validityPeriod: period,
                expireTime: expireTime,
                url: config.fsHostUrl + config.services.fs.fsAliasUrlPrefix + '/' + aliasKey
            };
            logger.info('addAlias', aliasInfo);
            dao.alias.$save(aliasInfo, function (err) {
                if (err) {
                    logger.info('addAlias db fail', err);
                    return callback(err);
                }
                dao.alias.$findOne({aliasId: aliasKey}, function (err, context) {
                    callback(err, context.result());
                });
            });
        } else {
            callback('Unkown WFS: ' + fsid);
        }
    });
}
exports.addAlias = addAlias;

function deleteAlias(aliasKey, callback) {
    logger.info('deleteAlias', aliasKey);
    dao.alias.$remove({key: aliasKey}, function (err) {
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
}
exports.getNumOfAliasPerOwner = getNumOfAliasPerOwner;

