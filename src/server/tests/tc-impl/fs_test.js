require([
    './webida-0.3',
    './config',
    './lib/async'
],
function(webida, conf, async) {
    'use strict';

    var FS;
    var testDir = '/testPath/testDir';
    var testDir2 = testDir + '/testDir2';
    var testFile = testDir + '/testFile.js';
    var testFile2 = testDir2 + '/testFile2.js';
    var testFileData = 'This is the file to test writeFile() api.';
    var incorrectPath = '/incorrect/path/file.js';
    var testMeta = 'testMeta';
    var testMetaData = 'test meta data';
    var testAlias;
    //var testZipFile = testDir + '/testZipFile.zip';
    var isTestFSCreated = false;

    var logger = window.logger;

    function validateToken(token) {
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

    logger.log('[fs] FS api unit test start. ', webida.conf.fsApiBaseUrl);

    QUnit.module('FileSystem module');

    QUnit.test('initAuth test', function(assert) {
        var done = assert.async();

        webida.auth.initAuth('anything', 'anything', gen, function(sessionID) {
            assert.notEqual(sessionID, null, 'initAuth success check');
            logger.log('[fs#001] initAuth check done', sessionID);
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
                    logger.log('[fs#002] addMyFS check done', err, fsinfo);
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
            logger.log('[fs#003] getMyFS check done', err, fsObj.fsid);
            FS = fsObj;
            done();
        });
    });

    // FS test

    QUnit.test('getQuotaLimit test', function(assert) {
        var done = assert.async();

        FS.getQuotaLimit(function(err, limit) {
            assert.equal(err, undefined, 'getQuotaLimit success check');
            logger.log('[fs#004] getQuotaLimit check done', err, limit);
            done();
        });
    });

    QUnit.test('getQuotaUsage test', function(assert) {
        var done = assert.async();

        FS.getQuotaUsage(function(err, usage) {
            assert.equal(err, undefined, 'getQuotaUsage success check');
            logger.log('[fs#005] getQuotaUsage check done', err, usage);
            done();
        });
    });

    QUnit.test('createDirectory test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.createDirectory(testDir2, false, function(err) {
            assert.notEqual(err, undefined, 'createDirectory fail check');
            logger.log('[fs#006] createDirectory fail check done(no recursive)', err);
            done();
        });

        FS.createDirectory(testDir, true, function(err) {
            assert.equal(err, undefined, 'createDirectory success check');
            logger.log('[fs#007] createDirectory check done', err);
            done2();
        });
    });

    QUnit.test('writeFile test', function(assert) {
        var done = assert.async();

        FS.writeFile(testFile, testFileData, function(err) {
            assert.equal(err, undefined, 'writeFile success check');
            logger.log('[fs#008] writeFile check done', err);
            done();
        });

        // TODO: Test writing the file type data and blob type data.
    });

    QUnit.test('exists test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();
        var done3 = assert.async();

        FS.exists(testFile, function(err, result) {
            assert.equal(err, undefined, 'exists true check');
            assert.ok(result, 'exists true check');
            logger.log('[fs#009] exists true check done', err, result);
            done();
        });

        FS.exists(incorrectPath, function(err, result) {
            assert.equal(err, undefined, 'exists false check');
            assert.notOk(result, 'exists false check');
            logger.log('[fs#010] exists false check done', err, result);
            done2();
        });

        FS.exists(testDir, function(err, result) {
            assert.equal(err, undefined, 'exists dir success check');
            assert.ok(result, 'exists dir check');
            logger.log('[fs#011] exists dir check done', err, result);
            done3();
        });
    });

    QUnit.test('readFile test', function(assert) {
        var done = assert.async();

        FS.readFile(testFile, function(err, data) {
            assert.equal(err, undefined, 'readFile success check');
            assert.equal(data, testFileData, 'readFile data check');
            logger.log('[fs#012] readFile check done', err, data, testFileData);
            done();
        });
    });

    QUnit.test('copy test', function(assert) {
        var done = assert.async();

        FS.copy(testFile, testDir + '/newTestFile.js', function(err) {
            assert.equal(err, undefined, 'copy success check');
            logger.log('[fs#013] copy check done', err);
            done();
        });
    });

    QUnit.test('isDirectory test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.isDirectory(testDir, function(err, result) {
            assert.equal(err, undefined, 'isDirectory true check');
            assert.ok(result, 'isDirectory true check');
            logger.log('[fs#014] isDirectory true check done', err, result);
            done();
        });

        FS.isDirectory(testFile, function(err, result) {
            assert.equal(err, undefined, 'isDirectory false check');
            assert.notOk(result, 'isDirectory false check');
            logger.log('[fs#015] isDirectory false check done', err, result);
            done2();
        });
    });

    QUnit.test('isFile test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.isFile(testDir, function(err, result) {
            assert.equal(err, undefined, 'isFile false check');
            assert.notOk(result, 'isFile false check');
            logger.log('[fs#016] isFile false check done', err, result);
            done();
        });

        FS.isFile(testFile, function(err, result) {
            assert.equal(err, undefined, 'isFile true check');
            assert.ok(result, 'isFile true check');
            logger.log('[fs#017] isFile true check done', err, result);
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
            logger.log('[fs#018] isEmpty dir false check done', err, result);
            done();
        });

        FS.isEmpty(testFile, function(err, result) {
            assert.notEqual(err, undefined, 'isEmpty file false check');
            logger.log('[fs#019] isEmpty file false check done', err, result);
            done2();
        });

        async.series([
            function(callback) {
                FS.createDirectory(testDir2, function(err) {
                    assert.equal(err, undefined, 'isEmpty createDirectory success check');
                    logger.log('[fs#020] isEmpty true check done', err);
                    return callback(err);
                });
            }, function(callback) {
                FS.isEmpty(testDir2, function(err, result) {
                    assert.equal(err, undefined, 'isEmpty dir true check');
                    assert.ok(result, 'isEmpty dir true check');
                    logger.log('[fs#021] isEmpty dir true check done', err, result);
                    return callback(err);
                });
            }
        ], function(err) {
            if(err) {
                assert.ok(false, 'isEmpty true check failed.');
            } else {
                assert.ok(true, 'isEmpty true check successed.');
            }
            logger.log('[fs#022] isEmpty true check done', err);
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
            logger.log('[fs#023] list check done', err, listInfoArr);
            done();
        });

        FS.list(testFile, function(err, listInfoArr) {
            assert.notEqual(err, undefined, 'list file fail check');
            logger.log('[fs#024] list file check done(should be directory)', err, listInfoArr);
            done2();
        });

        FS.list(testDir2, function(err, listInfoArr) {
            assert.equal(err, undefined, 'list dir success check');
            logger.log('[fs#025] list dir check done', err, listInfoArr);
            done3();
        });

        FS.list(testDir, true, function(err, listInfoArr) {
            assert.equal(err, undefined, 'list dir recursive success check');
            logger.log('[fs#026] list dir recursive check done', err, listInfoArr);
            done4();
        });
    });

    QUnit.test('listEx test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.listEx(testDir, {dirOnly:true}, function(err, listInfoArr) {
            assert.equal(err, undefined, 'listEx dirOnly success check');
            logger.log('[fs#027] listEx dirOnly check done', err, listInfoArr);
            done();
        });

        FS.listEx(testDir, {fileOnly:true}, function(err, listInfoArr) {
            assert.equal(err, undefined, 'listEx fileOnly success check');
            logger.log('[fs#028] listEx fileOnly check done', err, listInfoArr);
            done2();
        });
    });

    QUnit.test('stat test', function(assert) {
        var done = assert.async();

        FS.stat([testDir, testFile, testDir2], function(err, statInfoArr) {
            assert.equal(err, undefined, 'stat success check');
            assert.equal(statInfoArr.length, 3, 'stat result number check');
            logger.log('[fs#029] stat check done', err, statInfoArr);
            done();
        });
    });

    QUnit.test('lockFile test', function(assert) {
        var done = assert.async();

        FS.lockFile(testFile, function(err) {
            assert.equal(err, undefined, 'lockFile success check');
            logger.log('[fs#030] lockFile check done', err);
            done();
        });
    });

    QUnit.test('getLockedFiles test', function(assert) {
        var done = assert.async();

        FS.getLockedFiles(testDir, function(err, lockInfoArr) {
            assert.equal(err, undefined, 'getLockedFiles success check');
            assert.equal(lockInfoArr.length, 1, 'getLockedFiles count check');
            assert.equal(lockInfoArr[0].path, testFile, 'getLockedFiles lockInfo check');
            logger.log('[fs#031] getLockedFiles check done', err, lockInfoArr);
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
            logger.log('[fs#032] delete incorrect path check done', err);
            done();
        });

        FS.delete(testFile, function(err) {
            assert.notEqual(err, undefined, 'delete locked file check');
            logger.log('[fs#033] delete locked file check done', err);
            done2();
        });

        FS.delete(testDir, function(err) {
            assert.notEqual(err, undefined, 'delete locked dir check');
            logger.log('[fs#034] delete locked dir check done', err);
            done3();
        });

        async.series([
            function(callback) {
                FS.createDirectory(testDir2, function(err) {
                    assert.equal(err, undefined, 'delete createDirectory success check');
                    logger.log('[fs#035] delete createDirectory check done', err);
                    return callback(err);
                });
            }, function(callback) {
                FS.writeFile(testFile2, testFileData, function(err) {
                    assert.equal(err, undefined, 'delete writeFile success check');
                    logger.log('[fs#036] delete writeFile check done', err);
                    return callback(err);
                });
            }, function(callback) {
                FS.delete(testFile2, function(err) {
                    assert.equal(err, undefined, 'delete file check');
                    logger.log('[fs#037] delete file check done', err);
                    return callback(err);
                });
            }, function(callback) {
                FS.delete(testDir2, function(err) {
                    assert.equal(err, undefined, 'delete dir check');
                    logger.log('[fs#038] delete dir check done', err);
                    return callback(err);
                });
            }
        ], function(err) {
            if(err) {
                assert.ok(false, 'delete file check failed.');
            } else {
                assert.ok(true, 'delete file check successed.');
            }
            logger.log('[fs#039] delete filecheck done', err);
            done4();
        });

    });

    QUnit.test('move test1', function(assert) {
        var done = assert.async();

        async.series([
            function(callback) {
                FS.createDirectory(testDir2, function(err) {
                    assert.equal(err, undefined, 'move createDirectory check');
                    logger.log('[fs#040] move createDirectory check done', err);
                    return callback(err);
                });
            }, function(callback) {
                FS.move(testFile, testFile2, function(err) {
                    assert.notEqual(err, undefined, 'move locked file fail check');
                    logger.log('[fs#041] move locked file check done', err);
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
            logger.log('[fs#042] move locked file check done', err);
            done();
        });
    });

    QUnit.test('unlockFile test', function(assert) {
        var done = assert.async();
        var done2 = assert.async();

        FS.unlockFile(testDir2, function(err) {
            assert.equal(err, undefined, 'unlockFile not locked dir check');
            logger.log('[fs#043] unlockFile not locked dir check done', err);
            done();
        });

        FS.unlockFile(testFile, function(err) {
            assert.equal(err, undefined, 'unlockFile locked file check');
            logger.log('[fs#044] unlockFile locked file check done', err);
            done2();
        });
    });

    QUnit.test('move test2', function(assert) {
        var done = assert.async();

        FS.move(testFile, testFile2, function(err) {
            assert.equal(err, undefined, 'move file check');
            logger.log('[fs#045] move file check done', err);
            done();
        });
    });

    QUnit.test('setMeta test', function(assert) {
        var done = assert.async();

        FS.setMeta(testFile2, testMeta, testMetaData, function(err) {
            assert.equal(err, undefined, 'setMeta success check');
            logger.log('[fs#046] setMeta check done', err);
            done();
        });
    });

    QUnit.test('getMeta test', function(assert) {
        var done = assert.async();

        FS.getMeta(testFile2, testMeta, function(err, data) {
            assert.equal(err, undefined, 'getMeta success check');
            assert.equal(data, testMetaData, 'getMeta data check');
            logger.log('[fs#047] getMeta check done', err, data);
            done();
        });
    });

    // TODO: searchFiles

    QUnit.test('addAlias test', function(assert) {
        var done = assert.async();

        FS.addAlias(testDir2, 60*60, function(err, aliasInfo) {
            assert.equal(err, undefined, 'addAlias check');
            logger.log('[fs#049] addAlias check done', err, aliasInfo);
            testAlias = aliasInfo;
            done();
        });
    });

    QUnit.test('getAliasInfo test', function(assert) {
        var done = assert.async();

        FS.getAliasInfo(testAlias.key, function(err, aliasInfo) {
            assert.equal(err, undefined, 'getAliasInfo success check');
            assert.deepEqual(aliasInfo, testAlias, 'getAliasInfo alias info check');
            logger.log('[fs#051] getAliasInfo check done', err, aliasInfo);
            done();
        });
    });

    QUnit.test('deleteAlias test', function(assert) {
        var done = assert.async();

        FS.deleteAlias(testAlias.key, function(err) {
            assert.equal(err, undefined, 'deleteAlias success check');
            logger.log('[fs#053] deleteAlias check done', err);
            done();
        });
    });

    /* TODO: enable time consuming test cases (archive, exec)
    QUnit.test('createZip test', function(assert) {
        var done = assert.async();

        FS.createZip([testDir], testZipFile, function(err) {
            assert.equal(err, undefined, 'createZip success check');
            logger.log('[fs#054] createZip check done', err);
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
                    logger.log('[fs#055] before extractZip stat check done', err, statInfoArr);
                    return callback(err, statInfoArr);
                });
            }, function(stats, callback) {
                FS.extractZip(testZipFile, testDir2, function(err) {
                    assert.equal(err, undefined, 'extractZip success check');
                    logger.log('[fs#056] extractZip check done', err);
                    return callback(err, stats);
                });
            }, function(stats, callback) {
                FS.stat([testDir2 + '/testDir'], function(err, statInfoArr) {
                    assert.equal(err, undefined, 'after extractZip stat success check');
                    assert.equal(stats[0].name, statInfoArr[0].name, 'extractZip stat check');
                    assert.equal(stats[0].size, statInfoArr[0].size, 'extractZip stat check');
                    logger.log('[fs#057] after extractZip stat check done', err, statInfoArr);
                    return callback(err);
                });
            }
        ], function(err) {
            if(err) {
                assert.ok(false, 'extractZip check failed.');
            } else {
                assert.ok(true, 'extractZip check successed.');
            }
            logger.log('[fs#058] extractZip check done', err);
            done();
        });
    });

    QUnit.test('exportZip test', function(assert) {
        var testExportZip = FS.exportZip([testDir], 'testExportZip.zip');
        assert.ok(!testExportZip, 'exportZip success check');
        logger.log('[fs#059] exportZip check done');
    });

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
            logger.log('[fs#060] exec(git) check done', err, log);
            done();
        });

        FS.exec('./', exec_info2, function(err, log) {
            assert.equal(err, undefined, 'exec(ssh-keygen) success check');
            logger.log('[fs#061] exec(ssh-keygen) check done', err, log);
            done2();
        });
    });
    */

    // TODO: getFileLink, getFileLinkByPath
    // TODO: getKeystoreList, registerKeystoreFile, removeKeystoreFile

    QUnit.test('cleanup after FileSystem module test', function(assert) {
        if (isTestFSCreated) {
            var done = assert.async();

            webida.fs.deleteFS(FS.fsid, function(err) {
                assert.equal(err, undefined, 'deleteFS success check');
                logger.log('[fs#062] deleteFS check done', err);
                done();
            });
        }
    });
});
