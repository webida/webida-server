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

/* jshint -W059,-W003 */

// This is required for '__line' variable
// And strict mode is not allowed to use arguments.callee here
Object.defineProperty(global, '__stack', {
    get: function () {
        var orig = Error.prepareStackTrace;
        Error.prepareStackTrace = function (_, stack) { return stack; };
        var err = new Error();
        Error.captureStackTrace(err, arguments.callee);
        var stack = err.stack;
        Error.prepareStackTrace = orig;
        return stack;
    }
});
// line number of '__line' use
Object.defineProperty(global, '__line', {
    get: function () {
        return __stack[1].getLineNumber();
    }
});
// caller's line number
Object.defineProperty(global, '__line2', {
    get: function () {
        return __stack[2].getLineNumber();
    }
});

var async = require('async');
var path = require('path');
var fs = require('fs');
var _ = require('underscore');
var userdb = require('../lib/userdb');

var appMgr = require('../lib/app-manager');
var authMgr = require('../lib/auth-manager');

var utils = require('../lib/utils');

var appinfoHtml1 = {
    appid: 'html1',
    apptype: 'html',
    name: 'html1',
    desc: 'this is html app1',
    owner: 'webida'
};

var appinfoNode1 = {
    appid: 'node1',
    apptype: 'nodejs',
    name: 'node1',
    desc: 'this is node app1',
    owner: 'webida'
};

describe('Test App Service', function () {
    'use strict';
    it('App.getInstance', function (done) {
        async.waterfall([
            function (next) {
                appMgr.App.getInstance('', function (err, app) {
                    expect(err).toBeFalsy();
                    expect(app.appinfo.appid).toBe('');
                    expect(app.appinfo.apptype).toBe('html');
                    next();
                });
            },
            function (next) {
                appMgr.App.getInstanceByAppid('', function (err, app) {
                    expect(err).toBeFalsy();
                    expect(app.appinfo.appid).toBe('');
                    expect(app.appinfo.apptype).toBe('html');
                    next();
                });
            },
            function (next) {
                appMgr.App.getInstanceByAppid('dashboard', function (err, app) {
                    expect(err).toBeFalsy();
                    expect(app.appinfo.appid).toBe('dashboard');
                    expect(app.appinfo.apptype).toBe('html');
                    next();
                });
            },
            function (next) {
                appMgr.App.getInstanceByUrl('http://webida.org/dashboard/index.html', function (err, app) {
                    expect(err).toBeFalsy();
                    expect(app.appinfo.appid).toBe('dashboard');
                    expect(app.appinfo.apptype).toBe('html');
                    next();
                });
            },
            function (next) {
                appMgr.App.getInstanceByUrl('http://webida.org/notexists/index.html', function (err, app) {
                    expect(err).toBeFalsy();
                    expect(app.appinfo.appid).toBe('');
                    expect(app.appinfo.apptype).toBe('html');
                    next();
                });
            }
        ], done);
    });
    it('update appinfo', function (done) {
        var appinfo = appinfoHtml1;
        var appid = appinfo.appid;
        async.waterfall([
            function (next) {
                appMgr.addNewApp(appinfo, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            },
            function (next) {
                var newAppInfo = {name: 'updated name', desc: 'updated desc', owner: 'updatedowner'};
                appMgr.changeAppInfo(appid, newAppInfo, function (err) {
                    expect(err).toBeFalsy();
                    appMgr.App.getInstance(appid, function (err, app) {
                        expect(app.appinfo.name).toEqual('updated name');
                        expect(app.appinfo.desc).toEqual('updated desc');
                        expect(app.appinfo.owner).toEqual('updatedowner');
                        expect(app.appinfo.status).toEqual('running');
                        next();
                    });
                });
            },
            remove(appid)
        ], done);
    });
    it('add/remove html app', function (done) {
        var appinfo = appinfoHtml1;
        var appid = appinfo.appid;
        async.waterfall([
            function (next) {
                appMgr.addNewApp(appinfo, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            },
            function (next) {
                appMgr.App.getInstance(appid, function (err, app) {
                    expect(err).toBeFalsy();
                    expect(app.appid).toBe(appinfo.appid);
                    expect(app.appinfo.appid).toBe(appinfo.appid);
                    expect(app.appinfo.apptype).toBe(appinfo.apptype);
                    expect(app.appinfo.name).toBe(appinfo.name);
                    expect(app.appinfo.desc).toBe(appinfo.desc);
                    next();
                });
            },
            remove(appid),
            function (next) {
                appMgr.App.getInstance(appid, function (err, app) {
                    expect(err).toBeFalsy();
                    expect(app).toBeFalsy();
                    next();
                });
            }
        ], done);
    });
    it('add/remove nodejs app', function (done) {
        var appinfo = appinfoNode1;
        var appid = appinfo.appid;
        async.waterfall([
            function (next) {
                appMgr.addNewApp(appinfo, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            },
            function (next) {
                appMgr.App.getInstance(appid, function (err, app) {
                    expect(err).toBeFalsy();
                    expect(app.appid).toBe(appinfo.appid);
                    expect(app.appinfo.appid).toBe(appinfo.appid);
                    expect(app.appinfo.apptype).toBe(appinfo.apptype);
                    expect(app.appinfo.name).toBe(appinfo.name);
                    expect(app.appinfo.desc).toBe(appinfo.desc);
                    next();
                });
            },
            remove(appid),
            function (next) {
                appMgr.App.getInstance(appid, function (err, app) {
                    expect(err).toBeFalsy();
                    expect(app).toBeFalsy();
                    next();
                });
            }
        ], done);
    });
    it('start/stop html app', function (done) {
        var appinfo = appinfoHtml1;
        var appid = appinfo.appid;

        async.waterfall([
            function (next) {
                // create new app
                appMgr.addNewApp(appinfo, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            },
            log('added'),
            checkStatus(appid, 'running'), // check default running
            stop(appid),
            log('stopped'),
            checkStatus(appid, 'stopped'),
            start(appid),
            log('started'),
            checkStatus(appid, 'running'),
            stop(appid),
            log('stopped'),
            checkStatus(appid, 'stopped'),
            function (next) {
                appMgr.removeApp(appid, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            }
        ], done);
    });
    it('start/stop nodejs app', function (done) {
        var appinfo = appinfoNode1;
        var appid = appinfo.appid;

        async.waterfall([
            function (next) {
                // create new app
                appMgr.addNewApp(appinfo, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            },
            log('added'),
            checkStatus(appid, 'running'), // check default running
            stop(appid),
            log('stopped'),
            checkStatus(appid, 'stopped'),
            start(appid),
            log('started'),
            checkStatus(appid, 'running'),
            stop(appid),
            log('stopped'),
            checkStatus(appid, 'stopped'),
            remove(appid)
        ], done);
    });

    it('deploy app(not installed)', function (done) {
        var pPath =  path.join(__dirname, 'deploy');
        var appid = 'nodetest6';

        async.waterfall([
            function (next) {
                appMgr.App.exists(appid, function (err, exists) {
                    if (exists) {
                        appMgr.removeApp(appid, next);
                    } else {
                        next();
                    }
                });
            },
            function (next) {
                appMgr.App.exists(appid, function (err, exists) {
                    expect(err).toBeFalsy();
                    expect(exists).toBeFalsy();
                    next();
                });
            },
            function (next) {
                appMgr.deployApp(pPath, 'webida', function (err) {
                    expect(err).toBeFalsy();

                    appMgr.App.getInstance(appid, function (err, app) {
                        console.log('AFTER DEPLOY1', app);
                        expect(err).toBeFalsy();
                        expect(app.appinfo.appid).toEqual(appid);

                        var packFile = path.join(app.getAppRootPath(), 'package.json');

                        fs.exists(packFile, function (exists) {
                            expect(exists).toBe(true);
                            next();
                        });
                    });
                });
            }
            // Intentionally dont't remove this app for using in the next test
        ], done);
    });

    it('deploy app(already installed)', function (done) {
        var pPath =  path.join(__dirname, 'deploy');
        var appid = 'nodetest6';

        async.waterfall([
            function (next) {
                appMgr.App.exists(appid, function (err, exists) {
                    expect(err).toBeFalsy();
                    expect(exists).toBeTruthy();
                    next();
                });
            },
            function (next) {
                appMgr.deployApp(pPath, 'non_webida', function (err) {
                    expect(err).toBeTruthy();
                    next();
                });
            },
            function (next) {
                appMgr.deployApp(pPath, 'webida', function (err) {
                    expect(err).toBeFalsy();

                    appMgr.App.getInstance(appid, function (err, app) {
                        console.log('AFTER DEPLOY2', app);
                        expect(err).toBeFalsy();
                        expect(app.appinfo.appid).toEqual(appid);

                        var packFile = path.join(app.getAppRootPath(), 'package.json');

                        fs.exists(packFile, function (exists) {
                            expect(exists).toBe(true);
                            next();
                        });
                    });
                });
            },
            remove(appid)
        ], done);
    });

    it('deploy PackageTest app', function (done) {
        var pPath = path.join(__dirname, 'deployPackage/deploytest01.tar.gz');
        var appid = 'deploytest01';

        async.waterfall([
            function (next) {
                appMgr.deployPackageFile(pPath, 'webida', function (err) {
                    expect(err).toBeFalsy();

                    appMgr.App.getInstance(appid, function (err, app) {
                        expect(err).toBeFalsy();
                        expect(app.appinfo.appid).toEqual(appid);

                        var packFile = path.join(app.getAppRootPath(), 'package.json');

                        fs.exists(packFile, function (exists) {
                            expect(exists).toBe(true);
                            next();
                        });
                    });
                });
            },
            remove(appid)
        ], done);
    });
});

describe('Test FileSystem Service:', function () {
    'use strict';
    var fsMgr = require('../lib/fs-manager');
    var appid = '';
    it('List directory: recursive', function (done) {
        appMgr.App.getInstance(appid, function (err, app) {
            var approotPath = app.getAppRootPath();
            fsMgr.listDir(approotPath, approotPath, true, function (err, list) {
                expect(err).toBeFalsy();
                expect(list.length).toBeGreaterThan(2);
                
                var imagesStat = _.findWhere(list, {filename: 'images'});
                expect(imagesStat.isFile).toBeFalsy();
                expect(imagesStat.isDirectory).toBeTruthy();
                expect(imagesStat.children).toBeTruthy();
                
                console.log(imagesStat.children);
                var adpHomeStat = _.findWhere(imagesStat.children, {filename: 'adp_home'});
                var screenshotStat = _.findWhere(adpHomeStat.children, {filename: 'webida_screenshot.jpg'});
                expect(screenshotStat.isFile).toBeTruthy();
                expect(screenshotStat.isDirectory).toBeFalsy();
                expect(screenshotStat.children).toBeFalsy();
                
                var indexStat = _.findWhere(list, {filename: 'index.html'});
                expect(indexStat.isFile).toBeTruthy();
                expect(indexStat.isDirectory).toBeFalsy();
                expect(indexStat.children).toBeFalsy();
                
                var webidaStat = _.findWhere(list, {filename: 'webida.js'});
                expect(webidaStat.isFile).toBeTruthy();
                expect(webidaStat.isDirectory).toBeFalsy();
                expect(webidaStat.children).toBeFalsy();
                
                for (var i in list) {
                    if (list.hasOwnProperty(i)) {
                        var f = list[i];
                        expect(f.filename).toBeDefined();
                        expect(f.isFile).toBeDefined();
                        expect(f.isDirectory).toBeDefined();
                        expect(f.size).toBeDefined();
                        expect(f.atime).toBeDefined();
                        expect(f.mtime).toBeDefined();
                        expect(f.ctime).toBeDefined();
                    }
                }
                done();
            });
        });
    });
    it('List directory: non-recursive', function (done) {
        appMgr.App.getInstance(appid, function (err, app) {
            var approotPath = app.getAppRootPath();
            fsMgr.listDir(approotPath, approotPath, false, function (err, list) {
                expect(err).toBeFalsy();
                expect(list.length).toBeGreaterThan(2);
                
                var imagesStat = _.findWhere(list, {filename: 'images'});
                expect(imagesStat.isFile).toBeFalsy();
                expect(imagesStat.isDirectory).toBeTruthy();
                expect(imagesStat.children).toBeFalsy();
                
                var indexStat = _.findWhere(list, {filename: 'index.html'});
                expect(indexStat.isFile).toBeTruthy();
                expect(indexStat.isDirectory).toBeFalsy();
                
                var webidaStat = _.findWhere(list, {filename: 'webida.js'});
                expect(webidaStat.isFile).toBeTruthy();
                expect(webidaStat.isDirectory).toBeFalsy();
                
                for (var i in list) {
                    if (list.hasOwnProperty(i)) {
                        var f = list[i];
                        expect(f.filename).toBeDefined();
                        expect(f.isFile).toBeDefined();
                        expect(f.isDirectory).toBeDefined();
                        expect(f.size).toBeDefined();
                        expect(f.atime).toBeDefined();
                        expect(f.mtime).toBeDefined();
                        expect(f.ctime).toBeDefined();
                    }
                }
                done();
            });
        });
    });
    it('getPathFromUrl', function () {
        var wfsUrl = 'wfs://myfs/here/there';
        var wfsPath = fsMgr.getPathFromUrl(wfsUrl);
        var p = path.join((new fsMgr.WebidaFS('myfs')).getRootPath(), '/here/there');
        expect(wfsPath).toEqual(p);
    });
    it('Copy file', function (done) {
        var testFile = path.join(__dirname, 'fs/test.txt');
        var fs1;
        var fs2;
        async.waterfall([
            function (next) {
                fsMgr.addNewFS('testuser', function (err, fsinfo) {
                    fs1 = new fsMgr.WebidaFS(fsinfo.fsid);
                    utils.copyFile(testFile, path.join(fs1.getRootPath(), 'test.txt'), next);
                });
            },
            function (next) {
                fsMgr.addNewFS('testuser', function (err, fsinfo) {
                    fs2 = new fsMgr.WebidaFS(fsinfo.fsid);
                    next();
                });
            },
            // copy in a filesystem
            function (next) {
                var srcUrl = 'wfs://' + fs1.fsid + '/test.txt';
                var destUrl = 'wfs://' + fs1.fsid + '/test2.txt';
                var origPath = path.join(fs1.getRootPath(), 'test.txt');
                var newPath = path.join(fs1.getRootPath(), 'test2.txt');
                var rec = false;
                fsMgr.copy(srcUrl, destUrl, rec, function (err) {
                    console.log(err);
                    expect(err).toBeFalsy();
                    fs.exists(newPath, function (exists) {
                        expect(exists).toBe(true);
                        var origFile = fs.readFileSync(origPath, {encoding: 'utf8'});
                        var newFile = fs.readFileSync(newPath, {encoding: 'utf8'});
                        expect(origFile).toEqual(newFile);
                        next();
                    });
                });
            },
            // copy between two filesystems
            // copy in a filesystem
            function (next) {
                var srcUrl = 'wfs://' + fs1.fsid + '/test.txt';
                var destUrl = 'wfs://' + fs2.fsid + '/test2.txt';
                var origPath = path.join(fs1.getRootPath(), 'test.txt');
                var newPath = path.join(fs2.getRootPath(), 'test2.txt');
                var rec = false;
                fsMgr.copy(srcUrl, destUrl, rec, function (err) {
                    console.log(err);
                    expect(err).toBeFalsy();
                    fs.exists(newPath, function (exists) {
                        expect(exists).toBe(true);
                        var origFile = fs.readFileSync(origPath, {encoding: 'utf8'});
                        var newFile = fs.readFileSync(newPath, {encoding: 'utf8'});
                        expect(origFile).toEqual(newFile);
                        next();
                    });
                });
            },
            // TODO test recursive copy
            function (next) {
                fsMgr.deleteFS(fs1.fsid, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            },
            function (next) {
                fsMgr.deleteFS(fs2.fsid, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            },
        ], done);
    });
    xit('Move file', function (done) {
        var pkgPath1 = path.join(__dirname, 'deployPackage/deploytest01.tar.gz');
        var appid1 = 'deploytest01';
        var pkgPath2 = path.join(__dirname, 'deployPackage/deploytest02.tar.gz');
        var appid2 = 'deploytest02';
		console.log('Move file in filesystem');
        async.waterfall([
            // deploy html app for test
            function (next) {
                appMgr.deployPackageFile(pkgPath1, 'webida', next);
            },
            function (next) {
                appMgr.deployPackageFile(pkgPath2, 'webida', next);
            },
            // copy in a filesystem
            function (next) {
                var srcUrl = 'wfs://' + appid1 + '/index.html';
                var destUrl = 'wfs://' + appid1 + '/index2.html';
                var origPath = path.join((new appMgr.App(appid1)).getAppRootPath(), 'index.html');
                var newPath = path.join((new appMgr.App(appid1)).getAppRootPath(), 'index2.html');
                var origFile = fs.readFileSync(origPath, {encoding: 'utf8'});
                fsMgr.move(srcUrl, destUrl, function (err) {
                    console.log(err);
                    expect(err).toBeFalsy();
                    fs.exists(origPath, function (exists) {
                        expect(exists).toBe(false);
                        fs.exists(newPath, function (exists) {
                            expect(exists).toBe(true);
                            var newFile = fs.readFileSync(newPath, {encoding: 'utf8'});
                            expect(origFile).toEqual(newFile);
                            next();
                        });
                    });
                });
            },
            // copy between two filesystems
            // copy in a filesystem
            function (next) {
                var srcUrl = 'wfs://' + appid1 + '/index2.html'; // index2. because index.html is moved at the prev task
                var destUrl = 'wfs://' + appid2 + '/index2.html';
                var origPath = path.join((new appMgr.App(appid1)).getAppRootPath(), 'index2.html');
                var newPath = path.join((new appMgr.App(appid2)).getAppRootPath(), 'index2.html');
                var origFile = fs.readFileSync(origPath, {encoding: 'utf8'});
                fsMgr.move(srcUrl, destUrl, function (err) {
                    console.log(err);
                    expect(err).toBeFalsy();
                    fs.exists(origPath, function (exists) {
                        expect(exists).toBe(false);
                        fs.exists(newPath, function (exists) {
                            expect(exists).toBe(true);
                            var newFile = fs.readFileSync(newPath, {encoding: 'utf8'});
                            expect(origFile).toEqual(newFile);
                            next();
                        });
                    });
                });
            },
            remove(appid1),
            remove(appid2)
        ], done);
    });
    it('Check file existance', function (done) {
        var pkgPath1 = path.join(__dirname, 'deployPackage/deploytest01.tar.gz');
        var appid = 'deploytest01';
        async.waterfall([
            // deploy test app
            function (next) {
                appMgr.deployPackageFile(pkgPath1, 'webida', next);
            },
            // check folder exist
            function (next) {
                var dirPath = 'wfs://' + appid;
                fsMgr.exists(dirPath, function(exist) {
                    console.log('Folder exist check : ' + dirPath);
                    expect(exist).toBe(true);
                    next();
                });
            },
            // check file exist
            function (next) {
                var filePath = 'wfs://' + appid + '/index.html';
                fsMgr.exists(filePath, function(exist) {
                    console.log('File exist check : ' + filePath);
                    expect(exist).toBe(true);
                    next();
                });
            },
            // check not exist
            function (next) {
                var notExistPath = 'wfs://' + appid + '/' + new Date() + '.js';
                fsMgr.exists(notExistPath, function(exist) {
                    console.log('Not exist check : ' + notExistPath);
                    expect(exist).toBe(false);
                    next();
                });
            },
            remove(appid),
        ], done);
    });
});

describe('Test UserDB', function () {
    'use strict';
    var email = 'testuser01@test.com';
    var username = 'testuser01';
    var displayName = 'Test User';
    var authinfo = {emails: [{value: email}], username: username, password: username, displayName: displayName};
    var addedSecretKeys;
    var passwordDigest = 'IBjKRCcrdMMxgP2xoyJNqSYGiGhLvgZS1DtI0+WfRbA=';
    it('add user', function (done) {
        async.waterfall([
            function (next) {
                userdb.findUser(username, function (err, user) {
                    if (user) {
                        userdb.deleteUser(username, function (err) {
                            expect(err).toBeFalsy();
                            next();
                        });
                    } else {
                        next();
                    }
                });
            },
            function (next) {
                userdb.findOrAddUser({}, function (err) {
                    expect(err).toBeTruthy();
                    next();
                });
            },
            function (next) {
                userdb.findOrAddUser(authinfo, function (err, user) {
                    expect(err).toBeFalsy();
                    expect(user.username).toEqual(username);
                    expect(user.email).toEqual(email);
                    expect(user.authinfo.displayName).toEqual(displayName);
                    expect(user.passwordDigest).toEqual(passwordDigest);
                    next();
                });
            },
            function (next) {
                userdb.findUserByEmail(email, function (err, user) {
                    expect(err).toBeFalsy();
                    expect(user.username).toEqual(username);
                    expect(user.email).toEqual(email);
                    expect(user.authinfo.displayName).toEqual(displayName);
                    next();
                });
            }
        ],
            done);
    });
    it('add secret keys', function (done) {
        async.waterfall([
            function (next) {
                userdb.addNewSecretKey(username, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            },
            function (next) {
                userdb.addNewSecretKey(username, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            },
            function (next) {
                userdb.getAllSecretKeys(username, function (err, secretKeys) {
                    expect(err).toBeFalsy();
                    expect(secretKeys.length).toEqual(2);
                    addedSecretKeys = secretKeys;
                    next();
                });
            }
        ], done);
    });
    it('validate secret key', function (done) {
        async.waterfall([
            function (next) {
                userdb.validateSecretKey(username, addedSecretKeys[0],
                    function (err, valid) {
                        expect(err).toBeFalsy();
                        expect(valid).toBeTruthy();
                        next();
                    });
            },
            function (next) {
                userdb.validateSecretKey(username, addedSecretKeys[1],
                    function (err, valid) {
                        expect(err).toBeFalsy();
                        expect(valid).toBeTruthy();
                        next();
                    });
            },
            function (next) {
                var invalidKey = 'abcdefg';
                userdb.validateSecretKey(username, invalidKey,
                    function (err, valid) {
                        expect(err).toBeFalsy();
                        expect(valid).toBeFalsy();
                        next();
                    });
            }
        ], done);
    });
    it('remove secret key', function (done) {
        async.waterfall([
            function (next) {
                userdb.deleteSecretKey(username, addedSecretKeys[0],
                    function (err, numDeleted) {
                        expect(err).toBeFalsy();
                        expect(numDeleted).toEqual(1);
                        next();
                    });
            },
            function (next) {
                userdb.validateSecretKey(username, addedSecretKeys[0],
                    function (err, valid) {
                        expect(err).toBeFalsy();
                        expect(valid).toBeFalsy();
                        next();
                    });
            }
        ], done);
    });
    it('update user', function (done) {
        var fields = {
            isAdmin: true,
            email: 'testuser01@test2.com',
            password: 'test',
            unnecessaryField: 'test'
        };
        var passwordDigest = 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=';
        async.waterfall([
            function (next) {
                userdb.updateUser(username, fields, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            },
            function (next) {
                userdb.findUser(username, function (err, user) {
                    expect(err).toBeFalsy();
                    expect(user.isAdmin).toEqual(true);
                    expect(user.email).toEqual(fields.email);
                    expect(user.password).toBeUndefined();
                    expect(user.passwordDigest).toEqual(passwordDigest);
                    expect(user.unnecessaryField).toBeUndefined();
                    next();
                });
            }], done);
    });
    it('remove user', function (done) {
        async.waterfall([
            function (next) {
                userdb.deleteUser(username, function (err) {
                    expect(err).toBeFalsy();
                    next();
                });
            },
            function (next) {
                userdb.findUser(username, function (err, user) {
                    expect(err).toBeFalsy();
                    expect(user).toBeFalsy();
                    next();
                });
            }], done);
    });
    it('Signup', function (done) {
        async.waterfall([
            function (next) {
                authMgr.signup(authinfo, function (err) {
                    console.log('after signup', authinfo, arguments);
                    expect(err).toBeFalsy();
                    next();
                });
            } 
        ], done);
    });
});

describe('Test Utils', function () {
    it('digest', function () {
        expect(utils.getSha256Digest('whdndud')).toEqual('dS5eG5uCIB6eQZhOtMVW5HOC+CZsKmpHLEjiG1Q4rXQ=');
    });
});

function checkStatus(appid, status) {
    var line2 = __line2;
    return function checkStatus(next) {
        // check default running
        appMgr.App.getInstance(appid, function (err, app) {
            console.log('Check status at', line2);
            expect(app.appinfo.status).toBe(status);
            next();
        });
    };
}
function start(appid) {
    var line2 = __line2;
    return function start(next) {
        appMgr.startApp(appid, function (err) {
            console.log('Start at', line2);
            expect(err).toBeFalsy();
            next();
        });
    };
}
function stop(appid) {
    var line2 = __line2;
    return function stop(next) {
        appMgr.stopApp(appid, function (err) {
            console.log('Stop at', line2);
            expect(err).toBeFalsy();
            next();
        });
    };
}
function remove(appid) {
    var line2 = __line2;
    return function (next) {
            console.log('Remove at', line2);
            appMgr.removeApp(appid, function (err) {
                expect(err).toBeFalsy();
                next();
            });
        };
}
function log(msg) {
    return function log(next) {
        console.log(msg);
        next();
    };
}

