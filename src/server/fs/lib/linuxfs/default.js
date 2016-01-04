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

var Container = require('../container');

function createFS(fsid, callback) {
    Container.create(fsid, callback);
}
exports.createFS = createFS;

function deleteFS(fsid, callback) {
    // remove it from batch job
    Container.destroy(fsid, false, callback);
}
exports.deleteFS = deleteFS;

function doesSupportQuota() {
    return false;
}
exports.doesSupportQuota = doesSupportQuota;

function getQuotaInfo(fsid, callback) {
    callback(new Error('Unsupported feature'));
}
exports.getQuotaInfo = getQuotaInfo;

function getQuotaLimit(fsid, callback) {
    callback(new Error('Unsupported feature'));
}
exports.getQuotaLimit = getQuotaLimit;

function setQuotaLimit(fsid, callback) {
    callback(new Error('Unsupported feature'));
}
exports.setQuotaLimit = setQuotaLimit;

function getQuotaUsage(fsid, callback) {
    callback(new Error('Unsupported feature'));
}
exports.getQuotaUsage = getQuotaUsage;

