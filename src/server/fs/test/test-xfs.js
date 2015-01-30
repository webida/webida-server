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

var xfs;
var conf = require('../node_modules/webida-server-lib/lib/conf-manager').conf;
var qfs = require('q-io/fs');

var testFsid;
exports['Test XFS'] = {
    'setup': function (test) {
        conf.fsDb = 'mongodb://localhost:27017/webida_fs_test';
        conf.fsPath = __dirname + '/xfs';
        xfs = require('../lib/linuxfs/xfs');

        var fsid = 'fs-' + Date.now();
        testFsid = fsid;

        test.done();
    },
    'test': function (test) {
        qfs.list('/').then(function () {
            test.done();
        });
    },
    'createFS': function (test) {
        xfs.createFS(testFsid, function (e) {
            test.ok(!e, e);
            test.done();
        });
    },
    'getQuotaLimit': function (test) {
        xfs.getQuotaLimit(testFsid, function (err, limit) {
            test.ok(!err, err);
            test.ok(limit === conf.fsPolicy.fsQuotaInBytes, 'Quota limit is not properly set');
            test.done();
        });
    },
    'getQuotaUsage': function (test) {
        xfs.getQuotaUsage(testFsid, function (err, usage) {
            test.ok(!err, err);
            test.ok(usage === 0, 'Quota usage is not properly set');
            test.done();
        });
    },
    'deleteFS': function (test) {
        xfs.deleteFS(testFsid, function (e) {
            test.ok(!e, e);
            test.done();
        });
    }
};

exports['cleanup'] = function (test) {
    test.done();
};
