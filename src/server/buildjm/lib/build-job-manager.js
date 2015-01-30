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

'use strict'

var Path = require('path');
var URI = require('URIjs');
var cuid = require('cuid');
var dnode = require('dnode');
var fs = require('fs');
var HashMap = require('hashmap').HashMap;
var mkdirp = require('mkdirp');
var glob = require('glob');

var authMgr = require('../../common/auth-manager');
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;
var fsClient = require('../../common/fs-client');
var build = require('./build');

var cmn = require('./build-common');
var dbgHandler = require('./debugmode-handler');

var g_workPath = config.services.buildjm.wsDir; //'./workspaces';
var apk_pattern = 'platforms/android/**/ant-build/*-debug.apk';

//./test/mobilesample/out/pf1/t11-release-unsigned.apk
//./test/mobilesample/out/pf1/t11-debug-unaligned.apk
//./test/mobilesample/out/pf1/t11-debug.apk

var taskMap = new HashMap();

var eBuildState = cmn.eBuildState;
var eResult = cmn.eResult;
var setBuildState = cmn.setBuildState;
var BuildError = cmn.BuildError;


var rmdir = function(dir) {
    var list = fs.readdirSync(dir);
    for (var i = 0; i < list.length; i++) {
        var filename = Path.join(dir, list[i]);
        var stat = fs.statSync(filename);
        
        if (filename == "." || filename == "..") {
        } else if (stat.isDirectory()) {
            rmdir(filename);
        } else {
            fs.unlinkSync(filename);
        }
    }
    fs.rmdirSync(dir);
};
    
function enterTask(targetDir) {
    var tmp = taskMap.get(targetDir);
    if (!tmp) {
        taskMap.set(targetDir, targetDir);
        return true;
    }
    return false;
}

function leaveTask(res) {
    var tmp = taskMap.get(res);
    if (tmp) {
        taskMap.remove(res);   
    } else {
        logger.error('task does not exist');
    }
}

function getTargetDir(userSrl, wsName, projName, profileName) {
    var targetDir = g_workPath + '/' +  userSrl + '/' + wsName + '/' + projName + '/' + profileName;
    return targetDir;
}


/*
 * message handlers
 */


function getProjFromFS(token, fsid, workName, projName, targetDir, cb) {
    // var token = 'chqyzhz270000g86akfoffris';
    // downlaod project                                                                
    var appDir = Path.join(targetDir, '/' + projName);
    fsClient.getProj(token, fsid, workName, projName, targetDir, function(err, dlPath) {
        if (err != 0) {
            return cb(1, appDir);
        }

        logger.info('appDir = ', appDir); 

        build.init(appDir, function(err) {
            if (err) {
                logger.error(err);
                cb(1, appDir);
            } else {
                cb(0, appDir);       
            } 
        });
    }); 
}


/*
 * create build dir where 'workspace/{userid}/{workspaceName}/{projectName}/{profileName}/
 */

function makeBuildDir(token, fsid, workName, projName, userId, profileName, cb) {
    var targetDir = g_workPath + '/' +  userId + '/' + workName + '/' + projName + '/' + profileName;
    fs.exists(targetDir, function(exists) {
        if (exists) {
            getProjFromFS(token, fsid, workName, projName, targetDir, cb);
        } else {
            mkdirp(targetDir, function (e) {
                if (e) {
                    logger.error('failed to mkdirp', e);
                    cb(e);
                } else {
                    getProjFromFS(token, fsid, workName, projName, targetDir, cb);
                }
            });
        }
    });
}

var TaskInfo = function(taskId, userSrl, projName) {
    this.taskId = taskId;
    this.userSrl = userSrl;
    this.projName = projName;
};


var BuildParam = function(token, pf, platformInfo, taskInfo, task, cb) {
    this.token = token;
    this.targetDir = getTargetDir(taskInfo.userSrl, pf.workspaceName, pf.projectName, pf.profileName);
    this.pf = pf;
    this.platformInfo = platformInfo;
    this.taskInfo = taskInfo;
    this.task = task;
    this.cb = cb;
}

function BuildFail(buildState, param, msg) {
    var resultVal = {
        ret : 'fail',
        taskInfo : param.taskInfo,
        state : buildState,
        msg : msg
    };
    
    logger.error(JSON.stringify(resultVal));
    leaveTask(param.targetDir);
    param.cb(2, resultVal, param.task);
}

function BuildOk(param, uri) {
    var ret =  {
        ret : 'succ',
        taskId : param.taskInfo.taskId,
        userSrl : param.taskInfo.userSrl,
        projId : param.pf.projectName,
        profName : param.pf.profileName,
        uri : uri
    };         

    leaveTask(param.targetDir);
    return param.cb(0, ret, param.task);
}

function BuildAbort(buildState, param, msg) {
    var resultVal = {
        ret : 'fail',
        taskInfo : param.taskInfo,
        state : buildState,
        msg : msg
    };
    
    logger.error(JSON.stringify(resultVal));
    param.cb(2, resultVal, param.task);
}


function makeBuildState(taskInfo, buildState) {
    var resultVal = {
        ret : 'progress',
        info : taskInfo,
        state : buildState,
    };

    logger.info(JSON.stringify(resultVal));
    return resultVal;
}

function setBuildState(buildState, param) {
    var msg = makeBuildState(param.taskInfo, buildState);
    param.cb(1, msg, param.task);
}

function checkDebugScript(isDebug, filePath, srcScript, cb) {
    if (isDebug) {
        dbgHandler.injectDebugScript(filePath, srcScript, function (err) {
            cb(err);
        });
    } else {
        dbgHandler.removeDebugScript(filePath, srcScript, function (err) {
            cb(err);
        });
    }
}


function makeKeystoreDir(targetDir, cb) { 
    fs.exists(targetDir, function (exists) {
        if (exists) {
            return cb();
        } else {
            fs.mkdir(targetDir, function (e) {
                if (!e || (e && e.code == 'EEXIST')) {
                    return cb();
                } else {
                    cb(e);
                }
            });
        }
    });
}

function runBuild(isDebug, appDir, fsid, param) {
    logger.debug('build appdir = ', appDir); 
    //var filePath = Path.join(appDir, '/platforms/android/assets/www/index.html');
    var filePath = Path.join(appDir, '/www/index.html');
    var srcScript = config.debugHostUrl + '/target/target-script-min.js#' + param.pf.projectSrl;
    checkDebugScript(isDebug, filePath, srcScript, function(err) {
        if (err) {
            return BuildFail(eBuildState.eBuild, param, err);
        } else {
            setBuildState(eBuildState.eBuild, param);
            build.build(appDir, isDebug, function (err, stdout, stderr) {
                if (err) {
                    return BuildFail(eBuildState.eBuild, param, stderr);
                }
                var pkgs = [];
                var apk_pattern = 'platforms/android/**/ant-build/*-' +  param.pf.buildType + ((isDebug) ? '.apk' : '-unsigned.apk');
                logger.debug('apk pattern - ', apk_pattern);
                glob(apk_pattern, { cwd: appDir }, function (err, files) {
                    // TODO : need to check that does not return sometime
                    if (err) {
                        return BuildFail(eBuildState.eBuild, param, stderr);
                    }
                    files.forEach(function (file) {
                        var pkgPath = Path.join(appDir, file);
                        var outDir = Path.dirname(pkgPath);
                        logger.info('app dir = ', appDir);
                        logger.info('out dir = ', outDir);
                        logger.info('pkg path =', pkgPath);
                      
                        var fsOutDir = '/out/'; 
                        if (!isDebug && param.pf.ksInfo) {
                            // download keystore file from fs
                            if (!param.pf.ksInfo.filename) {
                                return BuildFail(eBuildState.eSigning, param,'invalid keystore filename');
                            }
                            var ksUriPath = '.keystore/' + param.pf.ksInfo.filename;
                            logger.info('ksUriPath = ', ksUriPath);
                            var ksDownloadDir = g_workPath +  '/' + param.taskInfo.userSrl + '/.keystore/';
                            var ksDownloadPath = ksDownloadDir + param.pf.ksInfo.filename;
                           
                            makeKeystoreDir(ksDownloadDir, function (e) {
                                if (e) {
                                    return BuildFail(eBuildState.eSigning, param, 'Signing failure: can not create keystore directory');
                                }
                                logger.info('ksDownloadPath = ', ksDownloadPath);
                                fsClient.getFile(param.token, fsid, ksUriPath, ksDownloadPath, function (err)  {
                                    if (err) {
                                        logger.error('Failed to fsClient.getFile uripath(' + ksUriPath + '), download path (' + ksDownloadPath + '), error = ', err);
                                        return BuildFail(eBuildState.eSigning, param, 'Signing failure: failed to get keystore file from your file system');
                                    } else {
                                        logger.info('signing...');
                                        build.sign(outDir, param.platformInfo.packageName, ksDownloadPath, pkgPath, 
                                                param.pf.signing.alias, param.pf.ksInfo.keystorepwd, function (err, stdout, stderr, alignedPkg) {
                                            //logger.debug('sign out : ', stdout);
                                            //logger.debug('sign err : ', stderr);
                                            if (err) {
                                                return BuildFail(eBuildState.eSigning, param, 'Signing failure: ' + err);
                                            }
                                            setBuildState(eBuildState.eUploadPackage, param);
                                            var uploadPath = Path.join('/', param.pf.workspaceName, param.pf.projectName, fsOutDir, param.pf.profileName);
                                            var fileName = Path.basename(alignedPkg);
                                            fsClient.uploadApp(param.token, fsid, alignedPkg, uploadPath, fileName, function (err) {
                                                if (err) {
                                                    return BuildFail(eBuildState.eUploadPackage, param, 'Upload failure');
                                                } else {
                                                    setBuildState(eBuildState.eCompleted, param);
                                                    var uri = fileName;
                                                    return BuildOk(param, uri);
                                                }
                                            });
                                        });
                                    }
                                });
                            });                            
                        } else {
                            setBuildState(eBuildState.eUploadPackage, param);
                            var uploadPath = Path.join('/', param.pf.workspaceName, param.pf.projectName, fsOutDir, param.pf.profileName);
                            var fileName = Path.basename(pkgPath);
                            fsClient.uploadApp(param.token, fsid, pkgPath, uploadPath, fileName, function (err) {
                                if (err) {
                                    return BuildFail(eBuildState.eUploadPackage, param, 'Upload failure');
                                } else {
                                    setBuildState(eBuildState.eCompleted, param);
                                    var uri = fileName;
                                    return BuildOk(param, uri);
                                }
                            });
                        }              
                    });
                });
            });
        }    
    });
}

function startBuild(param) {
    setBuildState(eBuildState.eInit, param);
    fsClient.getMyFs(param.token, function(err, fsid) {
        if (err == 0) {
            setBuildState(eBuildState.eDownloadSource, param);

            makeBuildDir(param.token, fsid, param.pf.workspaceName, param.pf.projectName, param.taskInfo.userSrl, param.pf.profileName, function(err, appDir) {
                if (err != 0) {
                    var errMsg = 'failed to create build directory';
                    logger.error(errMsg, err);
                    return BuildFail(eBuildState.eDownloadSource, param, errMsg);
                }

                logger.info('appDir = ', appDir); 
                logger.info('target = ', param.pf.platform);
                
                //setBuildState(eBuildState.ePlatformAdd, param);

                build.platform(appDir, param.pf.platform, param, function (err, stdout, stderr) {
                    if (err) {
                        return BuildFail(eBuildState.ePlatformAdd, param, stderr);
                    }

                    var isDebug = true;
                    if (param.pf.buildType === 'release') {
                        isDebug = false;
                    } 

                    if (param.pf.plugins.length > 0) {
                        //setBuildState(eBuildState.ePluginAdd, param);
                        build.plugin(appDir, param.pf.plugins, param, function(err, stdout, stderr) {
                            if (err) {
                                return BuildFail(eBuildState.ePluginAdd, param, stderr);
                            }
                            runBuild(isDebug, appDir, fsid, param);
                        });
                    } else {
                        runBuild(isDebug, appDir, fsid, param);
                    }
                });   
            });
        } else {
            return BuildFail(eBuildState.eInit, param, 'failed to initialize');
        }
    });
}

function cleanBuild(targetDir, cb) {
    fs.exists(targetDir, function(exists) {
        if (exists) {
            rmdir(targetDir); 
            cb(eResult.succ);
        } else {
            cb(eResult.succ);
        }
    });
}

//
// message handlers
//
var procBuildTask = function (task, cb) {
    logger.info('procBuildTask = ', task); 
    var token = task.user.token;
    var pf = task.profileInfo;
    var taskInfo = new TaskInfo(task.taskId, task.user.uid, pf.projectName);
    var param = new BuildParam(token, pf, task.platformInfo, taskInfo, task, cb);

    if (!enterTask(param.targetDir)) {
        return BuildAbort(eBuildState.eInit, param, BuildError.alreadyRunning);
    }

    startBuild(param);
}

var procCleanTask = function (task, cb) {
    logger.info('procCleanTask = ', task); 

    var token = task.user.token;
    var pf = task.profileInfo;
    var wsName = pf.workspaceName;
    var projName = pf.projectName;

    var taskInfo = new TaskInfo(task.taskId, task.user.uid, pf.projectName);
    var param = new BuildParam(token, pf, task.platformInfo, taskInfo, task, cb);

    if (!enterTask(param.targetDir)) {
        return BuildAbort(eBuildState.eInit, param, BuildError.alreadyRunning);
    }

    cleanBuild(param.targetDir, function (ret) {
        leaveTask(param.targetDir);
        cb(ret);
    });
    
}


var procRebuildTask = function (task, cb) {
    logger.info('procRebuildTask = ', task); 
    var token = task.user.token;
    var pf = task.profileInfo;
    var taskInfo = new TaskInfo(task.taskId, task.user.uid, pf.projectName);
    var param = new BuildParam(token, pf, task.platformInfo, taskInfo, task, cb);

    if (!enterTask(param.targetDir)) {
        return BuildAbort(eBuildState.eInit, param, BuildError.alreadyRunning);
    }

    cleanBuild(param.targetDir, function (succ) {
        if (succ !== eResult.succ) {
            return BuildFail(eBuildState.eInit, param, 'failed to initialize');
        }
        startBuild(param); 
    });
}

var jmServer = dnode({
    buildTask : procBuildTask,
    rebuildTask : procRebuildTask,
    cleanTask : procCleanTask 
});



exports.start = function (port) {
    jmServer.listen(port);
}

exports.stop = function () {

}


