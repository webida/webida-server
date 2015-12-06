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

function checkDirExists(path, confPath) {
    if (!fs.statSync(path).isDirectory()) {
        throw new Error(confPath + '(' + path + ') should be a directory');
    }
    console.log('check file ' + confPath + ' : OK, exists.');
}

function checkFileExists(path, confPath) {
    if (!fs.statSync(path).isFile()) {
        throw new Error(confPath + '(' + path + ') should be a file');
    }
    console.log('checking dir ' + confPath + ' : OK, exists.');
}

function checkConfiguration(conf) {
    console.log('check configuration file : ' + module.filename);
    console.log('WEBIDA_HOME : ' + conf.home);

    checkDirExists(conf.logPath, 'conf.logPath');

    if (conf.services.auth.signup.allowSignup) {
        if(conf.services.auth.signup.emailHost === 'your.smtp.server') {
            console.warn('WARNING : conf.services.auth.signup.emailHost is not configured. server cannot send mail');
        }
    }

    // about cache configuration
    // each type must have
    //   1) expireTimePropertyName or positive ttl
    //   2) positive ttl

    Object.keys(conf.cache.types).forEach(cacheType => {
        const cacheConf = conf.cache.types[cacheType];
        const keyName = 'conf.cache.types[' + cacheType + '] ';
        const ttl = cacheConf.ttl;
        const expireTime = cacheConf.expireTime;
        if (!ttl && !expireTime) {
            throw new Error(keyName + ' should have a positive integer value ttl');
        }
    });

    // TODO : add more configuration properties
    if (conf.services.fs.container.type === 'lxc') {
        checkFileExists(conf.services.fs.container.lxc.confPath, 'conf.services.fs.container.lxc.confPath');
    }

}

exports.checkConfiguration = checkConfiguration;
