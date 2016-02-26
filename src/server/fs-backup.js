'use strict';

var path = require('path');
var async = require('async');
var fs = require('fs');
var fsex = require('fs-extra');
var exec = require('child_process').exec;

var config = require('./common/conf-manager').conf;
var fsdb = require('./fs/lib/webidafs-db').getDb();
var fsPath = config.services.fs.fsPath;
var backupPath = path.join(fsPath, 'backup');

function prepare(callback) {
    console.log('prepare backup dir: ' + backupPath);
    fsex.mkdirs(backupPath, callback);
}

function backup(fsid, callback) {
    var source = path.join(fsPath, fsid);
    var target = path.join(backupPath, fsid);

    console.log('backup ' + fsid);
    fs.exists(source, function (exists) {
        if (!exists) {
            console.log('skip - ' + fsid);
            return callback(null);
        }

        var cmd = 'cp -a ' + source + '/. ' + target;
        console.log('cmd: ' + cmd);
        exec(cmd, function (err) {
            if (err) {
                console.log('move ' + source + ' to ' + target +
                    ' failed', err);
                return callback(err);
            }
            return callback(null);
        });
    });
}

function backupFSIDs(callback) {
    console.log('backup all fsids to dir: ' + backupPath);
    fsdb.wfs.$find({}, function (err, context) {
        if (err) {
            console.log('list fsids failed');
            return callback(err);
        }

        var fsids = context.result();
        if (fsids.length === 0) {
            return callback(null);
        }

        async.eachSeries(fsids, function (entry, next) {
            backup(entry.fsid, next);
        }, callback);
    });
}

async.series([
    prepare,
    backupFSIDs,
], function (err) {
    if (err) {
        console.log('backup failed.', err);
        process.exit(1);
    } else {
        console.log('backup completed.');
        process.exit();
    }
});

