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

'use strict';

var _ = require('lodash');
var async = require('async');
var Path = require('path');
var Fs = require('graceful-fs');
var FsExtra = require('fs-extra');
var spawn = require('child_process').spawn;
var walkDir = require('walkdir');
var Resource = require('./Resource');
var WebidaFS = require('./webidafs').WebidaFS;
var logger = require('../../common/log-manager');

var mod = {};

function _checkBinary(path, cb) {
    var buffer = new Buffer(100);

    function check(buf, len) {
        var NULL = 0;
        for (var i = 0; i < len; i = i + 1) {
            if (buf[i] === NULL) {
                return true;
            }
        }
        return false;
    }

    Fs.open(path, 'r', function (err, fd) {
        if (err) {
            logger.error(err, new Error());
            return cb(err);
        }
        Fs.read(fd, buffer, 0, buffer.length, null, function (err, bytesRead/*, buf*/) {
            if (err) {
                logger.error(err, new Error());
                return cb(err);
            }
            Fs.close(fd);
            cb(null, check(buffer, bytesRead));
        });
    });
}

mod.list = function (wfsUrl, options, callback) {
    var path = WebidaFS.getPathFromUrl(wfsUrl);
    var maxDepth = (!options.recursive) ? 1 : options.maxDepth;

    function _checkFileType(stat) {
        // Ignore resource that is not a file or directory(eg. symbolic links)
        if (stat.isFile() || stat.isDirectory()) {
            // FIXME fileOnly option seems to have no meaning.
            if (!options.dirOnly && !options.fileOnly) {
               return true;
            }
            return (options.dirOnly ? 'd' : 'f') === (stat.isDirectory() ? 'd' : 'f');
        }
        return false;
    }

    function _getChildren(data, getChildrenCallback) {
        Fs.readdir(data.basePath, function (err, childFiles) {
            if (err) {
                return getChildrenCallback(err);
            }
            if (!childFiles || childFiles.length === 0) {
                return getChildrenCallback();
            }
            var childDepth = data.depth + 1;
            var children = [];
            async.each(childFiles, function (childFile, next) {
                var childPath = Path.join(data.basePath, childFile);
                Fs.lstat(childPath, function (err, childStats) {
                    if (err) {
                        return next(err);
                    }
                    if (_checkFileType(childStats)) {
                        var childItem = {
                            name: Path.basename(childPath),
                            isDirectory: childStats.isDirectory(),
                            isFile: childStats.isFile()
                        };
                        children.push(childItem);
                        if (childItem.isDirectory && (!maxDepth || childDepth < maxDepth)) {
                            _getChildren({parentItem: childItem, basePath: childPath, depth: childDepth}, next);
                        } else {
                            next();
                        }
                    } else {
                        next();
                    }
                });
            }, function (err) {
                if (err) {
                    getChildrenCallback(err);
                } else {
                    if (data.parentItem) {
                        data.parentItem.children = children;
                    }
                    getChildrenCallback(null, children);
                }
            });
        });
    }

    Fs.lstat(path, function (err, stats) {
        if (err) {
            return callback(err);
        }
        if (stats.isDirectory()) {
            _getChildren({basePath: path, depth: 0}, function (err, children) {
                callback(err, children || []);
            });
        } else {
            callback('The root path is not a directory: ' + path);
        }
    });
};

mod.search = function (targetRsc, regKeyword, regExcludeDir, regFile, callback) {
    var rootPath = targetRsc.wfs.getRootPath();
    var walker = walkDir(targetRsc.localPath);
    var q;
    var lists = [];
    var searchEndCode = 'SEARCH_END_CODE!!';
    var isSearchEnded = false;

    function searcher(path, cb) {
        if (path === searchEndCode) {
            isSearchEnded = true;
            return cb();
        }
        _checkBinary(path, function (err, isBinary) {
            if (!isBinary) {
                Fs.readFile(path, 'utf8', function (err, str) {
                    if (err) {
                        return cb(err);
                    }
                    var match = [];
                    str.split(/\r*\n/).forEach(function (text, line) {
                        if (!regKeyword.test(text)) {
                            return;
                        }
                        match.push({
                            line: line + 1,
                            text: text
                        });
                    });

                    if (match.length) {
                        lists.push({
                            filename: '/' + Path.relative(rootPath, path),
                            match: match
                        });
                    }
                    cb();
                });
            } else {
                cb();
            }
        });
    }

    function errorHandler(err) {
        logger.error('err', err, new Error().stack);
        q.kill();
        walker.end();
        callback(err);
    }

    q = async.queue(searcher, 2);

    q.drain = function () {
        if (isSearchEnded) {
            return callback(null, lists);
        }
    };

    walker.on('file', function (file) {
        // TOFIX performance issue. This lists even ignored dirs.
        // It's much better not to list ignored dirs in the first.
        if (regExcludeDir !== null && regExcludeDir.test(Path.dirname(file))) {
            return;
        }
        if (regFile !== null && !regFile.test(file)) {
            return;
        }
        q.push(file, function (err) {
            if (err) {
                errorHandler(err);
            }
        });
    });
    walker.on('end', function () {
        q.push(searchEndCode);
    });
    walker.on('error', errorHandler);
};

mod.replace = function (rootPath, targetPaths, wholePattern, callback) {
    var args = targetPaths.concat(['-type', 'f', '-exec'])
        .concat(['sed', '-i', wholePattern, '{}', '+']);
    logger.info('replace all: ', 'find', args);

    spawn('find', args, {
        stdio: [0, 1, 2],
        cwd: rootPath
    }).on('close', function (code) {
        if (code !== 0) {
            callback('failed to replace all: ' + 'sed -i ' + wholePattern + ' ' + targetPaths.join(' '));
        } else {
            callback();
        }
    });
};

mod.zip = function (absolutePath, absoluteTarget, callback) {
    async.waterfall([
        function (cb) {
            // error check : source and target same
            if (_.contains(absolutePath, absoluteTarget)) {
                cb(new Error('Source and target path must be different.'));
            }

            // error check : source exist
            async.every(absolutePath, Fs.exists, function (exists) {
                if (exists) {
                    cb();
                } else {
                    cb(new Error('Invalid path is included'));
                }
            });
        },
        function (cb) {
            // error check : target exist
            Fs.exists(absoluteTarget, function (exists) {
                if (exists) {
                    cb(new Error(Path.basename(absoluteTarget) + ' already exists'));
                } else {
                    cb();
                }
            });
        },
        function (cb) {
            // make a zipfile
            var zip = function (path, cb2) {
                var dirname = Path.dirname(path);
                var basename = Path.basename(path);

                spawn('zip', ['-rq', absoluteTarget, basename], {
                    cwd: dirname
                }).on('close', function (code) {
                    if (code !== 0) {
                        cb2('zip failed at ' + basename);
                    } else {
                        cb2(null);
                    }
                });
            };

            async.eachSeries(absolutePath, zip, function (err) {
                if (err) {
                    return cb(new Error('Zip file createion fail.'));
                }

                Fs.exists(absoluteTarget, function (exists) {
                    if (exists) {
                        cb(null);
                    } else {
                        return cb(new Error(Path.basename(absoluteTarget) + ' does not exist'));
                    }
                });
            });
        }
    ], function (err) {
        if (err) {
            console.error(err);
            callback(err);
        } else {
            callback(null);
        }
    });
};

mod.unzip = function (absolutePath, target, rootPath, callback) {
    async.waterfall([
        function (cb) {
            // checks whether the specified source path is invalid.
            if (absolutePath.length > 1) {
                cb(new Error('only one zipfile should be speicfied'));
            }

            absolutePath = absolutePath[0];

            // error check : source exist
            Fs.exists(absolutePath, function (exists) {
                if (exists) {
                    cb();
                } else {
                    cb(new Error(Path.relative(rootPath, absolutePath) + ' does not exist'));
                }
            });
        },
        function (cb) {
            if (target === undefined) {
                // if the target path is undefined,
                //   the default target path specifies the dirname of source path + '/archive'
                target = Path.dirname(absolutePath) + '/archive';
                cb();
            } else {
                if (target[0] === '/') {
                    target = Path.resolve(rootPath, target.substr(1));
                }

                // if target path not exist then make directory
                Fs.exists(target, function (exists) {
                    if (exists) {
                        cb();
                    } else {
                        FsExtra.mkdirs(target, function (err) {
                            if (err) {
                                cb(err);
                            } else {
                                cb();
                            }
                        });
                    }
                });
            }
        },
        function (cb) {
            var sourceRelativePath = Path.relative(rootPath, absolutePath);
            var targetRelativePath = Path.relative(rootPath, target);

            // -o options is overwrite.
            // -d options extract the specified directory.
            spawn('unzip', ['-oq', sourceRelativePath, '-d', targetRelativePath], {
                stdio: [0, 1, 2], // use parent's stdio
                cwd: rootPath
            }).on('close', function (code) {
                if (code !== 0) {
                    cb(new Error('unzip failed ' + code));
                }

                cb();
            });
        }
    ], function (err) {
        if (err) {
            console.error(err);
            callback(err);
        } else {
            callback(null);
        }
    });
};

mod.copy = function (srcUrl, destUrl, recursive, callback) {
    logger.debug('FS: copy ', srcUrl, '->', destUrl);
    var srcpath = WebidaFS.getPathFromUrl(srcUrl);
    var destpath = WebidaFS.getPathFromUrl(destUrl);
    if (!srcpath || !destpath) {
        return callback(new Error('invalid path'));
    }
    // TODO check target writable permission

    // check whether same file or not
    if (srcpath === destpath) {
        return callback(new Error('source and target files are the same file'));
    }

    // copy
    Fs.exists(srcpath, function (exists) {
        if (exists) {
            if (recursive) {
                FsExtra.copy(srcpath, destpath, function (error) {
                    if (error) {
                        return callback(error);
                    }
                    callback();
                });
            } else {
                Fs.stat(srcpath, function (error, stat) {
                    if (error) {
                        return callback(error);
                    }

                    if (stat.isDirectory()) {
                        callback(new Error('not a file'));
                    } else {
                        var readStream = Fs.createReadStream(srcpath);
                        var writeStream = Fs.createWriteStream(destpath);
                        readStream.pipe(writeStream);

                        readStream.on('end', function () {
                            return callback();
                        });

                        writeStream.on('error', function (error) {
                            return callback(error);
                        });
                    }
                });
            }
        } else {
            callback(new Error('no such file or directory'));
        }
    });
};

mod.move = function (srcUrl, destUrl, callback) {
    var srcpath = WebidaFS.getPathFromUrl(srcUrl);
    var destpath = WebidaFS.getPathFromUrl(destUrl);
    if (!srcpath || !destpath) {
        return callback(new Error('invalid path'));
    }
    // TODO check target writable permission

    // check whether same file or not
    if (srcpath === destpath) {
        return callback(new Error('source and target files are the same file'));
    }

    // move
    Fs.exists(srcpath, function (exists) {
        if (exists) {
            Fs.rename(srcpath, destpath, function (error) {
                if (error) {
                    return callback(error);
                }
                return callback();
            });
        } else {
            return callback(new Error('no such file or directory'));
        }
    });
};

mod.exists = function (path, callback) {
    if (!path) {
        return callback(false);
    }
    Fs.exists(path, callback);
};

mod.stat = Fs.stat;
mod.remove = FsExtra.remove;
mod.unlink = Fs.unlink;
mod.mkdir = Fs.mkdir;
mod.mkdirs = FsExtra.mkdirs;
mod.rmdir = Fs.rmdir;
mod.createReadStream = Fs.createReadStream;
mod.createWriteStream = Fs.createWriteStream;

module.exports = mod;