require([
    './webida-0.3',
    './config',
    './lib/async'
],
function(webida, conf, async) {
    'use strict';

    var FS = {};
    var testDir = '/testPath/testDir';
    var testDir2 = testDir + '/testDir2';
    var testFile = testDir + '/testFile.js';
    var testFile2 = testDir2 + '/testFile2.js';
    var testFileData = 'This is the file to test writeFile() api.';
    var incorrectPath = '/incorrect/path/file.js';
    var testMeta = 'testMeta';
    var testMetaData = 'test meta data';
    var testAlias = {};
    var testAlias2 = {};
    var testZipFile = testDir + '/testZipFile.zip';
    var isTestFSCreated = false;

    function validateToken(token) {
        console.log('validateToken', token);
        return false;
    }

    function generateNewToken(cb) {
        cb(conf.personalToken2); // use testUser2 account to test FSService api
    }

    var gen = {
        validateToken: validateToken,
        generateNewToken: generateNewToken
    };

    QUnit.config.reorder = false;
    QUnit.config.testTimeout = 30000;

    console.log('FS api unit test start. ', webida.conf.fsApiBaseUrl);

    QUnit.module('FileSystem module');

    QUnit.test('initAuth test', function(assert) {
        var done = assert.async();

        webida.auth.initAuth('anything', 'anything', gen, function(sessionID) {
            assert.notEqual(sessionID, null, 'initAuth success check');
            console.log('initAuth check done');
            done();
        });
    });

    QUnit.test('setup for FileSystem module test', function(assert) {
        var done = assert.async();

        webida.fs.getMyFSInfos(function(err, fsinfoArr) {
            if (err) {
                assert.ok(false, 'getMyFSInfos for fs test failed.');
                done();
            } else if (fsinfoArr.length === 0) {
                webida.fs.addMyFS(function(err, fsinfo) {
                    assert.equal(err, undefined, 'addMyFS success check');
                    console.log('addMyFS check done', fsinfo);
                    isTestFSCreated = true;
                    done();
                });
            } else {
                assert.ok(true, 'getMyFSInfos FS is already created.');
                done();
            }
        });
    });

    QUnit.test('getMyFS test', function(assert) {
        var done = assert.async();

        webida.fs.getMyFS(function(err, fsObj) {
            assert.equal(err, undefined, 'getMyFS success check');
            console.log('getMyFS check done', err, fsObj);
            FS = fsObj;
            done();
        });
    });

    // FS test

    QUnit.test('getQuotaLimit test', function(assert) {
        var done = assert.async();

        FS.getQuotaLimit(function(err, limit) {
            assert.equal(err, undefined, 'getQuotaLimit success check');
            console.log('getQuotaLimit check done', limit);
            done();
        });
    });

    QUnit.test('getQuotaUsage test', function(assert) {
        var done = assert.async();

        FS.getQuotaUsage(function(err, usage) {
            assert.equal(err, undefined, 'getQuotaUsage success check');
            console.log('getQuotaUsage check done', usage);
            done();
        });
    });

    QUnit.test('createDirectory test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.createDirectory(testDir2, false, function(err) {
            assert.notEqual(err, undefined, 'createDirectory fail check');
            console.log('createDirectory fail check done(no recursive)');
            done();
        });

        FS.createDirectory(testDir, true, function(err) {
            assert.equal(err, undefined, 'createDirectory success check');
            console.log('createDirectory check done');
            done2();
        });
    });

    QUnit.test('writeFile test', function(assert) {
        var done = assert.async();

        FS.writeFile(testFile, testFileData, function(err) {
            assert.equal(err, undefined, 'writeFile success check');
            console.log('writeFile check done');
            done();
        });

        // TODO : Test writing the file type data and blob type data.
    });

    QUnit.test('exists test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();
        var done3 = assert.async();

        FS.exists(testFile, function(err, result) {
            assert.equal(err, undefined, 'exists true check');
            assert.ok(result, 'exists true check');
            console.log('exists true check done', testFile, result);
            done();
        });

        FS.exists(incorrectPath, function(err, result) {
            assert.equal(err, undefined, 'exists false check');
            assert.notOk(result, 'exists false check');
            console.log('exists false check done', incorrectPath, result);
            done2();
        });

        FS.exists(testDir, function(err, result) {
            assert.equal(err, undefined, 'exists dir success check');
            assert.ok(result, 'exists dir check');
            console.log('exists dir check done', testDir, result);
            done3();
        });
    });

    QUnit.test('readFile test', function(assert) {
        var done = assert.async();

        FS.readFile(testFile, function(err, data) {
            assert.equal(err, undefined, 'readFile success check');
            assert.equal(data, testFileData, 'readFile data check');
            console.log('readFile check done', testFile, data);
            done();
        });
    });

    QUnit.test('copy test', function(assert) {
        var done = assert.async();

        FS.copy(testFile, testDir + '/newTestFile.js', function(err) {
            assert.equal(err, undefined, 'copy success check');
            console.log('copy check done', testFile + ' to ' + testDir + '/newTestFile.js');
            done();
        });
    });

    QUnit.test('isDirectory test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.isDirectory(testDir, function(err, result) {
            assert.equal(err, undefined, 'isDirectory true check');
            assert.ok(result, 'isDirectory true check');
            console.log('isDirectory true check done', testDir, result);
            done();
        });

        FS.isDirectory(testFile, function(err, result) {
            assert.equal(err, undefined, 'isDirectory false check');
            assert.notOk(result, 'isDirectory false check');
            console.log('isDirectory false check done', testFile, result);
            done2();
        });
    });

    QUnit.test('isFile test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.isFile(testDir, function(err, result) {
            assert.equal(err, undefined, 'isFile false check');
            assert.notOk(result, 'isFile false check');
            console.log('isFile false check done', testDir, result);
            done();
        });

        FS.isFile(testFile, function(err, result) {
            assert.equal(err, undefined, 'isFile true check');
            assert.ok(result, 'isFile true check');
            console.log('isFile true check done', testFile, result);
            done2();
        });
    });

    QUnit.test('isEmpty test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();
        var done3 = assert.async();

        FS.isEmpty(testDir, function(err, result) {
            assert.equal(err, undefined, 'isEmpty dir false check');
            assert.notOk(result, 'isEmpty dir false check');
            console.log('isEmpty dir false check done', testDir, result);
            done();
        });

        FS.isEmpty(testFile, function(err, result) {
            assert.notEqual(err, undefined, 'isEmpty file false check');
            console.log('isEmpty file false check done', testFile, result);
            done2();
        });

        async.series([
            function(callback) {
                FS.createDirectory(testDir2, function(err) {
                    assert.equal(err, undefined, 'isEmpty createDirectory success check');
                    console.log('isEmpty true check done', testDir2);
                    return callback(err);
                });
            }, function(callback) {
                FS.isEmpty(testDir2, function(err, result) {
                    assert.equal(err, undefined, 'isEmpty dir true check');
                    assert.ok(result, 'isEmpty dir true check');
                    console.log('isEmpty dir true check done', testDir2, result);
                    return callback(err);
                });
            }
        ], function(err) {
            if(err) {
                assert.ok(false, 'isEmpty true check failed.');
            } else {
                assert.ok(true, 'isEmpty true check successed.');
            }
            console.log('isEmpty true check done');
            done3();
        });
    });

    QUnit.test('list test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();
        var done3 = assert.async();
        var done4 = assert.async();

        FS.list(incorrectPath, function(err, listInfoArr) {
            assert.notEqual(err, undefined, 'list incorrect path fail check');
            console.log('list check done', incorrectPath, listInfoArr);
            done();
        });

        FS.list(testFile, function(err, listInfoArr) {
            assert.notEqual(err, undefined, 'list file fail check');
            console.log('list file check done(should be directory)', testFile, listInfoArr);
            done2();
        });

        FS.list(testDir2, function(err, listInfoArr) {
            assert.equal(err, undefined, 'list dir success check');
            console.log('list dir check done', testDir2, listInfoArr);
            done3();
        });

        FS.list(testDir, true, function(err, listInfoArr) {
            assert.equal(err, undefined, 'list dir recursive success check');
            console.log('list dir recursive check done', testDir, listInfoArr);
            done4();
        });
    });

    QUnit.test('listEx test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.listEx(testDir, {dirOnly:true}, function(err, listInfoArr) {
            assert.equal(err, undefined, 'listEx dirOnly success check');
            console.log('listEx dirOnly check done', testDir, listInfoArr);
            done();
        });

        FS.listEx(testDir, {fileOnly:true}, function(err, listInfoArr) {
            assert.equal(err, undefined, 'listEx fileOnly success check');
            console.log('listEx fileOnly check done', testDir, listInfoArr);
            done2();
        });
    });

    QUnit.test('stat test', function(assert) {
        var done = assert.async();

        FS.stat([testDir, testFile, testDir2], function(err, statInfoArr) {
            assert.equal(err, undefined, 'stat success check');
            assert.equal(statInfoArr.length, 3, 'stat result number check');
            console.log('stat check done', statInfoArr);
            done();
        });
    });

    QUnit.test('lockFile test', function(assert) {
        var done = assert.async();

        FS.lockFile(testFile, function(err) {
            assert.equal(err, undefined, 'lockFile success check');
            console.log('lockFile check done', testFile);
            done();
        });
    });

    QUnit.test('getLockedFiles test', function(assert) {
        var done = assert.async();

        FS.getLockedFiles(testDir, function(err, lockInfoArr) {
            assert.equal(err, undefined, 'getLockedFiles success check');
            assert.equal(lockInfoArr.length, 1, 'getLockedFiles count check');
            assert.equal(lockInfoArr[0].path, testFile, 'getLockedFiles lockInfo check');
            console.log('getLockedFiles check done', testDir, lockInfoArr);
            done();
        });
    });

    QUnit.test('delete test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();
        var done3 = assert.async();
        var done4 = assert.async();

        FS.delete(incorrectPath, function(err) {
            assert.notEqual(err, undefined, 'delete incorrect path check');
            console.log('delete incorrect path check done', incorrectPath);
            done();
        });

        FS.delete(testFile, function(err) {
            assert.notEqual(err, undefined, 'delete locked file check');
            console.log('delete locked file check done', testFile);
            done2();
        });

        FS.delete(testDir, function(err) {
            assert.notEqual(err, undefined, 'delete locked dir check');
            console.log('delete locked dir check done', testDir);
            done3();
        });

        async.series([
            function(callback) {
                FS.createDirectory(testDir2, function(err) {
                    assert.equal(err, undefined, 'delete createDirectory success check');
                    console.log('delete createDirectory check done', testDir2);
                    return callback(err);
                });
            }, function(callback) {
                FS.writeFile(testFile2, testFileData, function(err) {
                    assert.equal(err, undefined, 'delete writeFile success check');
                    console.log('delete writeFile check done', testFile2);
                    return callback(err);
                });
            }, function(callback) {
                FS.delete(testFile2, function(err) {
                    assert.equal(err, undefined, 'delete file check');
                    console.log('delete file check done', testFile2);
                    return callback(err);
                });
            }, function(callback) {
                FS.delete(testDir2, function(err) {
                    assert.equal(err, undefined, 'delete dir check');
                    console.log('delete dir check done', testDir2);
                    return callback(err);
                });
            }
        ], function(err) {
            if(err) {
                assert.ok(false, 'delete file check failed.');
            } else {
                assert.ok(true, 'delete file check successed.');
            }
            console.log('delete filecheck done');
            done4();
        });

    });

    QUnit.test('move test1', function(assert) {
        var done = assert.async();

        async.series([
            function(callback) {
                FS.createDirectory(testDir2, function(err) {
                    assert.equal(err, undefined, 'move createDirectory check');
                    console.log('move createDirectory check done', testDir2);
                    return callback(err);
                });
            }, function(callback) {
                FS.move(testFile, testFile2, function(err) {
                    assert.notEqual(err, undefined, 'move locked file fail check');
                    console.log('move locked file check done', testFile, testFile2);
                    if (err) {
                        return callback(null);
                    } else {
                        return callback('move locked file success');
                    }
                });
            }
        ], function(err) {
            if(err) {
                assert.ok(false, 'move locked file check failed.');
            } else {
                assert.ok(true, 'move locked file check successed.');
            }
            console.log('move locked file check done');
            done();
        });
    });

    QUnit.test('unlockFile test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.unlockFile(testDir2, function(err) {
            assert.equal(err, undefined, 'unlockFile not locked dir check');
            console.log('unlockFile not locked dir check done', testDir2);
            done();
        });

        FS.unlockFile(testFile, function(err) {
            assert.equal(err, undefined, 'unlockFile locked file check');
            console.log('unlockFile locked file check done', testFile);
            done2();
        });
    });

    QUnit.test('move test2', function(assert) {
        var done = assert.async();

        FS.move(testFile, testFile2, function(err) {
            assert.equal(err, undefined, 'move file check');
            console.log('move file check done', testFile, testFile2);
            done();
        });
    });

    QUnit.test('setMeta test', function(assert) {
        var done = assert.async();

        FS.setMeta(testFile2, testMeta, testMetaData, function(err) {
            assert.equal(err, undefined, 'setMeta success check');
            console.log('setMeta check done', testFile2, testMeta, testMetaData);
            done();
        });
    });

    QUnit.test('getMeta test', function(assert) {
        var done = assert.async();

        FS.getMeta(testFile2, testMeta, function(err, data) {
            assert.equal(err, undefined, 'getMeta success check');
            assert.equal(data, testMetaData, 'getMeta data check');
            console.log('getMeta check done', testFile2, testMeta, data);
            done();
        });
    });

    // TODO : searchFiles

    QUnit.test('addAlias test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.addAlias(testFile2, 1, function(err, aliasInfo) {
            assert.equal(err, undefined, 'addAlias with 1 second check');
            console.log('addAlias with 1 second check done', testFile2, aliasInfo);
            testAlias = aliasInfo;
            done();
        });

        FS.addAlias(testDir2, 60*60, function(err, aliasInfo) {
            assert.equal(err, undefined, 'addAlias with 1 hour check');
            console.log('addAlias with 1 hour check done', testDir2, aliasInfo);
            testAlias2 = aliasInfo;
            done2();
        });
    });

    QUnit.test('getAliasInfo test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.getAliasInfo(testAlias.key, function(err, aliasInfo) {
            assert.notEqual(err, undefined, 'getAliasInfo 1 success check');
            console.log('getAliasInfo 1 check done(should be expired)', testAlias.key, aliasInfo);
            done();
        });

        FS.getAliasInfo(testAlias2.key, function(err, aliasInfo) {
            assert.equal(err, undefined, 'getAliasInfo 2 success check');
            assert.deepEqual(aliasInfo, testAlias2, 'getAliasInfo 2 alias info check');
            console.log('getAliasInfo 2 check done', testAlias2.key, aliasInfo);
            done2();
        });
    });

    QUnit.test('deleteAlias test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.deleteAlias(testAlias.key, function(err) {
            assert.notEqual(err, undefined, 'deleteAlias 1 success check');
            console.log('deleteAlias 1 check done(should be expired)', testAlias.key);
            done();
        });

        FS.deleteAlias(testAlias2.key, function(err) {
            assert.equal(err, undefined, 'deleteAlias 2 success check');
            console.log('deleteAlias 2 check done', testAlias2.key);
            done2();
        });
    });

    QUnit.test('createZip test', function(assert) {
        var done = assert.async();

        FS.createZip([testDir], testZipFile, function(err) {
            assert.equal(err, undefined, 'createZip success check');
            console.log('createZip check done', testDir, testZipFile);
            done();
        });
    });

    QUnit.test('extractZip test', function(assert) {
        var done = assert.async();
        var stat1 = {};

        async.waterfall([
            function(callback) {
                FS.stat([testDir], function(err, statInfoArr) {
                    assert.equal(err, undefined, 'before extractZip stat check');
                    console.log('before extractZip stat check done', testDir, statInfoArr);
                    return callback(err, statInfoArr);
                });
            }, function(stats, callback) {
                FS.extractZip(testZipFile, testDir2, function(err) {
                    assert.equal(err, undefined, 'extractZip success check');
                    console.log('extractZip check done', testZipFile, testDir2);
                    return callback(err, stats);
                });
            }, function(stats, callback) {
                FS.stat([testDir2 + '/testDir'], function(err, statInfoArr) {
                    assert.equal(err, undefined, 'after extractZip stat success check');
                    assert.equal(stats[0].name, statInfoArr[0].name, 'extractZip stat check');
                    assert.equal(stats[0].size, statInfoArr[0].size, 'extractZip stat check');
                    console.log('after extractZip stat check done', statInfoArr);
                    return callback(err);
                });
            }
        ], function(err) {
            if(err) {
                assert.ok(false, 'extractZip check failed.');
            } else {
                assert.ok(true, 'extractZip check successed.');
            }
            console.log('extractZip check done');
            done();
        });
    });

    QUnit.test('exportZip test', function(assert) {
        var testExportZip = FS.exportZip([testDir], 'testExportZip.zip');
        assert.ok(!testExportZip, 'exportZip success check');
        console.log('exportZip check done', testDir);
    });

    /*
    // QUnit.config.testTimeout
    QUnit.test('exec test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        var exec_info1 = {
            cmd:'git',
            args:[
                'clone',
                'https://github.com/webida/webida-server'
            ]
        };

        var exec_info2 = {
            cmd:'ssh-keygen',
            args:[]
        };

        FS.exec('./', exec_info1, function(err, log) {
            assert.equal(err, undefined, 'exec(git) success check');
            console.log('exec(git) check done', log);
            done();
        });

        FS.exec('./', exec_info2, function(err, log) {
            assert.equal(err, undefined, 'exec(ssh-keygen) success check');
            console.log('exec(ssh-keygen) check done', log);
            done2();
        });
    });
    */

    QUnit.test('cleanup after FileSystem module test', function(assert) {
        if (isTestFSCreated) {
            var done = assert.async();

            webida.fs.deleteFS(FS.fsid, function(err) {
                assert.equal(err, undefined, 'deleteFS success check');
                console.log('deleteFS check done', FS.fsid);
                done();
            });
        }
    });
    // TODO : getFileLink, getFileLinkByPath
    // TODO : getKeystoreList, registerKeystoreFile, removeKeystoreFile
});
