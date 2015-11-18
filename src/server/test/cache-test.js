'use strict';

var assert = require('assert');
var cache = require('../common/cache');
var logger = require('../common/log-manager');
var test = cache.createCache('token');

var ext = new Date();
var value123;

ext.setDate(ext.getDate() + 1);
value123 =  {aa:'bb', expireTime : ext};

cache.enableMonitor();

test.write('123',value123, function(err, value) {
    assert.ifError(err);
    console.log('wrote token 123', value);
});

test.read('123', function(err, value) {
    assert.ifError(err);
    assert.deepEqual(value, value123, 'read object has been changed');
    console.log('read token 123', value);
});

cache.read('1234', function(err, value) {
    assert.ifError(err);
    assert.equal(value, null, 'reading ghost key should return null');
    console.log('read token 1234 - was null, as expected');
});


cache.remove('123', function(err, value) {
    assert.ifError(err);
    assert.equal(value, 1, 'removing a key should return 1');
});

cache.remove('1234', function(err, value) {
    assert.ifError(err);
    assert.equal(value, 0, 'removing a key should return 0');
});

/*
test = cache.createCache('policy');
var p = test.redis.Promise.all([
    test.write('100', { aa:100}),
    test.write('101', { aa:101}),
    test.write('102', { aa:102}),
    test.write('103', { aa:103})
]);
p.then ( function() {
    return test.remove(['100', '101']);
}).then( function() {
    return test.read('100');
}).then( function(value) {
    logger.info ("acl read 100", value);
    return test.read('103');
}).then( function(value) {
    logger.info ("acl read 103", value);
}).catch( function(err) {
    logger.test("acl test fail", err);
});
*/