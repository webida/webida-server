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

//require(['../webida.js'], function (webida) {
define(['../webida.js'], function (webida) {
    'use strict';

    if (webida === undefined) {
        console.log('ERROR!!!!! webida loading failed');
    } else {
        console.log('webida is loadded');
    }

    var testDirName = new Date().getTime();
    var webidafs = '';
    var fsid = '';

    var testUserEmail = 'webidaapitestuser@test.user';
    var testUserName = 'webidaapitestuser';
    var testUserPassword = '1';
    var testUserEmail2 = 'webidaapitestuser2@test.user';
    var testUserName2 = 'webidaapitestuser2';
    var testUserPassword2 = '1';
    var SignupKey = 'What a beautiful day...';

    describe('Test Authorization Service:', function () {

        beforeEach(function () {
            console.log('>>>>>>> ', this.description);
        });

        var async = new AsyncSpec(this);

        async.it('setup enviroment', function (done) {
            webida.auth.logout(function (/*err*/) {
                webida.auth.login(testUserName, testUserPassword, function (err/*, data*/) {
                    if (err === null) {
                        webida.auth.signout(testUserName, function (/*err*/) {
                            webida.auth.logout(function (/*err*/) {
                                done();
                            });
                        });
                    } else {
                        webida.auth.logout(function (/*err*/) {
                            done();
                        });
                    }
                });
            });
        });

        async.it('singup', function (done) {
            //singup(email, username, password, authphrase, callback)
            webida.auth.signup(testUserEmail, testUserName, testUserPassword, SignupKey, function (err, data) {
                expect(err).toBeNull();
                expect(data).toBeDefined();

                done();
            });
        });

        async.it('logout', function (done) {
            //logout( callback)
            webida.auth.logout(function (err) {
                expect(err).toBeNull();

                done();
            });
        });

        async.it('login', function (done) {
            //login(username, password, callback)
            webida.auth.login(testUserName, testUserPassword, function (err, data) {
                expect(err).toBeNull();
                expect(data).toBeDefined();
                expect(data._id).toBeDefined();
                expect(data.authinfo.username).toBe(testUserName);
                done();
            });
        });

        var myInfo = {};
        async.it('myinfo', function (done) {
            //myinfo(callback)
            webida.auth.myinfo(function (err, data) {
                console.dir('myinfo', JSON.stringify(data));
                expect(err).toBeNull();
                expect(data).toBeDefined();
                console.log(data);
                expect(data._id).toBeDefined();
                expect(data.fsid).toBeDefined();
                expect(data.authinfo.emails).toBeDefined();

                myInfo = data.authinfo;
                done();
            });
        });

        async.it('userinfo', function (done) {
            //userinfo(username, callback)
            var myName = myInfo.username;
            webida.auth.userinfo(myName, function (err, data) {
                expect(err).toBeNull();
                expect(data.authinfo).toEqual(myInfo);
                done();
            });
        });

        var secretKey = '';
        async.it('addNewSecretKey', function (done) {
            //addNewSecretKey(callback)
            webida.auth.addNewSecretKey(function (err, data) {
                expect(err).toBeNull();
                expect(data).toBeDefined();

                secretKey = data;
                done();
            });
        });

        async.it('deleteSecretKey', function (done) {
            //deleteSecretKey(callback)
            webida.auth.deleteSecretKey(secretKey, function (err) {
                expect(err).toBeNull();

                done();
            });
        });
    });


    describe('Application Service Apis test.', function () {

        beforeEach(function () {
            console.log('>>>>>>> ', this.description);
        });

        var async = new AsyncSpec(this);

        async.it('isValidAppid', function (done) {
            //isValidAppid(appid)
            var ret = webida.app.isValidAppid('webidatestapp');
            expect(ret).toBe(true);

            //fail case
            ret = webida.app.isValidAppid('&invalidAppName');
            expect(ret).toBe(false);
            done();
        });

        async.it('isValidApptype', function (done) {
            //isValidApptype(apptype)
            expect(webida.app.isValidApptype('html')).toBe(true);
            expect(webida.app.isValidApptype('nodejs')).toBe(true);

            //fail case
            expect(webida.app.isValidApptype('invalidType')).toBe(false);

            done();
        });

        async.it('clean up', function (done) {
            webida.app.deleteApp('webidatestapp', function () {
                webida.app.deleteApp('webidatestapp2', function () {
                    webida.app.deleteApp('webidatestappnode', function () {
                        webida.app.deleteApp('webidatestappnode2', function () {
                            done();
                        });
                    });
                });
            });
        });

        async.it('createApp', function (done) {
            //createApp(appid, apptype, name, desc, callback)
            webida.app.createApp('webidatestapp', 'html', 'webidatestapp', 'webida html app', function (err) {
                expect(err).toBeNull();

                done();
            });
        });


        async.it('createApp for nodejs', function (done) {
            //createApp(appid, apptype, name, desc, callback)
            webida.app.createApp('webidatestappnode', 'nodejs', 'webidatestappnode', 'webida node app', function (err) {
                expect(err).toBeNull();

                done();
            });
        });

        async.it('myApps', function (done) {
            //myApps(callback)
            webida.app.myApps(function (err, data) {
                expect(err).toBeNull();

                //check result data
                var findAppSite = false;
                for (var i in data.apps) {
                    if (data.apps[i].appid === 'webidatestapp') {
                        var app = data.apps[i];
                        expect(app.apptype).toBe('html');
                        expect(app.name).toBe('webidatestapp');
                        expect(app.desc).toBe('webida html app');

                        findAppSite = true;
                    }
                }
                expect(findAppSite).toBe(true);

                done();
            });
        });

        async.it('allApps', function (done) {
            //allApps(callback)
            webida.app.allApps(function (err, data) {
                expect(err).toBeNull();

                //check result data
                var findAppSite = false;
                for (var i in data.apps) {
                    if (data.apps[i].appid === 'webidatestappnode') {
                        var app = data.apps[i];
                        expect(app.apptype).toBe('nodejs');
                        expect(app.name).toBe('webidatestappnode');
                        expect(app.desc).toBe('webida node app');

                        findAppSite = true;
                    }
                }
                expect(findAppSite).toBe(true);

                done();
            });
        });

        var myAppInfo = {};
        var myAppInfonode = {};

        async.it('getAppInfo', function (done) {
            //getAppInfo(appId, callback)
            webida.app.getAppInfo('webidatestapp', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBeDefined();

                //check result data
                myAppInfo = data.appinfo;
                expect(myAppInfo.appid).toBe('webidatestapp');
                expect(myAppInfo.apptype).toBe('html');
                expect(myAppInfo.name).toBe('webidatestapp');

                done();
            });
        });

        async.it('getAppInfo for node', function (done) {
            //getAppInfo(appId, callback)
            webida.app.getAppInfo('webidatestappnode', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBeDefined();

                //check result data
                myAppInfonode = data.appinfo;
                expect(myAppInfonode.appid).toBe('webidatestappnode');
                expect(myAppInfonode.apptype).toBe('nodejs');
                expect(myAppInfonode.name).toBe('webidatestappnode');

                done();
            });
        });

        async.it('changeApp', function (done) {
            //changeApp(appid, newappid, apptype, name, desc, owner, callback)
            webida.app.changeApp('webidatestapp', 'webidatestapp2', myAppInfo.apptype,
                                 'webidatestapp2', myAppInfo.desc, myAppInfo.owner, function (err) {
                expect(err).toBeNull();

                //check changApp result using getAppInfo api
				webida.app.getAppInfo('webidatestapp2', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBeDefined();
                    expect(data.appinfo.name).toBe('webidatestapp2');

                    done();
                });
            });
        });

        async.it('changeApp for node', function (done) {
            //changeApp(appid, newappid, apptype, name, desc, owner, callback)
            webida.app.changeApp('webidatestappnode', 'webidatestappnode2', myAppInfo.apptype,
                                 'webidatestappnode2', myAppInfo.desc, myAppInfo.owner, function (err) {
                expect(err).toBeNull();

                //check changApp result using getAppInfo api
				webida.app.getAppInfo('webidatestappnode2', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBeDefined();
                    expect(data.appinfo.name).toBe('webidatestappnode2');

                    done();
                });
            });
        });

        //app is already started so stop and restart
        async.it('stopApp', function (done) {
            //stopApp(appId, callback)
            webida.app.stopApp('webidatestapp2', function (err) {
                expect(err).toBeNull();

                done();
            });
        });

        async.it('stopApp for node', function (done) {
            //stopApp(appId, callback)
            webida.app.stopApp('webidatestappnode2', function (err) {
                expect(err).toBeNull();

                done();
            });
        });

        async.it('startApp', function (done) {
            //startApp(appId, callback)
            webida.app.startApp('webidatestapp2', function (err) {
                expect(err).toBeNull();

                done();
            });
        });

        async.it('startApp for node', function (done) {
            //startApp(appId, callback)
            webida.app.startApp('webidatestappnode2', function (err) {
                expect(err).toBeNull();

                done();
            });
        });

        async.it('deleteApp', function (done) {
            //deleteApp(appId, callback)
            webida.app.deleteApp('webidatestapp2', function (err) {
                expect(err).toBeNull();

                done();
            });
        });
    });

    describe('Test FileSystem Service:', function () {

        beforeEach(function () {
            console.log('>>>>>>> ', this.description);
        });

        var async = new AsyncSpec(this);

        async.it('set up test environment', function (done) {
            webida.auth.myinfo(function (err, data) {
                fsid = data.fsid;
                done();
            });
        });

        async.it('mount', function (done) {
            //mount(fsid)
            webidafs = webida.fs.mountByFsid(fsid);

            expect(webidafs).not.toBeNull();

            done();
        });

        async.it('getMyFilesystem', function (done) {
            //getMyFilesystem(fsid)
            webida.fs.getMyFilesystem(function (err, data) {
                expect(err).toBeNull();
                expect(data).toEqual(webidafs);

                done();
            });
        });

        async.it('exists', function (done) {
            //exists(path, callback)
            webidafs.exists('.profile', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe(true);

                //false test
                webidafs.exists('not_exist.test', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBe(false);

                    done();
                });
            });
        });

        async.it('createDirectory', function (done) {
            //createDirectory(src, recursive, callback)
            webidafs.createDirectory(testDirName, false, function (err) {
                expect(err).toBeNull();

                //create directory with recursive mode
                webidafs.createDirectory(testDirName + '/intoDir', true, function (err) {
                    expect(err).toBeNull();

                    webidafs.createDirectory(testDirName + '/emptyDir', function (err, data) {
                        expect(err).toBeNull();

                        done();
                    });
                });
            });
        });

        async.it('createDirectory result check', function (done) {
            webidafs.exists(testDirName, function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe(true);

                webidafs.exists(testDirName + '/intoDir', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBe(true);

                    webidafs.exists(testDirName + '/emptyDir', function (err, data) {
                        expect(err).toBeNull();
                        expect(data).toBe(true);

                        done();
                    });
                });
            });
        });

        async.it('createNewFile', function (done) {
            //createNewFile(path, callback)
            //create test directory using Date.getTime()
            webidafs.createNewFile(testDirName + '/testfile.test', function (err) {
                expect(err).toBeNull();

                webidafs.createNewFile(testDirName + '/intoDir/inTestfile.test', function (err) {
                    expect(err).toBeNull();

                    done();
                });
            });
        });

        async.it('createNewFile result check', function (done) {
            webidafs.exists(testDirName + '/testfile.test', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe(true);

                done();
            });
        });

        async.it('isDirectory', function (done) {
            //isDirectory(path, callback)
            webidafs.isDirectory(testDirName, function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe(true);

                //false case check
                webidafs.isDirectory(testDirName + '/testfile.test', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBe(false);

                    //non exist case check
                    webidafs.isDirectory(testDirName + '/not_exist.test', function (err, data) {
                        expect(err).not.toBeNull();

                        done();
                    });
                });
            });
        });

        async.it('isFile', function (done) {
			//isFile(path, callback)
            webidafs.isFile(testDirName + '/testfile.test', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe(true);

                //false case check
                webidafs.isFile(testDirName, function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBe(false);

                    //non exist case check
                    webidafs.isFile(testDirName + '/not_exist.test', function (err, data) {
                        expect(err).not.toBeNull();

                        done();
                    });
                });
            });
        });

        async.it('isEmpty', function (done) {
            //isEmpty(path, callback)
            webidafs.isEmpty(testDirName + '/emptyDir', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe(true);

                //false case
                webidafs.isEmpty(testDirName, function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBe(false);

                    //file test case
                    webidafs.isEmpty(testDirName + '/testfile.test', function (err, data) {
                        expect(err).not.toBeNull();

                        //non exist case
                        webidafs.isEmpty(testDirName + '/not_exist.test', function (err, data) {
                            expect(err).not.toBeNull();

                            done();
                        });
                    });
                });
            });
        });

        async.it('stat', function (done) {
			//stat(path, callback)
            webidafs.stat(testDirName + '/testfile.test', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBeDefined();
                expect(data.filename).toBe('testfile.test');
                expect(data.isFile).toBe(true);
                expect(data.isDirectory).toBe(false);
                expect(data.size).toBeDefined();

                //directory test check
                webidafs.stat(testDirName + '/intoDir', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBeDefined();
                    expect(data.filename).toBe('intoDir');
                    expect(data.isFile).toBe(false);
                    expect(data.isDirectory).toBe(true);
                    expect(data.size).toBeDefined();

                    //non exist case check
                    webidafs.stat('not_exist.test', function (err, data) {
                        expect(err).not.toBeNull();

                        done();
                    });
                });
            });
        });

        async.it('list', function (done) {
			//list(path, recursive, callback)
            webidafs.list(testDirName, false, function (err, data) {
                expect(err).toBeNull();
                expect(data).toBeDefined();
                expect(data[0].filename).toBe('emptyDir');

                //recursice mode
                webidafs.list(testDirName, true, function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBeDefined();
                    expect(data[1].filename).toBe('intoDir');
                    expect(data[1].children).not.toBeNull();
                    expect(data[1].children[0].filename).toBe('inTestfile.test');

                    done();
                });
            });
        });

        async.it('rename', function (done) {
			//rename(oldpath, newpath, callback)
            webidafs.rename(testDirName + '/intoDir', testDirName + '/intoDir2', function (err) {
                expect(err).toBeNull();

                done();
            });
        });

        async.it('rename result check', function (done) {
            webidafs.exists(testDirName + '/intoDir2', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe(true);

                webidafs.exists(testDirName + '/intoDir', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBe(false);
                    done();
                });
            });
        });

        async.it('copy', function (done) {
            //copy(src, dest, recursive, callback)
            webidafs.copy(testDirName + '/testfile.test', testDirName + '/testfile2.test', false, function (err) {
                expect(err).toBeNull();

                //recursice mode
                webidafs.copy(testDirName + '/intoDir2', testDirName + '/intoDir3', true, function (err) {
                    expect(err).toBeNull();
                    done();
                });
            });
        });

        async.it('copy result check', function (done) {
            webidafs.exists(testDirName + '/testfile2.test', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe(true);

                webidafs.exists(testDirName + '/intoDir3', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBe(true);

                    done();
                });
            });
        });

        async.it('remove', function (done) {
			//remove(src, recursive, callback)
            webidafs.remove(testDirName + '/testfile2.test', false, function (err) {
                expect(err).toBeNull();

                //recursice mode
                webidafs.remove(testDirName + '/intoDir3', true, function (err) {
                    expect(err).toBeNull();

                    done();
                });
            });
        });

        async.it('remove result check', function (done) {
            webidafs.exists(testDirName + '/testfile2.test', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe(false);

                webidafs.exists(testDirName + '/intoDir3', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBe(false);

                    done();
                });
            });
        });

        async.it('writeFile', function (done) {
            //writeFile(path, [encoding,] data, callback)
            webidafs.writeFile(testDirName + '/testfile3.test', 'utf8',
                               'This is a file with utf8 encoding.', function (err) {
                expect(err).toBeNull();

                //data : This is a file with utf8 encoding.
                webidafs.writeFile(testDirName + '/testfile4.test', 'base64',
                                   'VGhpcyBpcyBhIGZpbGUgd2l0aCBiYXNlNjQgZW5jb2Rpbmcu', function (err) {
                    expect(err).toBeNull();

                    var file = webida.createBlobObject('This is a file.', 'application/octet-stream');
                    //var file = new Blob(['This is a file.'], {'type': 'application/octet-stream'});
                    webidafs.writeFile(testDirName + '/testfile5.test', file, function (err) {
                        expect(err).toBeNull();
                        done();
                    });

                });
            });
        });

        async.it('writeFile result check', function (done) {
            webidafs.exists(testDirName + '/testfile3.test', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe(true);

                webidafs.exists(testDirName + '/testfile4.test', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBe(true);

                    webidafs.exists(testDirName + '/testfile5.test', function (err, data) {
                        expect(err).toBeNull();
                        expect(data).toBe(true);
                        done();
                    });
                });
            });
        });

        async.it('readFile', function (done) {
            //readFile(path, encoding, callback)
            webidafs.readFile(testDirName + '/testfile3.test', 'utf8', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe('This is a file with utf8 encoding.');

                webidafs.readFile(testDirName + '/testfile4.test', 'base64', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBe('This is a file with base64 encoding.');

                    webidafs.readFile(testDirName + '/testfile5.test', 'utf8', function (err, data) {
                        expect(err).toBeNull();
                        expect(data).toBe('This is a file.');

                        done();
                    });
                });
            });
        });

        async.it('searchFiles', function (done) {
            //searchFiles(keyword, where, options, callback)
            webidafs.searchFiles('utf8', testDirName + '/testfile3.test', {}, function (err, data) {
                expect(err).toBeNull();
                //expect(data[0].filename).toBe(testDirName+'/testfile3.test');
                //expect(data[0].match[0].line).toBe(1);
                //expect(data[0].match[0].text).toBe('This is a file with utf8 encoding.');

                //error case
                webidafs.searchFiles('not_exist_contetns', testDirName, {}, function (err, data) {
                    expect(err).toBeNull();
                    expect(data[0]).toBeUndefined();

                    done();
                });
            });
        });

        //it open new windows so skip test
        //async.it('exportZip', function (done) {
            //exportZip(source)

            //webidafs.exportZip(['testdir2']);

            //done();
        //});

        async.it('archive', function (done) {
            //archive(source, target, mode,  callback)
            webidafs.archive([testDirName], testDirName + '.zip', 'create', function (err) {
                expect(err).toBeNull();

                //extract archive file
                webidafs.archive([testDirName + '.zip'], '/' + testDirName + '_extract', 'extract', function (err) {
                    expect(err).toBeNull();

                    done();
                });
            });
        });

        async.it('archive result check', function (done) {
            webidafs.exists(testDirName + '.zip', function (err, data) {
                expect(err).toBeNull();
                expect(data).toBe(true);

                webidafs.exists(testDirName + '_extract/' + testDirName + '/testfile.test', function (err, data) {
                    expect(err).toBeNull();
                    expect(data).toBe(true);

                    done();
                });
            });
        });

        describe('ACL', function () {
            var newAcl = {};
            newAcl[testUserName2] = 'r';
            var filePath = testDirName + '/testfile3.test';
            async.it('get acl from new file', function (done) {
                webidafs.getAcl(filePath, function (err, acl) {
                    expect(err).toBeFalsy();
                    expect(acl[testUserName2]).toBeFalsy();
                    done();
                });
            });
            async.it('set acl', function (done) {
                webidafs.setAcl(filePath, newAcl, function (err) {
                    expect(err).toBeFalsy();
                    webidafs.getAcl(filePath, function (err, acl) {
                        expect(err).toBeFalsy();
                        console.log('set acl test', acl, testUserName2, acl[testUserName2]);
                        expect(acl[testUserName2]).toBe('r');
                        done();
                    });
                });
            });
        });
    });

    describe('Test Application deploy using filesystem', function () {
        var async = new AsyncSpec(this);

        async.it('setup deploy directory', function (done) {
            webida.app.deleteApp('webidatestdeployapp', function (/*err*/) {
                // intentionally ignore deletApp failure

                webidafs.createDirectory(testDirName + '/deploy', false, function (err) {
                    expect(err).toBeNull();

                    var pkginfo =  [
                        '{',
                        '    "appid": "webidatestdeployapp",',
                        '    "apptype": "nodejs",',
                        '    "name": "webidatestdeployapp",',
                        '    "desc": "APP_DESC",',
                        '    "scripts": {',
                        '        "start": "node main.js"',
                        '    },',
                        '    "version": "0.0.0"',
                        '}'
                    ].join('\n');

                    var main = [
                        'var http = require("http");\n',
                        '',
                        'http.createServer(function (request, response) {\n',
                        '   response.writeHead(200, {"Content-Type": "text/plain"});',
                        '   response.write("4.11" + request.url);',
                        '   response.end();',
                        '}).listen(process.env.PORT || 8080);',
                    ].join('\n');

                    //generate package.json
                    webidafs.writeFile(testDirName + '/deploy/main.json', 'utf8', main, function (err) {
                        expect(err).toBeNull();
                        webidafs.writeFile(testDirName + '/deploy/package.json', 'utf8', pkginfo, function (err) {
                            expect(err).toBeNull();
                            done();
                        });
                    });
                });
            });
        });

        async.it('deploy app(not installed)', function (done) {
            //deployApp(srcUrl, type, callback)
            webida.app.deployApp(fsid + '/' + testDirName + '/deploy', 'nodejs', function (err) {
                expect(err).toBeNull();

                done();
            });
        });

        async.it('deploy app(installed)', function (done) {
            //deployApp(srcUrl, type, callback)
            webida.app.deployApp(fsid + '/' + testDirName + '/deploy', 'nodejs', function (err) {
                expect(err).toBeNull();

                done();
            });
        });

        async.it('deleteApp for node', function (done) {
            //deleteApp(appId, callback)
            webida.app.deleteApp('webidatestdeployapp', function (err) {
                expect(err).toBeNull();
                done();
            });
        });
    });

    describe('clean up', function () {
        //remove app for file system test
        webida.auth.signout(testUserName, function (/*err*/) {
            webida.auth.logout(function (/*err*/) {
            });
        });
    });
});

