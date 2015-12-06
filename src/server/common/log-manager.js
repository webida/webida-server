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
var factory = require ('./logger-factory.js')
var logger = factory.getLogger();
var accessLogger = factory.getLogger('access'); 

module.exports = logger;

// we should remove following ugly hacks
module.exports.stream = {
    write: function(msg/*, encoding*/) {
        accessLogger.info(msg);
    }
};

module.exports.simpleLogger = function (tagMessage) {
    return function (req, res, next) {
        var loggingText = tagMessage;
        if (req.ip) { loggingText = loggingText + ' : ' + req.ip; }
        if (req.method) { loggingText = loggingText + ' : ' + req.method; }
        if (req.url) { loggingText = loggingText + ' : ' + req.url; }
        accessLogger.debug(loggingText);
        next();
    };
};

