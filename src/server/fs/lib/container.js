'use strict';

var conf = require('../../common/conf-manager').conf;
var config;
var container;
var TYPE = Object.freeze({
    NONE:   'none',
    LXC:    'lxc',
    DOCKER: 'docker'
});

var type = TYPE.NONE;
if (conf.services.fs.container) {
    config = conf.services.fs.container;
    if (config.type) {
        type = config.type;
    }
} else if (conf.services.fs.lxc) {
    config = conf.services.fs.lxc;
    if (config.useLxc) {
        type = TYPE.LXC;
    }
}

if (type === TYPE.DOCKER) {
    if (conf.services.fs.linuxfs === 'btrfs') {
        throw new Error('Unsupported configuration: docker and btrfs');
    }
}

container = require('./container/' + type);
exports.container = container;
