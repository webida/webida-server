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

var path = require('path');
var URI = require('URIjs');
var logger = require('../../common/log-manager');
var utils = require('../../common/utils');
var config = require('../../common/conf-manager').conf;

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

var db = require('./webidafs-db').getDb();

/**
 * Webida FileSystem
 * @class
 */
function WebidaFS(args) {
    if (!args) {
        throw ('No arguments provided');
    } else if (typeof args === 'object') {
        this.fsid = args.fsid;
        this.fsinfo = args;
    } else {
        this.fsid = args;
        this.fsinfo = null;
    }
}
exports.WebidaFS = WebidaFS;

WebidaFS.prototype.getInfo = function (callback) {
    var self = this;
    if (this.fsinfo) {
        return callback(null, this.fsinfo);
    }
    db.$findOne({key: self.fsid}, function(err, fs){
    //db.wfs.findOne({fsid: self.fsid}, function (err, fs) {
        if (err) {
            return callback(new ServerError('Failed to get filesystem info: ' + self.fsid));
        }
        if (!fs) {
            return callback(new ClientError('Cannot find filesystem: ' + self.fsid));
        }
        self.fsinfo = fs;

        return callback(null, fs);
    });
};

WebidaFS.prototype.getRootPath = function () {
    // TOFIX this returns path ended with '/' and it looks bad.
    // Suggestion1: path.resolve(this.getFSPath('/'), '.')
    // Be careful if it affects other logic
    return this.getFSPath('/');
};
WebidaFS.prototype.getFSPath = function (pathname) {
    return path.join(config.services.fs.fsPath, this.fsid, pathname);
};
WebidaFS.prototype.getOwner = function (callback) {
    this.getInfo(function (err, fsinfo) {
        logger.debug('getOwner', arguments);
        if (err) {
            return callback(err);
        }
        return callback(null, fsinfo.owner);
    });
};
WebidaFS.getInstanceByUrl = function (wfsUrl) {
    var wfsUrlObj = URI(wfsUrl);
    //logger.debug('getPathFromUrl parsed url', wfsUrlObj);
    if (wfsUrlObj.protocol() !== 'wfs') {
        logger.info('Invalid protocol', wfsUrlObj);
        return null;
    }
    var fsid = wfsUrlObj.host();
    if (!fsid) {
        logger.info('Invalid fsid');
        return null;
    }
    return new WebidaFS(fsid);
};


