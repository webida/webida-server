/*
 * Copyright (c) 2012-2015 S-Core Co., Ltd.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


var Path = require('path');
var async = require('async');
var _ = require('underscore');
var readline = require('readline');
var lineReader = require('line-reader');
var Guid = require('guid');
var Replace = require('replace');
var readline = require('readline');
var stream = require('stream');
var FileQueue = require('filequeue');
var Fs = require('fs'); 
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;
var db = require('./webidafs-db').getDb();


function parseFileId(str) {
    var start = str.indexOf(':', 0);
    if (start === -1) {
        return null;
    }

    var end = str.indexOf(' -->', start);
    if (end === -1) {
        return null;
    }

    var substr = str.substring(start + 1, end);
    return substr;
}

function readFileSync(filePath) {
    var fd = Fs.openSync(filePath, 'r');
    if (!fd) {
        logger.error('can not open file', filePath); 
        return null;
    }
    var buflen = 64;
    var res = Fs.readSync(fd, buflen, 0);
    if (res[1] == 0) {
        Fs.closeSync(fd);
        return null;
    }
   
    Fs.closeSync(fd);

    //logger.debug(res[0]);
    return res[0]; 
}


function dbUpdate(fsid, fileid, filepath, cb) {
    var query = {
        fsid: fsid,
        fileid: fileid
    };

    var update = {
        fsid: fsid,
        fileid: fileid,
        filepath: filepath
    };

    db.flink.update(query, update, { upsert: true }, function (err, flinkInfo) {
        if (err) {
            logger.error('SEC:failed to update filelink - ', update, err);
            return cb(new Error('SEC:failed to update file link from database:' + err.toString()));
        }
        if (cb) {
            cb(null, flinkInfo);
        }
    });
}

var getFileLinkByPath = function (fsid, path, cb) {
    var query = { fsid: fsid, filepath: path } ;
    db.flink.find(query, function(err, rs) {
        //logger.info('file link: ', rs);
        return cb(err, rs);
    });
};

function dbGetFileId(fsid, oldPath, cb) {
    getFileLinkByPath(fsid, oldPath, function (err, rs) {
        if (err || rs.length === 0) {
            return cb(new Error('failed to get flink info from db by path'));
        } else {
            logger.info('rs = ', rs);
            var fileId = rs[0].fileid;
            return cb(null, fileId);
        }
    });
}

function dbUpdateByPath(fsid, oldPath, newPath, cb) {

    getFileLinkByPath(fsid, oldPath, function (err, rs) {
        if (err || rs.length === 0) {
            return cb(new Error('failed to get flink info from db by path'));
        } else {
            var query = {
                fsid: fsid,
                filepath: oldPath
            };

            var fileId = rs[0].fileid;
            var update = {
                fsid: fsid,
                fileid: fileId,
                filepath: newPath
            };

            db.flink.update(query, update, function (err, flinkInfo) {
                if (err) {
                    logger.error('SEC:failed to update filelink - ', update, err);
                    return cb(new Error('SEC:failed to update file link from database:' + err.toString()));
                }
                if (cb) {
                    cb(null, flinkInfo);
                }
            });
        }
    });
}

function dbInsertByPath(fsid, newFileId, newPath, cb) {
    var insertDoc = {
        fsid: fsid,
        fileid: newFileId,
        filepath: newPath
    };

    db.flink.insert(insertDoc, function (err, flinkInfo) {
        if (err) {
            logger.error('SEC:failed to update filelink', insertDoc, err);
            return cb(new Error('SEC:failed to update file link from database:' + err.toString()));
        }
        if (cb) {
            cb(null);
        }
    });
}


var dbRemoveByPath = function (fsid, filepath, cb) {
    var flinkInfo = {
        fsid: fsid,
        filepath: filepath
    };

    try {
        db.flink.remove(flinkInfo, function (err) {
            if (err) {
                //logger.error('SEC:failed to remove file link from database', flinkInfo, err);
                return cb(new Error('SEC:failed to remove file link from database:' + err.toString()));
            }
            cb(null, flinkInfo);
        });
    } catch (e) {
        logger.error(e);
    }
}


function listDir(path, callback) {
    var arrFiles = [];
    function wstat(p, cb) {
        Fs.lstat(p, function (err, stats) {
            if (err) {
                return cb(err);
            }
            // Ignore resource that is not a file or directory(eg. symbolic links)
            if (!stats.isFile() && !stats.isDirectory()) {
                return cb(null);
            }
            var filename = Path.basename(p);

            if (stats.isDirectory()) {
                Fs.readdir(p, function (err, files) {
                    if (err) {
                        return cb(err);
                    }
                    files = _.map(files, function (filename) {
                        return Path.join(p, filename);
                    });
                    list(files, function (err) {
                        if (err) {
                            return cb(err);
                        }
                        return cb(null);
                    });
                });
            } else {
                var ext = Path.extname(p);
                if (ext === '.html' || ext === '.css') {
                    arrFiles.push(p);
                }
                cb(null, p);
            }
        });
    }

    function list(paths, callback) {
        async.each(paths,
            function (path, cb) {
                wstat(path, function (err) {
                    if (err) { 
                        return cb(err); 
                    }

                    // ignore not meaningful wstat
                    return cb();
                })
            },
            function (err) {
                if (err) { 
                    return callback(err); 
                }
                callback(null, arrFiles);
            }
        );
    }

    Fs.lstat(path, function (err, stats) {
        if (err) {
            return callback(err);
        }

        if (stats.isDirectory()) {
            Fs.readdir(path, function (err, files) {
                files = _.map(files, function (filename) {
                    return Path.join(path, filename);
                });
                return list(files, callback);
            });
        } else {
            callback(new Error('Not a directory'));
        }
    });
}


module.exports.getFileList = listDir;

module.exports.removeLinkRecursive = function (fsid, dirPath, cb) {
    listDir(dirPath, function (err, fileList) {
        var fileCount = fileList.length;
        logger.info('fileCount = ', fileCount);
        if (fileCount === 0) {
            return cb(null);
        }
        var taskCount = 0;
        function recursiveRemove(callback) {
            var filePath = fileList[taskCount];
            dbRemoveByPath(fsid, filePath, function (err, flinkInfo) {
                if (!err) {
                    //logger.debug('SEC:removed - ', flinkInfo);
                }                       
                taskCount++;
                if (fileCount === taskCount) {
                    callback(null);
                } else {
                    setTimeout(recursiveRemove.bind(null, callback), 0);
                }
            });
        }

        recursiveRemove(function(err) {
            logger.info('recursive remove link is done');
            cb(null);
        });
    });
}

// this assume that src and dest have same file set.
// this must have directory lock
module.exports.updateLinkWhenDirCopy = function (fsid, dirOldPath, dirNewPath, cb) {
    logger.info('src = ', dirOldPath);
    logger.info('dst = ', dirNewPath);
    listDir(dirOldPath, function (err, oldFileList) {
        if (err) {
            return cb(err);
        } else {
            listDir(dirNewPath, function (err, newFileList) {
                if (err) {
                    return cb(err);
                } else {
                    var oldFileCount = oldFileList.length;
                    var newFileCount = newFileList.length;
                    if (newFileCount  === 0) {
                        return cb(null);
                    }
                    if (oldFileCount !== newFileCount) {
                        logger.error('file count doesn\'t match between old and new');
                        logger.info('old = ', oldFileCount);
                        logger.info('new = ', newFileCount);
                        return cb(new Error('file count doesn\'t match between old and new'));
                    }
                    logger.info('NEW FILE COUNT = ', newFileCount);
                    var taskCount = 0;
                    function recursiveUpdate(callback) {
                        var oldPath = oldFileList[taskCount];
                        var newPath = newFileList[taskCount];

                        taskCount ++; 

                        dbGetFileId(fsid, oldPath, function (err, oldFileId) {
                            if (err) {
                                copyFileLink(fsid, newPath, function (err) {
                                    if (err) {
                                        logger.error('failed to copy link:', err);
                                    }
                                    if (newFileCount !== taskCount) {
                                        setTimeout(recursiveUpdate.bind(null, callback), 0);
                                    } else {
                                        callback(null);
                                    }
                                });
                            } else {
                                var guid = Guid.create();
                                var newFileId = guid.value;
                                dbInsertByPath(fsid, newFileId, newPath, function (err) {
                                    if (err) {
                                        logger.error('failed to insert new fileid : ',err);
                                    } 
                                    // although db insertation is failed, try replace copied file with new id
                                    logger.info('old:', oldFileId);
                                    logger.info('new:', newFileId);
                                    Replace({
                                        regex: oldFileId,
                                        replacement: newFileId,
                                        paths: [ newPath ],
                                        recursive: false,
                                        silent: true,
                                    });
                                    if (newFileCount !== taskCount) {
                                        setTimeout(recursiveUpdate.bind(null, callback), 0);
                                    } else {
                                        callback(null);
                                    }
                                });
                            }
                        });
                    }

                    recursiveUpdate(function (err) {
                        logger.info('---------SEC: ------ recursive copy work for link is done');
                        return cb(err);
                    });
                }
            });
        }
    });
};

// this assume that src and dest have same file set.
// this must have directory lock
module.exports.updateLinkWhenDirMove = function (fsid, oldFileList, dirNewPath, cb) {
    listDir(dirNewPath, function (err, newFileList) {
        if (err) {
            return cb(err);
        } else {
            var oldFileCount = oldFileList.length;
            var newFileCount = newFileList.length;
            if (newFileCount  === 0) {
                return cb(null);
            }
            if (oldFileCount !== newFileCount) {
                logger.error('file count doesn\'t match between old and new');
                return cb(new Error('file count doesn\'t match between old and new'));
            }
            logger.info('NEW FILE COUNT = ', newFileCount);
            var taskCount = 0;
            function recursiveUpdate(callback) {
                var oldPath = oldFileList[taskCount];
                var newPath = newFileList[taskCount];
                taskCount ++; 
                dbUpdateByPath(fsid, oldPath, newPath, function (err, info) {
                    if (newFileCount !== taskCount) {
                        setTimeout(recursiveUpdate.bind(null, callback), 0);
                    } else {
                        callback(null);
                    }
                });
            }
            recursiveUpdate(function (err) {
                logger.info('recursive update link is done');
                return cb(err);
            });
        }
    });
};


module.exports.updateLinkInDir = function (fsid, dirPath, cb) {
    listDir(dirPath, function (err, fileList) {
        var fileCount = fileList.length;
        logger.info('fileCount = ', fileCount);
        if (fileCount   === 0) {
            return cb(null);
        }
        var taskCount = 0;
        function recursiveUpdate(callback) {
            var filePath = fileList[taskCount];
           
            taskCount ++;
            var line = readFileSync(filePath);
            if (line) {
                var fileid = parseFileId(line);
                if (!fileid) {
                    if (fileCount === taskCount) {
                        callback(null);
                    } else {
                        setTimeout(recursiveUpdate.bind(null, callback), 0);
                    }
                } else {
                    dbUpdate(fsid, fileid, filePath, function (err, ret) {
                        if (fileCount === taskCount) {
                            callback(null);
                        } else {
                            setTimeout(recursiveUpdate.bind(null, callback), 0);
                        }
                    }); 
                }
            } else {
                if (fileCount === taskCount) {
                    callback(null);
                } else {
                    setTimeout(recursiveUpdate.bind(null, callback), 0);
                }
            }
        }

        recursiveUpdate(function (err) {
            logger.info('updateLinkInDir done');
            cb(null);
        });
    });
};

var updateFileLink = function(fsid, filePath, cb) {
    var line = readFileSync(filePath);
    if (line) {
        var fileid = parseFileId(line);
        if (!fileid) {
            cb(new Error('SEC:failed to get file id'));
        } else {
            dbUpdate(fsid, fileid, filePath, cb); 
        }
    } else {
        cb(new Error('SEC:failed to read file id'));
    }
};

module.exports.updateFileLink = updateFileLink;

var copyFileLink = function(fsid, filePath, cb) {
    var line = readFileSync(filePath);
    if (line) {
        var fileid = parseFileId(line);
        if (!fileid) {
            cb(new Error('SEC:failed to get file id'));
        } else {
            var guid = Guid.create();
            var newFileId = guid.value;
            Replace({
                regex: fileid,
                replacement: newFileId,
                paths: [ filePath ],
                recursive: false,
                silent: true,
            });

            dbUpdate(fsid, fileid, filePath, cb); 
        }
    } else {
        cb(new Error('SEC:failed to read file id'));
    }
};

module.exports.copyFileLink = copyFileLink;


module.exports.removeFileLink = function (fsid, filePath, callback) {
    dbRemoveByPath(fsid, filePath, function (err, flinkInfo) {
        if (err) {
            callback(err);
        } else {
            logger.debug('SEC: removed - ', flinkInfo);
            callback(null, flinkInfo);
        }                        
    });
};

module.exports.getFileLink = function (fsid, fileid, cb) {
    var query = { fsid: fsid, fileid: fileid } ;
    db.flink.find(query, function(err, rs) {
        logger.info('file link: ', rs);
        return cb(err, rs);
    });
};


module.exports.getFileLinkByPath = function (fsid, path, cb) {
    var query = { fsid: fsid, filepath: path } ;
    db.flink.find(query, function(err, rs) {
        logger.info('file link: ', rs);
        return cb(err, rs);
    });
};


