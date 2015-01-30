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

var logger = require('../../common/log-manager');
var fs = require('fs');
var mkdirp = require('mkdirp');
var Path = require('path');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var nexpect = require('nexpect');

var cmn = require('./build-common');


var eBuildState = cmn.eBuildState;    
var eResult = cmn.eResult;            
var setBuildState = cmn.setBuildState;


function runCmdInteractive(cmd, options, param, cb) {
    logger.info('run cmd = ', cmd);

    nexpect.spawn(cmd, options)
        .expect("Enter Passphrase for keystore:")
        .sendline(param)
        .run(function(err, stdout, exitcode) {
            logger.info(stdout);
            if (err) {
                logger.error(err);
                return cb('failed to run cmd: ', cmd);
            }
                
            return cb(err, cmd);
        });
}


function runCmd(module, params, options, cb) {
    var stdout = new String(), stderr = new String();
    var xx = spawn(module, params, options);
    xx.stdout.on('data', function (data) {
        stdout += data;
    });
    xx.stderr.on('data', function (data) {
        stderr += data;
    });

    xx.on('close', function (code) {
        logger.info('stdout = ', stdout);
        logger.info('stderr = ', stderr);

        var err = null;
        if (code !== 0) {
            logger.error('cordova exited with code' + code);
            err = new Error(stderr);
        }     
        cb(err, stdout, stderr);
    });
}

module.exports = {
    init: function (appDir, callback) {
        logger.info('.. before init ');
        mkdirp(appDir + "/platforms", function(e) {
            if (!e || (e && e.code === 'EEXIST')) {
                fs.mkdir(appDir + "/plugins", function (e) {
                    if (!e || (e && e.code === 'EEXIST')) {
                        callback();
                    } else {
                        callback(e);
                    }
                });
            } else {
                callback(e);
            }
        });
    },

    create: function (taskDir, appName, cb) {
        var cwd = process.cwd();
        process.chdir(taskDir);
        exec('cordova create ' + appName,
             function (err, stdout, stderr) {
            logger.info('out = ', stdout);
            logger.info('err = ', stderr);
            process.chdir(cwd);
            cb();
        });
    },

    platform: function (appDir, target, param, callback) {
        logger.info('platform adding ...');
        var pathDir = Path.join(appDir, 'platforms', target);
        logger.info('platform path = ' + pathDir);
        fs.exists(pathDir, function(exists) {
            if (exists) {
                logger.info('.. platform is already exists');
                return callback(null);
            } else {
                setBuildState(eBuildState.ePlatformAdd, param);
                runCmd('cordova', ['platform', 'add', target ], { cwd: appDir }, callback);
            }
        });
    },

   plugin: function (appDir, plugins, param, callback) {
        logger.info('plugin adding ...');
        logger.info('plugin path = ' + appDir);
        runCmd('cordova', ['plugin','ls'], { cwd: appDir }, function (err, stdout, stderr) {
            if (err) {
                return callback(err, stdout, stderr); 
            } else {
                var addPlugins = new Array();
                for (var i in plugins) {
                    var n = stdout.indexOf(plugins[i]);
                    logger.info('n = ',plugins[i], ",,,", n);
                    if (n === -1) {
                        addPlugins.push(plugins[i]);            
                    }
                }
                logger.debug('requested plugins = ', plugins);
                logger.debug('to add plugins = ', addPlugins);
                logger.debug('stdout = ', stdout);

                var checkStr = 'No plugins added';
                
                var removeList = new Array();
                if (stdout.indexOf(checkStr) === -1) {
                    var out = stdout;
                    //var out = stdout.replace(/'/g, '"');
                    //out = out.replace(/\n/g, '');
                  
                    try { 
                        var fixedList = [ 'org.apache.cordova.file' ];
                        var insArray = out.split('\n');
                        logger.debug('installed = ', insArray);
                       
                        for (var i = 0; i < insArray.length; i++) {
                            var item = insArray[i].split(' '); 
                            var uri = item[0];
                          
                            if (uri === '') {
                                continue;
                            } 
                            var n = fixedList.indexOf(uri);
                            if (n !== -1) {
                                continue;
                            } 
                            n = plugins.indexOf(uri);
                            if (n === -1) {
                                removeList.push(uri);
                            }                           
                        } 

                        logger.info('remove list: ', removeList);

                    } catch (e) {
                        logger.error('plugin parsing error:', e);
                    }
                }
                

                var fnPluginAdd = function (addPlugins, callback) {
                    if (addPlugins.length === 0) {
                        return callback(null, 'Nothing to add plugins');
                    }
                    var cmd = 'cordova plugin add ' + addPlugins.join(' ');
                    logger.debug(cmd);
                    var params = new Array('plugin', 'add');
                    params = params.concat(addPlugins);
                    logger.debug('params = ' + params);
                    setBuildState(eBuildState.ePluginAdd, param);
                    runCmd('cordova', params, { cwd: appDir } , callback);
                }


                var fnPluginRemove = function(delPlugins, callback) {
                    if (delPlugins.length == 0) {
                        return callback(null, 'Nothing to remove plugins');
                    }
                    var cmd = 'cordova plugin remove ' + delPlugins.join(' ');
                    logger.debug(cmd);
                    var params = new Array('plugin', 'remove');
                    params = params.concat(delPlugins);
                    logger.debug('params = ' + params);
                    runCmd('cordova', params, { cwd: appDir } , callback);
                }

                logger.info('plugin add count = ' + addPlugins.length);
                logger.info('plugin remove count = ' + removeList.length);

                fnPluginRemove(removeList, function(err, stdout, stderr) {
                    if (err) {
                        return callback(err, stdout, stderr);
                    } else {
                        fnPluginAdd(addPlugins, callback); 
                    }
                });
            }
        });
    },

    prepare: function (appDir, target, callback) {
        var cwd = process.cwd();
        process.chdir(appDir);
        exec('cordova prepare ' + target, function (err, stdout, stderr) {
            logger.info('err = ', err);
            logger.info('stdout = ', stdout);
            logger.info('stderr = ', stderr);

            process.chdir(cwd);
            callback(err, stdout, stderr);
        });
    },

    build: function (appDir, isDebug, callback) {
        runCmd('cordova', ['build', isDebug ? '--debug' : '--release'], { cwd: appDir } , callback);
    },

    sign: function (outDir, pkgName, keyPath, unsignedPath, aliasName, kspwd, callback) {
        // jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -signedjar t11-release-signed.apk -keystore ...keystore/dykim-release-key.keystore t11-release-unsigned.apk alias_name

        var signedPkg = outDir + '/' + pkgName + '-unaligned.apk'
        var cmd = "jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -signedjar " + signedPkg + " -keystore " + keyPath + " " + unsignedPath + " " + aliasName;
        var options = { stream: 'stderr', verbose : 1 };
        runCmdInteractive(cmd, options, kspwd, function (err, stdout) {
            //logger.info('stdout =', stdout);
            //logger.info('err =', err);
            if (err) {
                return callback(err, stdout);
            } else {
                // jarsigner -verify -verbose t11-release-signed.apk
                runCmd('jarsigner', ['-verify', '-verbose', signedPkg], null, function (err, stdout, stderr) {
                    if (err) {
                        logger.error('jarsigner verificaton failed: ', stderr);
                        return callback(err, stdout, stderr);
                    }
                    //zipalign -f -v 4 .\platforms\android\bin\myapp-release-signed.apk .\platforms\android\bin\myapp-release-signed-aligned.apk
                    var alignedPkg = outDir + '/' + pkgName + '.apk'
                    runCmd('zipalign', ['-f', '-v', '4', signedPkg, alignedPkg], null, function (err, stdout, stderr) {
                        if (err) {
                            logger.error('zipalign failed : ', stderr);
                            return cb(err, stdout, stderr);
                        }
                        return callback(err, stdout, stderr, alignedPkg);
                    });               
                });
            }
        });  
    }
}


