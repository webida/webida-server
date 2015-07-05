require([
    './webida-0.3',
    './config',
    './lib/async'
],
function(webida, conf, async) {
    'use strict';

    var gen = null;
    var app1 = {domain: conf.testUser.uid + '-unittc-1', apptype: 'html'};
    var app2 = {domain: conf.testUser.uid + '-unittc-2', apptype: 'html'};

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

    console.log('App api unit test start. ', webida.conf.appApiBaseUrl);

    QUnit.module('App module');

    QUnit.test('initAuth test', function(assert) {
        var done = assert.async();

        webida.auth.initAuth('anything', 'anything', gen, function(sessionID) {
            assert.notEqual(sessionID, null, 'initAuth success check');
            console.log('initAuth check done');
            done();
        });
    });

    QUnit.test('getAllAppInfo test', function(assert) {
        var done = assert.async();

        webida.app.getAllAppInfo(function(err, appArr) {
            assert.equal(err, undefined, 'getAllAppInfo success check');
            console.log('getAllAppInfo check done');
            done();
        });
    });

    QUnit.test('getHost test', function(assert) {
        var host = webida.app.getHost();
        assert.ok(host, 'getHost success check');
        console.log('getHost check done', host);
    });

    QUnit.test('isValidAppType test', function(assert) {
        var valid = webida.app.isValidAppType('html');
        assert.ok(valid, 'isValidAppType html type check');

        valid = webida.app.isValidAppType('nodejs');
        assert.ok(valid, 'isValidAppType nodejs type check');

        valid = webida.app.isValidAppType('native');
        assert.notOk(valid, 'isValidAppType invalid type(native) check');

        console.log('getHost check done', valid);
    });

    QUnit.test('isValidDomain test', function(assert) {
        var done1 = assert.async();
        var done2 = assert.async();
        var done3 = assert.async();

        console.log('isValidDomain', app1.appid, app1.domain);

        webida.app.isValidDomain(app1.domain, function(err, valid) {
            assert.equal(err, undefined, 'isValidDomain1 success check');
            assert.ok(valid, 'isValidDomain1 format true check');
            console.log('isValidDomain1 check done', valid);
            done1();
        });
        webida.app.isValidDomain('A34_*', function(err, valid) {
            assert.equal(err, undefined, 'isValidDomain2 success check');
            assert.notOk(valid, 'isValidDomain2 format false check');
            console.log('isValidDomain2 check done', valid);
            done2();
        });
        webida.app.isValidDomain('simulator', function(err, valid) {
            assert.equal(err, undefined, 'isValidDomain3 success check');
            assert.notOk(valid, 'isValidDomain3 exist check');
            console.log('isValidDomain3 check done', valid);
            done3();
        });
    });

    QUnit.test('createApp test', function(assert) {
        var done = assert.async();

        console.log('createApp', app1.appid, app1.domain);
        webida.app.createApp(app1.domain, app1.apptype, app1.domain, app1.domain, function(err, appid) {
            assert.equal(err, undefined, 'createApp success check');
            app1.appid = appid;
            console.log('createApp check done', appid);
            done();
        });
    });

    QUnit.test('getAppInfo test', function(assert) {
        var done = assert.async();

        console.log('getAppInfo', app1.appid, app1.domain);
        webida.app.getAppInfo(app1.appid, function(err, appInfo) {
            assert.equal(err, undefined, 'getAppInfo success check');
            assert.equal(app1.appid, appInfo.appid, 'getAppInfo appid check');
            assert.equal(app1.domain, appInfo.domain, 'getAppInfo domain check');
            app1 = appInfo;
            console.log('getAppInfo check done', app1.appid, app1.domain);
            done();
        });
    });

    QUnit.test('getMyAppInfo test', function(assert) {
        var done = assert.async();

        console.log('getMyAppInfo', app1.appid, app1.domain);
        webida.app.getMyAppInfo(function(err, appInfoArr) {
            assert.equal(err, undefined, 'getMyAppInfo success check');
            assert.equal(appInfoArr.length, 1, 'getMyAppInfo length check');
            assert.deepEqual(app1, appInfoArr[0], 'getMyAppInfo domain check');
            app1 = appInfoArr[0];
            console.log('getMyAppInfo check done', app1.appid, app1.domain);
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
                    console.log('setAppInfo test ', err);
                    assert.equal(err, undefined, 'setAppInfo success check');
                    if (err) {
                        callback(err);
                    } else {
                        callback(null);
                    };
                });
            }, function(callback) {
                webida.app.getAppInfo(app1.appid, function(err, appInfo) {
                    assert.equal(err, undefined, 'setAppInfo getAppInfo success check');
                    assert.deepEqual(app1, appInfo, 'setAppInfo getAppInfo app_info check');
                    callback(null);
                });
            }
        ], function(err, results) {
            console.log('setAppInfo check done', app1.appid, app1.domain, app1.name, app1.desc);
            done();
        });
    });
    */
    QUnit.test('deployApp test', function(assert) {
        var done = assert.async();

        webida.app.deployApp(app1.appid, conf.testFS.fsid + '/test1/hello1', 'url', function(err) {
            assert.equal(err, undefined, 'deployApp success check');
            console.log('deployApp check done');
            done();
        });
    });

    QUnit.test('getDeployedAppUrl test', function(assert) {
        var url = webida.app.getDeployedAppUrl(app1.domain, '');
        assert.ok(true, 'getDeployedAppUrl success check');
        console.log('getDeployedAppUrl check done', url);
    });

    QUnit.test('launchApp test', function(assert) {
        var window = webida.app.launchApp(app1.domain, true, '');
        assert.notEqual(window, null, 'launchApp success check');
        console.log('launchApp check done', window);
    });

    QUnit.test('stopApp test', function(assert) {
        var done = assert.async();

        webida.app.stopApp(app1.appid, function(err) {
            assert.equal(err, undefined, 'stopApp success check');
            console.log('stopApp check done');
            done();
        });
    });

    QUnit.test('startApp test', function(assert) {
        var done = assert.async();

        webida.app.startApp(app1.appid, function(err) {
            assert.equal(err, undefined, 'startApp success check');
            console.log('startApp check done');
            done();
        });
    });

    QUnit.test('deleteApp test', function(assert) {
        var done = assert.async();

        webida.app.deleteApp(app1.appid, function(err) {
            assert.equal(err, undefined, 'deleteApp success check');
            console.log('deleteApp check done');
            done();
        });
    });

    QUnit.test('deleteMyApps test', function(assert) {
        var done = assert.async();

        async.waterfall([
            function(callback) {
                webida.app.createApp(app1.domain, app1.apptype, app1.domain, app1.domain, function(err, appid) {
                    console.log('deleteMyApps test createApp1', err, appid);
                    callback(null, appid);
                });
            }, function(appid1, callback) {
                webida.app.createApp(app2.domain, app2.apptype, app2.domain, app2.domain, function(err, appid) {
                    console.log('deleteMyApps test createApp2', err, appid);
                    callback(null, appid1, appid);
                });
            }, function(appid1, appid2, callback) {
                webida.app.deleteMyApps(function(err) {
                    assert.equal(err, undefined, 'deleteMyApps success check');
                    callback(null);
                });
            }
        ], function(err) {
            console.log('deleteMyApps check done');
            done();
        });
    });
});
