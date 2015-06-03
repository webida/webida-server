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

    console.log('FS api unit test start. ', webida.conf.fsApiBaseUrl);

    QUnit.test('initAuth test', function(assert) {
        var done = assert.async();

        webida.auth.initAuth('anything', 'anything', gen, function(sessionID) {
            assert.notEqual(sessionID, null, 'initAuth success check');
            console.log('initAuth check done');
            done();
        });
    });

    // FSService test

    QUnit.test('addMyFS test', function(assert) {
        var done = assert.async();

        webida.fs.addMyFS(function(err, fsinfo) {
            assert.equal(err, undefined, 'addMyFS success check');
            console.log('addMyFS check done', fsinfo.fsid, fsinfo.owner);
            testFsInfo = fsinfo;
            done();
        });
    });

    QUnit.test('getMyFSInfos test', function(assert) {
        var done = assert.async();

        webida.fs.getMyFSInfos(function(err, fsinfoArr) {
            assert.equal(err, undefined, 'getMyFSInfos success check');
            assert.ok(fsinfoArr.length === 2, 'getMyFSInfos FS count check');
            assert.deepEqual(fsinfoArr[0], testFsInfo, 'getMyFSInfos Fs info value check');
            console.log('getMyFSInfos check done', fsinfoArr[0].fsid, fsinfoArr[0].owner);
            done();
        });
    });

    // TODO : mount() api test

    QUnit.test('mountByFSID test', function(assert) {
        var fsObj = webida.fs.mountByFSID(testFsInfo.fsid);
        assert.equal(fsObj, undefined, 'mountByFSID success check');
        assert.equal(fsObj.fsid, testFsInfo.fsid, 'mountByFSID FS object check');
        console.log('mountByFSID check done', fsObj.fsUrl);
    });

    QUnit.test('getMyFS test', function(assert) {
        var done = assert.async();

        webida.fs.getMyFS(function(err, fsObj) {
            assert.equal(err, undefined, 'getMyFS success check');
            assert.equal(fsObj.fsid, conf.testFS.fsid, 'getMyFS FS object check');
            console.log('getMyFS check done');
            done();
        });
    });

    QUnit.test('deleteFS test', function(assert) {
        var done = assert.async();

        webida.fs.deleteFS(testFsInfo.fsid, function(err) {
            assert.equal(err, undefined, 'deleteFS success check');
            console.log('deleteFS check done');
            done();
        });
    });

    QUnit.test('deleteAllMyFS test', function(assert) {
        var done = assert.async();

        async.series([
            function(callback) {
                webida.fs.addMyFS(function(err, fsinfo) {
                    assert.equal(err, undefined, 'deleteAllMyFS addMyFS success check');
                    console.log('deleteAllMyFS addMyFS check done', fsinfo.fsid, fsinfo.owner);
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
                    console.log('deleteAllMyFS check done');
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
            console.log('deleteAllMyFS check done');
            done();
        });
    });


});
