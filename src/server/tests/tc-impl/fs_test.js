require([
    './webida-0.3',
    './config',
    './lib/async'
],
function(webida, conf, async) {
    'use strict';

    function validateToken(token) {
        return false;
    }

    function generateNewToken(cb) {
        cb(conf.personalToken);
    }

    gen = {
        validateToken: validateToken,
        generateNewToken: generateNewToken
    };

    QUnit.config.reorder = false;

    console.log('FS api unit test start. ', webida.conf.fsApiBaseUrl);

    QUnit.test('initAuth test', function(assert) {
        var done = assert.async();

        webida.auth.initAuth('anything', 'anything', gen, function(sessionID) {
            assert.notEqual(sessionID, null, 'initAuth success check');
            console.log('initAuth check done');
            done();
        });
    });

    // TODO : implement TC
});
