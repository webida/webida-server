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

var fs = require('fs');
var path = require('path');
var _ = require('lodash');

var logger = require('./logger-factory').getLogger('conf');
var mainDir = require('./mod').getMainModuleDir(module);

logger.debug('Finding conf files relative to', mainDir);

var CONF_FILE = path.resolve(mainDir, 'conf/conf.js');
var DEFAULT_CONF_FILE = path.resolve(mainDir, 'conf/default-conf.js');

function readConf(confFilePath) {
    if (!confFilePath) {
        return {};
    }
    confFilePath = path.resolve(confFilePath);
    logger.info('Read conf file: %s', confFilePath);
    try {
        if (!fs.existsSync(CONF_FILE)) {
            return {};
        }
        return require(confFilePath).conf;
    } catch (e) {
        logger.error('error while reading conf file ' + confFilePath, e);
        return {};
    }
}

function readRoutingTable(tablePath) {
    logger.info('Read routing table file: %s', tablePath);
    return require(tablePath).router;
}

var conf = {};

// System default conf file
var defaultConfObject = readConf(DEFAULT_CONF_FILE);
var confObject = readConf(CONF_FILE);
_.extend(conf, defaultConfObject, confObject);
if (Object.keys(conf).length < 1) {
    logger.error ('no configuration file found');
    process.exit(-1);
}

// read routing table file
if(conf.routingTablePath) {
    _.extend(conf, {'routingTable': readRoutingTable(conf.routingTablePath)});
    logger.debug('added routingTable %j' , conf.routingTable);
}

// set conf
exports.conf = conf;
logger.info('final configuration object %j', exports.conf);
