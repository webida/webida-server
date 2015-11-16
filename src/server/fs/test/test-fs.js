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

var xexports = {};
var _ = require('underscore');
var async = require('async');
var path = require('path');
var fs = require('fs');
var w = require('../node_modules/webida-library/webida/src/webida-0.3');
var authMgr = require('../node_modules/webida-server-lib/lib/auth-manager');
var conf = require('../node_modules/webida-server-lib/lib/conf-manager').conf;

var db = require('mongojs').connect('webida_fs_test', ['wfs', 'wfs_del']);

var account = {email: 'test1@webida.org', uid: 200000, isAdmin: false};

var app;


authMgr.ensureLogin = function(req, res, next) {
    req.user = {};
    req.user.uid = account.uid;
    req.user.isAdmin = account.isAdmin;
    next();
}
authMgr.getUserInfo = function(req, res, next) {
    req.user = {};
    req.user.uid = account.uid;
    req.user.isAdmin = account.isAdmin;
    next();
}
require('../node_modules/webida-server-lib/lib/utils').getEmail = function (uid, cb) {
    cb(null, account.email);
};

var tokenGen = {};
tokenGen.validateToken = function (token) {
    return true;
};

tokenGen.generateNewToken = function (cb) {
    console.log('generateNewToken');
    cb();
};

exports['Test setup'] = {
    'setup': function (test) {
        async.series([
            function(callback){
                console.log('clear previous db');
                db.dropDatabase(callback);
            },
            function(callback) {
                //conf.logPath = path.normalize(__dirname + '/log');
                conf.logPath = null;
                conf.httpPort =  9903;
                conf.httpsPort = null;
                conf.fsDb = 'mongodb://localhost:27017/webida_fs_test';
                conf.fsPath = __dirname + '/fs';
                conf.fsPolicy.numOfFsPerUser = 2;
                conf.fsPolicy.fsQuotaInBytes = 1024 * 1024 * 100; // 100MiB
                //w.conf.webidaHost = 'http://localhost:' + conf.httpPort;
                w.conf.fsServer = 'http://localhost:' + conf.httpPort;
                w.conf.fsApiBaseUrl = w.conf.fsServer + '/webida/api/fs';
                console.log(w.conf);
                w.auth.getMyInfo = function (callback) {
                    callback(null, account);
                };
                console.log('setup test conf and run test install.', conf);
                callback();
            },
            function (callback) {
                console.log('Run test fs server.');
                app = require('../server-fs');
                setTimeout(callback, 1000);
            },
            function (callback) {
                console.log('init webida.js auth.');
                w.auth.initAuth('clientId', 'nourl', tokenGen);
                callback();
            }
        ],
        function (err, result) {
            if (err) {
                console.log('FS server install or initialize failed.');
                process.exit(1);
            } else {
                console.log('FS server installed and initialized successfully.');
                test.done();
            }
        });
    }
};

var testData = {};
exports['Test FSService(default)'] = {
    'addMyFS': function (test) {
        w.fs.addMyFS(function (err, fsinfo) {
            test.ok(!err, err);
            if (err) { return test.done(); }
            console.log('addMyFS', arguments);
            testData.fsinfo1 = fsinfo;
            var fs = w.fs.mountByFsid(testData.fsinfo1.fsid);
            fs.exists('/', function (err, exists) {
                test.ok(!err, err);
                test.ok(exists, 'FS should exists');
                test.done();
            });
        });
    },
    'getMyFilesystem': function (test) {
        w.fs.getMyFilesystem(function (err, myfs) {
            test.ok(!err, err);
            if (err) { return test.done(); }
            test.equal(myfs.fsid, testData.fsinfo1.fsid);
            myfs.exists('/', function (err, exists) {
                test.ok(!err, err);
                test.ok(exists, 'FS should exists');
                test.done();
            });
        });
    },
    'getMyFSInfos': function (test) {
        w.fs.getMyFSInfos(function (err, fsinfos) {
            test.ok(!err, err);
            if (err) { return test.done(); }
            test.equal(fsinfos.length, 1);
            if (fsinfos.length <= 0) { return test.done(); }
            test.equal(fsinfos[0].fsid, testData.fsinfo1.fsid);
            test.equal(fsinfos[0].owner, account.uid);
            test.done();
        });
    },
    'deleteFilesystem': function (test) {
        var fsid = testData.fsinfo1.fsid;
        w.fs.deleteFilesystem(fsid, function (err) {
            test.ok(!err, err);
            if (err) { return test.done(); }
            var fs = w.fs.mountByFsid(fsid);
            fs.exists('/', function (err, exists) {
                test.ok(err, 'This should fail');
                db.wfs.findOne({fsid: fsid}, function (err, fsinfo) {
                    test.ok(!err, err);
                    test.ok(!fsinfo, 'This should be undefined');
                    db.wfs_del.findOne({fsid: fsid}, function (err, delInfo) {
                        test.ok(!err, err);
                        test.equal(delInfo.fsid, fsid);
                        test.done();
                    });
                });
            });
        });
    },
    'fsPolicy - numOfFsPerUser': function (test) {
        // numOfFsPerUser is set to 2 above
        w.fs.addMyFS(function (err, fsinfo) {
            test.ok(!err, err);
            if (err) { return test.done(); }
            w.fs.addMyFS(function (err, fsinfo) {
                test.ok(!err, err);
                // this should fail
                w.fs.addMyFS(function (err, fsinfo) {
                    test.ok(err, err);
                    test.done();
                });
            });
        });
    },
    'deleteMyFilesystems': function (test) {
        w.fs.deleteMyFilesystems(function (err) {
            test.ok(!err, err);
            if (err) { return test.done(); }
            test.done();
        });
    }
};

exports['Test FSService(Btrfs)'] = {
    'setBtrfs': function (test) {
        require('../lib/fs-manager').setLinuxFS(require('../lib/linuxfs/btrfs'));
        conf.fsPath = __dirname + '/btrfs';
        test.done();
    }
};
var defaultFSServiceTests = _.clone(exports['Test FSService(default)']);
var quotaTests = {
    'setup for quota test': function (test) {
        w.fs.addMyFS(function (err, fsinfo) {
            test.ok(!err, err);
            testData.fsinfo1 = fsinfo;
            test.done();
        });
     },
    'getQuotaUsage': function (test) {
        // run `sync` to commit data to storage
        var fs = w.fs.mountByFsid(testData.fsinfo1.fsid);
        fs.getQuotaUsage(function (err, usage) {
            test.ok(!err, err);
            test.ok(usage === 4096, 'Newly created fs should take up only 4096 bytes(including metadata)');
            test.done();
        });
    },
    'getQuotaLimit': function (test) {
        var fs = w.fs.mountByFsid(testData.fsinfo1.fsid);
        fs.getQuotaLimit(function (err, limit) {
            test.ok(!err, err);
            test.ok(limit === conf.fsPolicy.fsQuotaInBytes, 'Quota limit is not properly set');
            test.done();
        });
    }
};
_.extend(exports['Test FSService(Btrfs)'], defaultFSServiceTests, quotaTests);

exports['Test General Operations'] = {
    'exists': function (test) {
        test.done();
    },
    'stat': function (test) {
        var wfs = w.fs.mountByFsid(testData.fsinfo1.fsid);
        var testfile = '/test-stat.txt';
        var filepath = path.join(__dirname, 'btrfs', testData.fsinfo1.fsid, testfile);
        console.log('stat filepath', filepath);
        var err = fs.appendFileSync(filepath, 'test-stat.txt file contents');
        test.ok(!err, err);
        wfs.stat([testfile], function (err, wstats) {
            console.log('wstats', wstats);
            test.ok(!err, err);
            test.ok(wstats);
            var wstat = wstats[0];
            test.equal(wstat.name, path.basename(testfile));
            test.ok(wstat.isFile);
            test.ok(!wstat.isDirectory);
            test.ok(wstat.size);
            test.done();
        });
    },
    'alias': function (test) {
        var wfs = w.fs.mountByFsid(testData.fsinfo1.fsid);
        var testfile = '/test-alias.txt';
        var filepath = path.join(__dirname, 'btrfs', testData.fsinfo1.fsid, testfile);
        console.log('alias filepath', filepath);
        var err = fs.appendFileSync(filepath, 'test-alias.txt file contents');
        test.ok(!err, err);
        wfs.addAlias(testfile, 100, function (err) {
            test.ok(!err, err);
            require('../lib/fs-alias').getNumOfAliasPerOwner(account.uid, function (err, count) {
                test.ok(!err, err);
                test.equal(count, 1);
                test.done();
            });
        });
    },
};

/*
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
        */


/*
exports['Test ACL'] = {
};

exports['Test Alias'] = {
};

exports['Test Metadata'] = {
};

exports['Test Archive'] = {
};

exports['Test Search'] = {
};
*/



/*
    async.it('exists', function (done) {
        //exists(path, callback)
        webidafs.exists('.userinfo', function (err, data) {
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
*/

exports['Test cleanup'] = {
    'cleanup': function (test) {
        console.log('cleanup');
        db.dropDatabase();
        db.close();
        app.close();
        test.done();
    }
};

