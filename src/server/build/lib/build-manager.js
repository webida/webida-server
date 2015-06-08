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

//var Path = require('path');
//var URI = require('URIjs');
var express = require('express');
var cuid = require('cuid');

var authMgr = require('../../common/auth-manager');
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;
var jmClient = require('./build-jm-client');
var jmClientMgr = require('./build-jm-client').jmCliMgr;
var ntfMgr = require('./ntf-manager');
var fsdb = require('./fs-db').getDb();
var buildDb = require('./build-db');

jmClient.connect(config.services.build.jmHost, config.services.build.jmPort);

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;


var router = new express.Router();

module.exports.router = router;

module.exports.close = function () {
    logger.info('stopping build-manager ...');
    //require('./fs-db').close();
    ntfMgr.stop();
};

//authMgr.init(config.services.build.buildDb);

//
// keystore query
//
function getKsInfo(uid, alias, cb) {
    fsdb.getKsInfo(uid, alias, cb);
    /*var query = { uid: uid, alias: alias };
    logger.debug(query);
    fsdb.ks.find(query, function(err, rs) {
        if (err) {
            return cb(err);
        } else {
            logger.info('rs =', rs); 
            return cb(null, rs);
        }
    });*/
}

//
// build functions
//

var BuildProfile = function (workspaceName, projectName, platform, buildType, plugins, profileInfo) {
    this.workspaceName = workspaceName;
    this.projectName = projectName;
    this.platform = platform;
    this.buildType = buildType;  
    this.plugins = plugins;
    this.profileInfo = profileInfo;
};


var BuildTask = function(profileInfo, platformInfo, user) {
    this.taskId = cuid();
    this.profileInfo = profileInfo;
    this.platformInfo = platformInfo;
    this.user = user;
};


function invokeBuild(profileInfo, platformInfo, user, taskFunc, cb) {
    var task = new BuildTask(profileInfo, platformInfo, user);
    logger.info('buildTask created\n', task);
    ntfMgr.registerTask(task.taskId);

    var result = taskFunc(task, function(err, result, profile) {
        //logger.info('buildTask callback - ', err, result, profile);    
        switch (err) {
        case 0:
            break;
        case 1:
            break;
        case 2:
            break;
        case 99:
            return res.sendfail(result);
            break;
        }

        ntfMgr.ntf_to_client(task.taskId, result, function(isfail, errMsg) {
            if (isfail) {
                logger.error(errMsg);
            } else {
            }
        });
    });

    logger.info('invokeBuild: ', result);
    return cb((result) ? null : new ServerError('There is no active job manager'), task.taskId);
}

/* 
 * build specific profile
 */

router.post('/webida/api/build/build', authMgr.verifyToken, function (req, res) {
    var profileInfo = JSON.parse(req.body.profileInfo);
    var platformInfo = JSON.parse(req.body.platformInfo);
    
    if (!profileInfo || !platformInfo) {
        res.sendfail(new ClientError('invalid parameters'));
    }

    var taskid = null;
    var buildType = profileInfo.buildType;
    if (buildType === 'release' && profileInfo.signing) {
        var uid = req.user && req.user.uid;
        var alias = profileInfo.signing.alias;
    
        getKsInfo(uid, alias, function (err, rs) {
            if (err) {
                res.sendfail(new ClientError('can not get keystore info from db'));
            } else {
                profileInfo.ksInfo = rs[0];
                invokeBuild(profileInfo, platformInfo, req.user, jmClientMgr.buildTask.bind(jmClientMgr), function (err, taskid) {
                    if (err) {
                        res.sendfail(err);
                    } else {
                        res.sendok(taskid);
                    }
               });
            }
        }); 
    } else {
        taskid = invokeBuild(profileInfo, platformInfo, req.user, jmClientMgr.buildTask.bind(jmClientMgr), function (err, taskid) {
            if (err) {
                res.sendfail(err);
            } else {
                res.sendok(taskid);
            }
        });
    }
});


router.post('/webida/api/build/clean', authMgr.verifyToken, function (req, res) {
    logger.info('clean');

    // have to check whether proj belongs to requester
    var uid = req.user.uid;
    var profileInfo = JSON.parse(req.body.profileInfo);

    logger.debug('clean: ', JSON.stringify(profileInfo));
    
    var task = new BuildTask(profileInfo, null, req.user);
    jmClientMgr.cleanTask(task, function(succ) {
        logger.info('clean callback - ', succ);    
        if (succ === 0) {
            res.sendok('succ');
        } else {
            res.sendfail('fail');
        } 
     });
});


router.post('/webida/api/build/rebuild', authMgr.verifyToken, function (req, res) {

    // have to check whether proj belongs to requester
    var profileInfo = JSON.parse(req.body.profileInfo);
    var platformInfo = JSON.parse(req.body.platformInfo);

    if (!profileInfo || !platformInfo) {
        res.sendfail(new ClientError('invalid parameters'));
    }

    var taskid = null;
    var buildType = profileInfo.buildType;
    if (buildType === 'release' && profileInfo.signing) {
        var uid = req.user && req.user.uid;
        var alias = profileInfo.signing.alias;
    
        getKsInfo(uid, alias, function (err, rs) {
            if (err) {
                res.sendfail(new ClientError('can not get keystore info from db'));
            } else {
                profileInfo.ksInfo = rs[0];
                invokeBuild(profileInfo, platformInfo, req.user, jmClientMgr.rebuildTask.bind(jmClientMgr), function (err, taskid) {
                    if (err) {
                        res.sendfail(err);
                    } else {
                        res.sendok(taskid);
                    }
               });
            }
        }); 
    } else {
        taskid = invokeBuild(profileInfo, platformInfo, req.user, jmClientMgr.rebuildTask.bind(jmClientMgr), function (err, taskid) {
            if (err) {
                res.sendfail(err);
            } else {
                res.sendok(taskid);
            }
        });
    }
});


router.post('/webida/api/build/gcm/:regid', authMgr.verifyToken, function (req, res) {
    var uid = req.user.uid;
    var regid = req.params.regid;
    var info = req.body.info;
    if (regid.length > 1024) {
        res.sendfail(new ClientError('regid field is too long'));
    }

    if (!info) {
        res.sendfail(new ClientError('invalid parameter: info field does not exist'));
    } 
    if (info.length > 10240) {
        res.sendfail(new ClientError('info field is too long'));
    }

    buildDb.registerGcmInfo(uid, regid, info, function (err, rs) {
        if (err) {
            res.sendfail(err.message);
        } else {
            res.sendok(rs);
        }
    });
});


router.delete('/webida/api/build/gcm/:regid', authMgr.verifyToken, function(req, res) {
    var uid = req.user.uid;
    var regid = req.params.regid;

    buildDb.removeGcmInfo(uid, regid, function (err) {
        if (err) {
            res.sendfail(err.message);
        } else {
            res.sendok();
        }
    });
});

router.get('/webida/api/build/gcm', authMgr.verifyToken, function(req, res) {
    var uid = req.user.uid;

    buildDb.getGcmInfo(uid, function (err, rs) {
        if (err) {
            res.sendfail(err.message);
        } else {
            res.sendok(rs);
        }
    });
});





