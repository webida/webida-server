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

/**
 * This module exposes methods that handles extended attributes of filesystem.
 * node-ffi module is used to call function in "libattr.so".
 * node-ffi documentation says using ffi is quite slower than direct bindings(nodejs addons).
 * It needs to be considered to write a nodejs addons for libattr.
 */

var ffi = require('ffi');
var logger = require('../../common/log-manager');

var libattr = ffi.Library('libattr', {
    'getxattr': ['int', ['string', 'string', 'pointer', 'int']],
    'setxattr': ['int', ['string', 'string', 'pointer', 'int', 'int']],
    'listxattr': ['int', ['string', 'pointer', 'int']],
    'removexattr': ['int', ['string', 'string']]
});

var NULL_BUF = new Buffer(0);

/* Get extended attribute
 * @param path {String} - filepath
 * @param attr {String} - attribute name
 * @returns {String} - value of the attribute
 */
function getAttr(path, attr, callback) {
    libattr.getxattr.async(path, attr, NULL_BUF, 0, function (err, res) {
        if (err) {
            return callback(new Error('Cannot get the metadata'));
        }
        if (res === -1) {
            // TODO how to check errno? need to handle ENOATTR
            return callback(null, ''); // returning'' is not correct
        }
        var buf = new Buffer(res);
        libattr.getxattr.async(path, attr, buf, res, function (err, res) {
            if (err) {
                return callback(new Error('Cannot get the metadata'));
            }
            if (res === -1) {
                // TODO how to check errno? need to handle ENOATTR
                return callback(null, ''); // returning'' is not correct
            }
            var value = buf.toString();
            logger.info('getxattr', path, attr, value);
            callback(null, value);
        });
    });
}
exports.getAttr = getAttr;

/* Set extended attribute
 * @param path {String} - filepath
 * @param attr {String} - attribute name
 * @param value {String} - string value
 */
function setAttr(path, attr, value, callback) {
    var buf = new Buffer(value);
    libattr.setxattr.async(path, attr, buf, buf.length, 0, function (err, res) {
        logger.info('setxattr', path, attr, value, err, res);
        if (err) { return callback(err); }
        if (res === -1) {
            // TODO how to check errno?
            return callback(new Error('Failed to set xattr'));
        }
        callback(null);
    });
}
exports.setAttr = setAttr;

/* List extended attributes
 */
function listAttr(path, callback) {
    // TOIMPLEMENT
    callback(new Error('Not implemented'));

    /*
    size = libattr.listxattr('/tmp/test.txt', NULL_BUF, 0);
    buf = new Buffer(size);
    newSize = libattr.listxattr('/tmp/test.txt', buf, size);
    console.log(size, newSize, ref.readCString(buf, 0));
    */
}
exports.listAttr = listAttr;

/* Remove extended attribute
 * @param path {String} - filepath
 * @param attr {String} attribute name to remove
 */
function removeAttr(path, attr, callback) {
    // TOIMPLEMENT
    callback(new Error('Not implemented'));

    libattr.removexattr.async(path, attr, function (err, res) {
        if (err) { return callback(err); }
        if (res === -1) {
            // TODO how to check errno?
            return callback(new Error('Failed to remove xattr'));
        }
        logger.info('removexattr', path, attr);
        callback(null);
    });
}
exports.removeAttr = removeAttr;

