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

'use strict'

var Path = require('path');
var URI = require('URIjs');
var express = require('express.io');
var cuid = require('cuid');

var authMgr = require('../../common/auth-manager');
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;


var CliErr = utils.ClientError;
var SvrErr = utils.ServerError;


var router = new express.Router();
module.exports.router = router;

//authMgr.init(config.jmDb);


//
// build functions
//
var parseParam = function (req, res, next) {
    console.log('query = ', req.query);
    console.log('params = ', req.params);

    req.projPath = path.join(options.workPath, req.params.usn, req.params.ws, req.params.pj, req.params.pf, req.params.pj);
    req.filePath = req.params[0];
    console.log('project dir = ', req.projPath);
    next();
}

module.exports.parseParam = parseParam;
module.exports.verifyToken = authMgr.verifyToken;

