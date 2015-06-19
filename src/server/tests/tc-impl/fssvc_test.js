require([
    './webida-0.3',
    './config',
    './lib/async'
],
function(webida, conf, async) {
    'use strict';

    var testFsInfo = {};

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

    logger.log('[fssvc] FSService api unit test start. ', webida.conf.fsApiBaseUrl);

    QUnit.module('FSService module');

    QUnit.test('initAuth test', function(assert) {
        var done = assert.async();

        webida.auth.initAuth('anything', 'anything', gen, function(sessionID) {
            assert.notEqual(sessionID, null, 'initAuth success check');
            logger.log('[fssvc#001] initAuth check done', sessionID);
            done();
        });
    });

    // FSService test

    QUnit.test('addMyFS test', function(assert) {
        var done = assert.async();

        webida.fs.addMyFS(function(err, fsinfo) {
            assert.equal(err, undefined, 'addMyFS success check');
            logger.log('[fssvc#002] addMyFS check done', err, fsinfo);
            testFsInfo = fsinfo;
            done();
        });
    });

    QUnit.test('getMyFSInfos test', function(assert) {
        var done = assert.async();

        webida.fs.getMyFSInfos(function(err, fsinfoArr) {
            assert.equal(err, undefined, 'getMyFSInfos success check');
            assert.ok(fsinfoArr.length === 1, 'getMyFSInfos FS count check');
            assert.deepEqual(fsinfoArr[0], testFsInfo, 'getMyFSInfos Fs info value check');
            logger.log('[fssvc#003] getMyFSInfos check done', err, fsinfoArr, testFsInfo);
            done();
        });
    });

    // TODO : mount() api test

    QUnit.test('mountByFSID test', function(assert) {
        var fsObj = webida.fs.mountByFSID(testFsInfo.fsid);
        assert.notEqual(fsObj, undefined, 'mountByFSID success check');
        assert.equal(fsObj.fsid, testFsInfo.fsid, 'mountByFSID FS object check');
        logger.log('[fssvc#004] mountByFSID check done', fsObj.fsid);
    });

    QUnit.test('getMyFS test', function(assert) {
        var done = assert.async();

        webida.fs.getMyFS(function(err, fsObj) {
            assert.equal(err, undefined, 'getMyFS success check');
            assert.equal(fsObj.fsid, testFsInfo.fsid, 'getMyFS FS object check');
            logger.log('[fssvc#005] getMyFS check done', err, fsObj.fsid);
            done();
        });
    });

    QUnit.test('deleteFS test', function(assert) {
        var done = assert.async();

        webida.fs.deleteFS(testFsInfo.fsid, function(err) {
            assert.equal(err, undefined, 'deleteFS success check');
            logger.log('[fssvc#006] deleteFS check done', err);
            done();
        });
    });

    QUnit.test('deleteAllMyFS test', function(assert) {
        var done = assert.async();

        async.series([
            function(callback) {
                webida.fs.addMyFS(function(err, fsinfo) {
                    assert.equal(err, undefined, 'deleteAllMyFS addMyFS success check');
                    logger.log('[fssvc#007] deleteAllMyFS addMyFS check done', err, fsinfo);
                    return callback(null);
                });
            }, function(callback) {
                webida.fs.getMyFSInfos(function(err, fsinfoArr) {
                    assert.equal(err, undefined, 'deleteAllMyFS getMyFSInfos success check');
                    assert.ok(fsinfoArr.length === 1, 'deleteAllMyFS getMyFSInfos FS count check');
                    return callback(null);
                });
            }, function(callback) {
                webida.fs.deleteAllMyFS(function(err) {
                    assert.equal(err, undefined, 'deleteAllMyFS success check');
                    logger.log('[fssvc#008] deleteAllMyFS check done', err);
                    return callback(null);
                });
            }, function(callback) {
                webida.fs.getMyFSInfos(function(err, fsinfoArr) {
                    assert.equal(err, undefined, 'after deleteAllMyFS getMyFSInfos check again');
                    assert.ok(fsinfoArr.length === 0, 'after deleteAllMyFS FS count should be zero');
                    return callback(null);
                });
            }
        ], function(err) {
            logger.log('[fssvc#009] deleteAllMyFS check done', err);
            done();
        });
    });


});
