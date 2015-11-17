'use strict';

var cache = require('../common/cache');

var test = cache.createCache('token');

cache.enableMonitor();

test.set('123', {aa:'bb'}, function(err) {
    if (err) {
        console.error(err);
    }
    else {
        console.log('saved...');
    }
});

test.get('123', function(err, value) {
    if (err) {
        console.error(err);
    }
    else {
        console.log('loaded...', value);
    }
});