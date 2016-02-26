'use strict';

var _ = require('lodash');
var path = require('path');
var async = require('async');
var fs = require('fs');
var exec = require('child_process').exec;

var config = require('./common/conf-manager').conf;
var linuxfs = require('./fs/lib/linuxfs/' + config.services.fs.linuxfs);
var fsdb = require('./fs/lib/webidafs-db').getDb();
var fsPath = config.services.fs.fsPath;

if (config.services.fs.container.type !== 'docker') {
    throw new Error('Invalid container type');
}

function createDockerContainer(fsid, callback) {
    var target = path.join(fsPath, fsid);
    var cmd;
    var template;
    var containerConfig = config.services.fs.container;

    template = _.template(
        'sudo docker create -i ' +
        '-v <%= workDir %>:/fs:private ' +
        '-h <%= hostName %> ' +
        '--name <%= cName %> ' +
        '<% ' +
        '_.forEach(volumes, function (volume) { %>' +
            '-v <%- volume %> ' +
            '<% });' +
        '%> ' +
        '<%= imageName %> ' +
        '/bin/bash');
 
    cmd = template({
        workDir: target,
        hostName: containerConfig.docker.hostname,
        cName: containerConfig.namePrefix + fsid,
        volumes: containerConfig.docker.volumes,
        imageName: containerConfig.docker.imageName
    });
 
    console.log('migrate docker container create cmd: ' + cmd);
    exec(cmd, function (err) {
        if (err) {
            return callback(err);
        }
        return callback(null);
    });
}

function migrate(fsid, callback) {
    var target = path.join(fsPath, fsid);

    console.log('migrate ' + fsid);

    // check directory exists (fsid matched)
    fs.exists(target, function (exists) {
        if (!exists) {
            console.log('create fs - ' + fsid);
            linuxfs.createFS(fsid, function (err) {
                if (err) {
                    console.log('create fs failed', err);
                    return callback(err);
                }
                createDockerContainer(fsid, callback);
            });
        }
        createDockerContainer(fsid, callback);
    });
}

function migrateFSIDs(callback) {
    console.log('migrate all fsids');
    fsdb.wfs.$find({}, function (err, context) {
        var fsids;
        if (err) {
            console.log('list fsids failed');
            return callback(err);
        }

        fsids = context.result();
        if (fsids.length === 0) {
            return callback(null);
        }

        async.eachSeries(fsids, function (entry, next) {
            migrate(entry.fsid, next);
        }, callback);
    });
}

async.series([
    migrateFSIDs,
], function (err) {
    if (err) {
        console.log('lxc-to-docker failed.', err);
        process.exit(1);
    } else {
        console.log('lxc-to-docker completed.');
        process.exit();
    }
});
