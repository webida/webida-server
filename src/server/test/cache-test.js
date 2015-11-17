'use strict';

var cache = require('../common/cache');

var test = cache.createCache('token');

cache.enableMonitor();

var ext = new Date(); 
ext.setDate(ext.getDate() + 1); 
test.write('123', {aa:'bb', expireTime : ext}, function(err) {
    if (err) {
        console.error(err);
    }
    else {
        console.log('saved...');
    }
});

test.read('123', function(err, value) {
    if (err) {
        console.error(err);
    }
    else {
        console.log('loaded...', value);
    }
});
