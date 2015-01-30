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

var logger = require('../../common/log-manager');
var fs = require('fs');
var mkdirp = require('mkdirp');
var Path = require('path');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var domUtil = require('jsdom')


var dbgId = 'debugscript'

module.exports.injectDebugScript = function(filePath, scriptSrc, cb) {
    logger.info('insert debug script');
    fs.readFile(filePath, 'utf8', function (err, html) {
        if (err) {
            logger.error(err);
            return cb(err);
        }

        var n = html.indexOf(scriptSrc);
        if (n !== -1) {
            return cb(null);
        }

        var document = domUtil.jsdom(html, null);
        var window = document.createWindow();
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = scriptSrc; 
        script.id = dbgId;
        if (!document.head) {
            return cb(new Error('document header does not exist'));
        }

        document.head.appendChild(script);
        //logger.info(window.document.outerHTML);

        fs.writeFile(filePath, window.document.outerHTML, function (err) {
            if (err) {
                logger.error(err);
                cb(err);
            } else {
                logger.info('the file was saved');
                cb(null);
            }
        });
    });
}


function removeElement(dom, eId) {
    var element = dom.getElementById(eId);
    return (element) ? element.parentNode.removeChild(element) : false;
}

module.exports.removeDebugScript = function(filePath, scriptSrc, cb) {
    logger.info('remove debug script');
    fs.readFile(filePath, 'utf8', function (err, html) {
        if (err) {
            logger.error(err);
            return cb(err);
        }

        var n = html.indexOf(scriptSrc);
        if (n === -1) {
            return cb(null);
        }

        var doc = domUtil.jsdom(html, null);
        if (!doc) {
            return cb(new Error('invlid document object'));
        }
        
        removeElement(doc, dbgId);
        fs.writeFile(filePath, doc.outerHTML, function (err) {
            if (err) {
                logger.error(err);
                cb(err);
            } else {
                logger.info('the file was saved');
                cb(null);
            }
        });
        //return (removeElement(doc, dbgId)) ? cb(null) : cb(new Error('element does not exist'));
    });
}


