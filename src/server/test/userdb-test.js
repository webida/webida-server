/**
 * Created by kyungmi.koong on 2015-05-20.
 */

'use strict';

var assert = require('assert');
var userdb = require('../auth/lib/userdb');

/*var newUser = {
    email: 'new.user@test.com',
    password: '1234',
    name: 'newUser',
    activationKey: 'chpnlwglr028im2gvlu1f7q5g',
    status: 1,
    isAdmin: 0
};
userdb.addUser(newUser, function(err, result){
    if(err){
        console.error(err);
    } else {
        console.log('addUser result', result);
    }
});

var newGroup = {
    name: 'new group',
    owner: 'testtest',
    userdata: 'user data'
};

userdb.createGroup(newGroup, function(err, result){
    if(err){
        console.error(err);
    } else {
        console.log('createGroup result', result);
    }
});*/

var oauthClientId = 'client_' + new Date().getTime();

var updateClient = {
    clientID: oauthClientId,
    clientSecret: 'oauth client secret updated',
    redirectURL: 'http://updated.place.com'
};

var addClient = {
    name: 'test client',
    oauthClientId: oauthClientId,
    oauthClientSecret: 'oauth client secret',
    redirectUrl: 'http://some.place.com/',
    isSystem: 1
};

userdb.addClient(addClient, function(err, result){
        if(err){
            console.error(err);
        } else {
            assert.equal(result.name, 'test client');
            assert.equal(result.oauthClientId, oauthClientId);
            assert.equal(result.oauthClientSecret, 'oauth client secret');
            assert.equal(result.redirectUrl, 'http://some.place.com/');
            assert.equal(result.isSystem, 1);
            console.log('addClient result', result);
            userdb.updateClient(updateClient, function(err){
                if(err){
                    console.error(err);
                } else {
                    userdb.findClientByClientID(oauthClientId, function(err, result){
                       if(err){
                           console.error(err);
                       } else {
                           assert.equal(result.name, 'test client');
                           assert.equal(result.oauthClientId, oauthClientId);
                           assert.equal(result.oauthClientSecret, updateClient.clientSecret);
                           assert.equal(result.redirectUrl, updateClient.redirectURL);
                           assert.equal(result.isSystem, 1);
                       }
                    });
                }
            });
        }
    }
);
