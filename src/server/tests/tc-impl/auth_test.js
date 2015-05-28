require([
    './webida-0.3',
    './config',
    './lib/async'
],
function(webida, conf, async) {
    'use strict';

    var testPolicy = {
        name:'testPolicy',
        action:['fs:readFile'],
        resource:['fs:' + conf.testFS.fsid + '/.profile']
    };
    var testPolicy2 = {
        name:'testPolicy',
        effect:'deny',
        action:['fs:readFile'],
        resource:['fs:' + conf.testFS.fsid + '/.profile']
    };
    var testToken = null;
    var testSessionID = null;
    var testPassword = 'testPassword9999*!';
    var gen = null;
    var p1 = null;
    var p2 = null;
    var g1 = null;

    function validateToken(token) {
        return false;
    }

    function generateNewToken(cb) {
        cb(conf.personalToken);
    }

    gen = {
        validateToken:validateToken,
        generateNewToken:generateNewToken
    };

    console.log('auth_test.js started', webida, async);

    QUnit.config.reorder = false;

    console.log('Auth api unit test start. ', webida.conf.authApiBaseUrl);

    QUnit.test('initAuth test', function(assert) {
        var done = assert.async();

        webida.auth.initAuth('anything', 'anything', gen, function(sessionID) {
            assert.notEqual(sessionID, null, 'initAuth success check');
            console.log('initAuth check done');
            if (sessionID !== null) {
                testSessionID = sessionID;
            }
            done();
        });
    });

    QUnit.test('getMyInfo test', function(assert) {
        var done = assert.async();

        webida.auth.getMyInfo(function(err, user) {
            assert.equal(err, undefined, 'getMyInfo success check');
            assert.equal(user.uid, conf.testUser.uid, 'getMyInfo uid check');
            assert.equal(user.email, conf.testUser.email, 'getMyInfo email check');
            assert.equal(user.status, conf.testUser.status, 'getMyInfo status check');
            console.log('getMyInfo check done');
            done();
        });
    });


    QUnit.test('getLoginStatus test', function(assert) {
        var done = assert.async();

        webida.auth.getLoginStatus(function(err, user) {
            assert.notEqual(err, undefined, 'getLoginStatus success check');
            console.log('getLoginStatus check done');
            done();
        });
    });

    QUnit.test('findUser test', function(assert) {
        var done1 = assert.async();
        var done2 = assert.async();
        var done3 = assert.async();
        var done4 = assert.async();

        // find by uid
        webida.auth.findUser({ uid:conf.testUser.uid }, function(err, userArr) {
            assert.equal(err, undefined, 'findUser success check');
            assert.ok(userArr.length === 1, 'findUser user number check');
            assert.equal(userArr[0].uid, conf.testUser.uid, 'findUser uid check');
            assert.equal(userArr[0].email, conf.testUser.email, 'findUser email check');
            assert.equal(userArr[0].status, conf.testUser.status, 'findUser status check');
            console.log('findUser1 check done');
            done1();
        });

        // find by email
        webida.auth.findUser({ email:conf.testUser.email}, function(err, userArr) {
            assert.equal(err, undefined, 'findUser2 success check');
            assert.ok(userArr.length === 1, 'findUser2 user number check');
            assert.equal(userArr[0].uid, conf.testUser.uid, 'findUser2 uid check');
            assert.equal(userArr[0].email, conf.testUser.email, 'findUser2 email check');
            assert.equal(userArr[0].status, conf.testUser.status, 'findUser2 status check');
            console.log('findUser2 check done');
            done2();
        });

        // find by uid & email & status combination
        webida.auth.findUser({ email: 'es', status:1 }, function(err, userArr) {
            assert.equal(err, undefined, 'findUser3 success check');
            assert.ok(userArr.length === 2, 'findUser3 user number check');
            assert.equal(userArr[0].uid, conf.testUser.uid, 'findUser3 uid check');
            assert.equal(userArr[0].email, conf.testUser.email, 'findUser3 email check');
            assert.equal(userArr[0].status, conf.testUser.status, 'findUser3 status check');
            console.log('findUser3 check done');
            done3();
        });

        // find error
        webida.auth.findUser({ uid:'x2fg]' }, function(err, userArr) {
            assert.ok(!err, 'findUser4 success check');
            console.log('findUser4 check done', err);
            done4();
        });
    });

    QUnit.test('getToken test', function(assert) {
        var token = webida.auth.getToken();
        assert.equal(token, conf.personalToken, 'getToken success check');
        console.log('getToken check done', token);
    });

    QUnit.test('getTokenObj test', function(assert) {
        var tokenObj = webida.auth.getTokenObj();
        assert.equal(tokenObj.data, conf.personalToken, 'getTokenObj success check');
        console.log('getTokenObj check done', tokenObj.data, tokenObj.issueTime);
    });

    QUnit.test('getUserInfoByEmail test', function(assert) {
        var done = assert.async();

        webida.auth.getUserInfoByEmail(conf.testUser.email, function(err, user) {
            assert.equal(err, undefined, 'getUserInfoByEmail success check');
            assert.equal(user.uid, conf.testUser.uid, 'getUserInfoByEmail uid check');
            assert.equal(user.email, conf.testUser.email, 'getUserInfoByEmail email check');
            console.log('getUserInfoByEmail check done');
            done();
        });
    });

    QUnit.test('getSessionID test', function(assert) {
        var sessionID = webida.auth.getSessionID();
        assert.notEqual(sessionID, null, 'getSessionID success check');
        console.log('getSessionID check done', sessionID);
    });

    QUnit.test('getPersonalTokens test', function(assert) {
        var done = assert.async();

        webida.auth.getPersonalTokens(function(err, tokenArr) {
            assert.equal(err, undefined, 'getPersonalTokens success check');
            assert.equal(tokenArr.length, 1, 'getPersonalTokens count check');
            assert.notEqual(tokenArr[0].issueTime, null, 'getPersonalTokens issueTime check');
            assert.notEqual(tokenArr[0].data, null, 'getPersonalTokens value check');
            assert.equal(tokenArr[0].data, conf.personalToken, 'getPersonalTokens value check2');
            console.log('getPersonalTokens check done');
            done();
        });
    });


    QUnit.test('addNewPersonalToken test', function(assert) {
        var done = assert.async();

        webida.auth.addNewPersonalToken(function(err, token) {
            assert.equal(err, undefined, 'addNewPersonalToken success check');
            assert.ok(token !== null || token !== undefined, 'addNewPersonalToken null check');
            testToken = token;
            done();
        });
    });

    QUnit.test('deletePersonalToken test', function(assert) {
        var done = assert.async();

        webida.auth.deletePersonalToken(testToken, function(err) {
            assert.equal(err, undefined, 'deletePersonalToken success check');
            console.log('deletePersonalToken check done');
            done();
        });
    });

    QUnit.test('updateUser test', function(assert) {
        var done1 = assert.async();
        var done2 = assert.async();

        // update success
        webida.auth.updateUser({uid: conf.testUser.uid, name:'test1', company:'S-Core'}, function(err, newUser) {
            assert.equal(err, undefined, 'updateUser success check');
            console.log('updateUser check done');
            done1();
        });

        // update fail
        webida.auth.updateUser({email: conf.testUser.email, isAdmin:1}, function(err, newUser) {
            assert.notEqual(err, undefined, 'updateUser fail check');
            console.log('updateUser fail check done', err.reason);
            done2();
        });
    });

    QUnit.test('changeMyPassword test', function(assert) {
        var done = assert.async();

        async.series([
            function(callback) {
                webida.auth.changeMyPassword(conf.testUser.password, testPassword, function(err) {
                    assert.equal(err, undefined, 'changeMyPassword success check');
                    if (err === undefined) {
                        callback(null);
                    } else {
                        callback(err);
                    };
                });
            }, function(callback) {
                webida.auth.changeMyPassword(testPassword, conf.testUser.password, function(err) {
                    assert.equal(err, undefined, 'changeMyPassword success check 2');
                    console.log('changeMyPassword check 2 done');
                    if (err === undefined) {
                        callback(null);
                    } else {
                        // TODO : try again?
                        callback(err);
                    };
                });
            }
        ], function(err, results) {
            console.log('changeMyPassword check done');
            done();
        });
    });

    QUnit.test('createGroup test', function(assert) {
        var done = assert.async();

        webida.auth.createGroup({name:'testGroup1'}, function(err, group) {
            assert.equal(err, undefined, 'createGroup success check');
            console.log('createGroup check done', group.gid, group.name, group.owner);
            g1 = group;
            done();
        });
    });

    QUnit.test('getAllGroups test', function(assert) {
        var done = assert.async();
        webida.auth.getAllGroups(function(err, groupArr) {
            assert.equal(err, undefined, 'getAllGroups success check');
            assert.equal(groupArr.length, 1, 'getAllGroups count check');
            assert.deepEqual(groupArr[0], g1, 'getAllGroups group-info check');
            console.log('getAllGroups check done');
            done();
        });
    });

    QUnit.test('getMyGroups test', function(assert) {
        var done = assert.async();

        webida.auth.getMyGroups(function(err, groupArr) {
            assert.equal(err, undefined, 'getMyGroups success check');
            assert.equal(groupArr.length, 1, 'getMyGroups count check');
            assert.deepEqual(groupArr[0], g1, 'getMyGroups group-info check');
            console.log('getMyGroups check done');
            done();
        });
    });

    QUnit.test('addUserToGroup test', function(assert) {
        var done = assert.async();

        webida.auth.addUserToGroup(conf.testUser.uid, g1.gid, function(err) {
            assert.equal(err, undefined, 'addUserToGroup success check');
            console.log('addUserToGroup check done');
            done();
        });
    });

    QUnit.test('getAssignedGroups test', function(assert) {
        var done = assert.async();

        webida.auth.getAssignedGroups(function(err, groupArr) {
            assert.equal(err, undefined, 'getAssignedGroups success check');
            assert.equal(groupArr.length, 1, 'getAssignedGroups count check');
            assert.deepEqual(groupArr[0], g1, 'getMyGroups group-info check');
            console.log('getAssignedGroups check done');
            done();
        });
    });

    QUnit.test('removeUserFromGroup test', function(assert) {
        var done = assert.async();

        webida.auth.removeUserFromGroup(conf.testUser.uid, g1.gid, function(err) {
            assert.equal(err, undefined, 'removeUserToGroup success check');
            console.log('removeUserToGroup check done');
            done();
        });
    });

    QUnit.test('addUsersToGroup test', function(assert) {
        var done = assert.async();

        webida.auth.addUsersToGroup([conf.testUser.uid, conf.testUser2.uid], g1.gid, function(err) {
            assert.equal(err, undefined, 'addUsersToGroup success check');
            console.log('addUsersToGroup check done');
            done();
        });
    });

    QUnit.test('getGroupMembers test', function(assert) {
        var done = assert.async();

        webida.auth.getGroupMembers(g1.gid, function(err, userArr) {
            assert.equal(err, undefined, 'getGroupMembers success check');
            assert.equal(userArr.length, 2, 'getGroupMembers count check');
            console.log('getGroupMembers check done', userArr[0].uid, userArr[0].email, userArr[1].uid, userArr[1].email);
            done();
        });
    });

    QUnit.test('removeUsersFromGroup test', function(assert) {
        var done = assert.async();

        webida.auth.removeUsersFromGroup([conf.testUser.uid, conf.testUser2.uid], g1.gid, function(err) {
            assert.equal(err, undefined, 'removeUsersFromGroup success check');
            console.log('removeUsersFromGroup check done');
            done();
        });
    });

    QUnit.test('deleteGroup test', function(assert) {
        var done = assert.async();

        webida.auth.deleteGroup(g1.gid, function(err) {
            assert.equal(err, undefined, 'deleteGroup success check');
            console.log('deleteGroup check done');
            g1 = null;
            done();
        });
    });


    QUnit.test('createPolicy test', function(assert) {
        var done = assert.async();

        webida.acl.createPolicy(conf.testPolicy, function(err, policy) {
            assert.equal(err, undefined, 'createPolicy success check');
            p1 = policy;
            done();
        });
    });

    QUnit.test('getOwnedPolicy test', function(assert) {
        var done = assert.async();

        webida.acl.getOwnedPolicy(function(err, policyArr) {
            assert.equal(err, undefined, 'getOwnedPolicy success check');
            assert.equal(policyArr.length, 5, 'getOwnedPolicy length check');
            console.log('getOwnedPolicy check done', policyArr.length);
            done();
        });
    });

    QUnit.test('assignPolicy test', function(assert) {
        var done = assert.async();

        async.series([
            function(callback) {
                webida.auth.createGroup({name:'testGroup2'}, function(err, group) {
                    assert.equal(err, undefined, 'assignPolicy createGroup success check');
                    if (!err) {
                        g1 = group;
                    }
                    callback(err);
                });
            }, function(callback) {
                webida.acl.assignPolicy([conf.testUser.uid, g1.gid], p1.pid, function(err) {
                    assert.equal(err, undefined, 'assignPolicy success check');
                    callback(err);
                });
            }
        ], function(err) {
            if (err) {
                assert.ok(false, 'assignPolicy test failed');
            }

            console.log('assignPolicy check done');
            done();
        });
    });

//  TODO : getAssignedGroup() api is not implemented
//    QUnit.test('getAssignedGroup test', function(assert) {
//        var done = assert.async();
//
//        webida.acl.getAssignedGroup(p1.pid, function(err, groupArr) {
//            assert.equal(err, undefined, 'getAssignedGroup success check');
//            assert.equal(groupArr.length, 1, 'getAssignedGroup length check');
//            assert.deepEqual(groupArr[0], g1, 'getAssignedGroup group-info check');
//            done();
//        });
//    });


    QUnit.test('getAssignedPolicy test', function(assert) {
        var done = assert.async();

        webida.acl.getAssignedPolicy(g1.gid, function(err, policyArr) {
            assert.equal(err, undefined, 'getAssignedPolicy success check');
            assert.equal(policyArr.length, 1, 'getAssignedPolicy length check');
            assert.deepEqual(policyArr[0], p1, 'getAssignedGroup group-info check');
            console.log('getAssignedPolicy check done', policyArr.length);
            done();
        });
    });

    QUnit.test('getAssignedUser test', function(assert) {
        var done = assert.async();

        webida.acl.getAssignedUser(p1.pid, function(err, userArr) {
            assert.equal(err, undefined, 'getAssignedUser success check');
            assert.equal(userArr.length, 1, 'getAssignedUser length check');
            assert.deepEqual(userArr[0].uid, conf.testUser.uid, 'getAssignedUser user-info check');
            done();
        });
    });

    QUnit.test('getPolicies test', function(assert) {
        var done = assert.async();

        webida.acl.getPolicies([p1.pid], function(err, policyArr) {
            assert.equal(err, undefined, 'getPolicies success check');
            assert.equal(policyArr.length, 1, 'getPolicies length check');
            assert.deepEqual(policyArr[0], p1, 'getPolicies policy_info check');
            console.log('getPolicies check done');
            done();
        });
    });

    QUnit.test('updatePolicy test', function(assert) {
        var done = assert.async();

        webida.acl.updatePolicy(p1.pid, conf.testPolicy2, function(err) {
            assert.equal(err, undefined, 'updatePolicy success check');
            console.log('updatePolicy check done');
            done();
        });
    });

    QUnit.test('removePolicy test', function(assert) {
        var done = assert.async();

        webida.acl.removePolicy(conf.testUser.uid, p1.pid, function(err) {
            assert.equal(err, undefined, 'removePolicy success check');
            console.log('removePolicy check done');
            done();
        });
    });

    QUnit.test('deletePolicy test', function(assert) {
        var done = assert.async();

        webida.acl.deletePolicy(p1.pid, function(err) {
            assert.equal(err, undefined, 'deletePolicy success check');
            console.log('deletePolicy check done');
            done();
        });
    });

    QUnit.test('createPolicies test', function(assert) {
        var done = assert.async();

        webida.acl.createPolicies([conf.testPolicy, conf.testPolicy2], function(err, policyArr) {
            assert.equal(err, undefined, 'createPolicies success check');
            assert.equal(policyArr.length, 2, 'createPolicies length check');
            p1 = policyArr[0];
            p2 = policyArr[1];
            done();
        });
    });

    QUnit.test('assignPolicies test', function(assert) {
        var done = assert.async();

        async.series([
            function(callback) {
                webida.acl.assignPolicies(g1.gid, [p1.pid, p2.pid], function(err) {
                    assert.equal(err, undefined, 'assignPolicies success check');
                    console.log('assignPolicies check done');
                    callback(null);
                });
            }, function(callback) {
                webida.auth.deleteGroup(g1.gid, function(err) {
                    callback(null);
                });
            }, function(callback) {
                webida.acl.deletePolicy(p1.pid, function(err) {
                    callback(null);
                });
            }, function(callback) {
                webida.acl.deletePolicy(p2.pid, function(err) {
                    callback(null);
                    done();
                });
            }
        ]);
    });

    // TODO: getAuthorizedUser, getAuthorizedGroup, getAuthorizedRsc
});
