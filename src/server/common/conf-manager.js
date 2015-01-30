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
var argv = require('optimist').argv;
var _ = require('underscore');

var mainDir;
if (process.env.WEBIDA_DIR) {
    mainDir = process.env.WEBIDA_DIR;
} else {
    mainDir = getMainModuleDir();
    //mainDir = '../'; // getMainModuleDir();
}

console.log('Find conf relative to', mainDir);
var DEFAULT_CONF_FILE = path.resolve(mainDir, 'conf/conf.js');
var SYSTEM_DEFAULT_CONF_FILE = path.resolve(mainDir, 'conf/default-conf.js');


function getMainModuleDir() {
    var mod = module;
    while (mod.parent) {
        mod = mod.parent;
    }
    return path.dirname(mod.filename);
}

function readConf(confFile) {
    confFile = path.resolve(confFile);
    console.log('Read conf file: %s', confFile);
    try {
        return require(confFile).conf;
    } catch (e) {
        console.error(e.stack);
        return {};
    }
}

function readRoutingTable(tablePath) {
    console.log('Read routing table file: %s', tablePath);
    return require(tablePath).router;
}

var conf = {};

// System default conf file
_.extend(conf, readConf(SYSTEM_DEFAULT_CONF_FILE));

// user conf file
if (fs.existsSync(DEFAULT_CONF_FILE)) {
    _.extend(conf, readConf(DEFAULT_CONF_FILE));
}

// argv-provided conf file
var userConfFile = argv.conf;
if (userConfFile) {
    _.extend(conf, readConf(userConfFile));
}

// argv confs
var argvConf = {};
if (argv.port) {
    argvConf.port = argv.port;
}
if (argv.host) {
    argvConf.host = argv.host;
}
_.extend(conf, argvConf);
console.log('Argv confs', argvConf);

// read routing table file
if(conf.routingTablePath) {
    _.extend(conf, {'routingTable': readRoutingTable(conf.routingTablePath)});
    console.log('routingTable', conf.routingTable);
}

// set conf
exports.conf = conf;
console.log('Final confs', exports.conf);
