'use strict';

var fs = require('fs');
var fsex = require('fs-extra');
var WebidaFS = require('../webidafs').WebidaFS;
var ContainerExec = require('./exec').ContainerExec;

function createFs(fsid, callback) {
    var rootPath = (new WebidaFS(fsid)).getRootPath();
    fs.mkdir(rootPath, function (err) {
        if (err) {
            return callback(err);
        }
        return callback(null, rootPath);
    });
}
exports.createFs = createFs;

function deleteFs(fsid, immediate, callback) {
    if (!immediate) {
        return callback(null);
    }

    var rootPath = (new WebidaFS(fsid)).getRootPath();
    fsex.remove(rootPath, callback);
}
exports.deleteFs = deleteFs;

function getContainerExec(wfs, cmd, args, options, callback) {
    var cexec = new ContainerExec(wfs, cmd, args, options);
    callback(null, cexec);
}
exports.getContainerExec = getContainerExec;

exports.supportTerminal = function () {
    return false;
};
