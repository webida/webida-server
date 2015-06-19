require([
    './webida-0.3',
    './config',
    './lib/async'
],
function(webida, conf, async) {
    'use strict';

    var gen = null;
    var app1 = {domain:conf.testUser.uid+'-unittc-1', apptype:'html'};
    var app2 = {domain:conf.testUser.uid+'-unittc-2', apptype:'html'};

    function validateToken(token) {
        return false;
    }

    function generateNewToken(cb) {
        cb(conf.personalToken);
    }

    var gen = {
        validateToken: validateToken,
        generateNewToken: generateNewToken
    };

    QUnit.config.reorder = false;

    logger.log('[app] App api unit test start. ', webida.conf.appApiBaseUrl);

    QUnit.module('App module');

    QUnit.test('initAuth test', function(assert) {
        var done = assert.async();

        webida.auth.initAuth('anything', 'anything', gen, function(sessionID) {
            assert.notEqual(sessionID, null, 'initAuth success check');
            logger.log('[app#001] initAuth check done', sessionID);
            done();
        });
    });

    QUnit.test('getAllAppInfo test', function(assert) {
        var done = assert.async();

        webida.app.getAllAppInfo(function(err, appArr) {
            assert.equal(err, undefined, 'getAllAppInfo success check');
            logger.log('[app#002] getAllAppInfo check done', err, appArr);
            done();
        });
    });

    QUnit.test('getHost test', function(assert) {
        var host = webida.app.getHost();
        assert.ok(host, 'getHost success check');
        logger.log('[app#003] getHost check done', host);
    });

    QUnit.test('isValidAppType test', function(assert) {
        var valid = webida.app.isValidAppType('html');
        assert.ok(valid, 'isValidAppType html type check');

        valid = webida.app.isValidAppType('nodejs');
        assert.ok(valid, 'isValidAppType nodejs type check');

        valid = webida.app.isValidAppType('native');
        assert.notOk(valid, 'isValidAppType invalid type(native) check');

        logger.log('[app#004] getHost check done', valid);
    });

    QUnit.test('isValidDomain test', function(assert) {
        var done1 = assert.async();
        var done2 = assert.async();
        var done3 = assert.async();

        webida.app.isValidDomain(app1.domain, function(err, valid) {
            assert.equal(err, undefined, 'isValidDomain1 success check');
            assert.ok(valid, 'isValidDomain1 format true check');
            logger.log('[app#005] isValidDomain1 check done', err, valid);
            done1();
        });
        webida.app.isValidDomain('A34_*', function(err, valid) {
            assert.equal(err, undefined, 'isValidDomain2 success check');
            assert.notOk(valid, 'isValidDomain2 format false check');
            logger.log('[app#006] isValidDomain2 check done', err, valid);
            done2();
        });
        webida.app.isValidDomain('simulator', function(err, valid) {
            assert.equal(err, undefined, 'isValidDomain3 success check');
            assert.notOk(valid, 'isValidDomain3 exist check');
            logger.log('[app#007] isValidDomain3 check done', err, valid);
            done3();
        });
    });

    QUnit.test('createApp test', function(assert) {
        var done = assert.async();

        webida.app.createApp(app1.domain, app1.apptype, app1.domain, app1.domain, function(err, appid) {
            assert.equal(err, undefined, 'createApp success check');
            app1.appid = appid;
            logger.log('[app#008] createApp check done', err, appid);
            done();
        });
    });

    QUnit.test('getAppInfo test', function(assert) {
        var done = assert.async();

        webida.app.getAppInfo(app1.appid, function(err, appInfo) {
            assert.equal(err, undefined, 'getAppInfo success check');
            assert.equal(app1.appid, appInfo.appid, 'getAppInfo appid check');
            assert.equal(app1.domain, appInfo.domain, 'getAppInfo domain check');
            app1 = appInfo;
            logger.log('[app#009] getAppInfo check done', err, appInfo);
            done();
        });
    });

    QUnit.test('getMyAppInfo test', function(assert) {
        var done = assert.async();

        webida.app.getMyAppInfo(function(err, appInfoArr) {
            assert.equal(err, undefined, 'getMyAppInfo success check');
            assert.equal(appInfoArr.length, 1, 'getMyAppInfo length check');
            assert.deepEqual(app1, appInfoArr[0], 'getMyAppInfo domain check');
            app1 = appInfoArr[0];
            logger.log('[app#010] getMyAppInfo check done', err, appInfoArr);
            done();
        });
    });

    /*
    QUnit.test('setAppInfo test', function(assert) {
        var done = assert.async();

        app1.name = 'newName';
        app1.desc = 'newDesc';
        async.series([
            function(callback) {
                webida.app.setAppInfo(app1.appid, app1.domain, app1.apptype, app1.name, app1.desc, function(err) {
                    assert.equal(err, undefined, 'setAppInfo success check');
                    logger.log('[app#011] setAppInfo test ', err);
                    if (err) {
                        callback(err);
                    } else {
                        callback(null);
                    };
                });
            }, function(callback) {
                webida.app.getAppInfo(app1.appid, function(err, appInfo) {
                    assert.equal(err, undefined, 'setAppInfo getAppInfo check');
                    assert.deepEqual(app1, appInfo, 'setAppInfo getAppInfo app_info check');
                    logger.log('[app#012] setAppInfo getAppInfo check done', err, appInfo);
                    callback(null);
                });
            }
        ], function(err, results) {
            logger.log('[app#013] setAppInfo check done', err, results);
            done();
        });
    });
    */

    /*
    QUnit.test('deployApp test', function(assert) {
        var done = assert.async();

        webida.app.deployApp(app1.appid, conf.testFS.fsid + '/test1/hello1', 'url', function(err) {
            assert.equal(err, undefined, 'deployApp success check');
            logger.log('[app#014] deployApp check done', err);
            done();
        });
    });

    QUnit.test('getDeployedAppUrl test', function(assert) {
        var url = webida.app.getDeployedAppUrl(app1.domain, '');
        assert.ok(true, 'getDeployedAppUrl success check');
        logger.log('[app#015] getDeployedAppUrl check done', url);
    });

    QUnit.test('launchApp test', function(assert) {
        var window = webida.app.launchApp(app1.domain, true, '');
        assert.notEqual(window, null, 'launchApp success check');
        logger.log('[app#016] launchApp check done');
    });

    QUnit.test('stopApp test', function(assert) {
        var done = assert.async();

        webida.app.stopApp(app1.appid, function(err) {
            assert.equal(err, undefined, 'stopApp success check');
            logger.log('[app#017] stopApp check done', err);
            done();
        });
    });

    QUnit.test('startApp test', function(assert) {
        var done = assert.async();

        webida.app.startApp(app1.appid, function(err) {
            assert.equal(err, undefined, 'startApp success check');
            logger.log('[app#018] startApp check done', err);
            done();
        });
    });
    */

    QUnit.test('deleteApp test', function(assert) {
        var done = assert.async();

        webida.app.deleteApp(app1.appid, function(err) {
            assert.equal(err, undefined, 'deleteApp success check');
            logger.log('[app#019] deleteApp check done', err);
            done();
        });
    });

    QUnit.test('deleteMyApps test', function(assert) {
        var done = assert.async();

        async.waterfall([
            function(callback) {
                webida.app.createApp(app1.domain, app1.apptype, app1.domain, app1.domain, function(err, appid) {
                    assert.equal(err, undefined, 'deleteMyApps createApp check');
                    logger.log('[app#020] deleteMyApps createApp check done', err, appid);
                    callback(null, appid);
                });
            }, function(appid1, callback) {
                webida.app.createApp(app2.domain, app2.apptype, app2.domain, app2.domain, function(err, appid) {
                    assert.equal(err, undefined, 'deleteMyApps createApp check');
                    logger.log('[app#021] deleteMyApps createApp check done', err, appid);
                    callback(null, appid1, appid);
                });
            }, function(appid1, appid2, callback) {
                webida.app.deleteMyApps(function(err) {
                    assert.equal(err, undefined, 'deleteMyApps success check');
                    logger.log('[app#022] deleteMyApps test createApp2', err);
                    callback(null);
                });
            }
        ], function(err) {
            logger.log('[app#023] deleteMyApps check done', err);
            done();
        });
    });
});
