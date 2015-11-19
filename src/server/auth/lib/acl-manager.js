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

var express = require('express');
var async = require('async');
var logger = require('../../common/log-manager');
var utils = require('../../common/utils');
var userdb = require('./userdb');
var Path = require('path');

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;

exports.init = function (svc, conf) {
};

var router = new express.Router();
module.exports.router = router;

function errLog(err, errMsg) {
    if (err === 'undefined') {
        logger.error('[acl] ' + errMsg);
    } else {
        logger.error('[acl] ' + errMsg + ': ' + err);
    }
}

router.post('/webida/api/acl/createpolicy',
    userdb.verifyToken,
    function (req, res) {
        var policy = req.body;
        policy.action = JSON.parse(policy.action);
        policy.resource = JSON.parse(policy.resource);
        logger.info('[acl] createPolicy', policy);
        userdb.createPolicy(req.user.uid, policy, req.user.token, function(err, result) {
            if (err) {
                logger.error('createPolicy error : ', err);
                return res.sendfail(err);
            } else {
                return res.sendok(result);
            }
        });
        /*var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            if (err) {
                var errMsg = 'createpolicy failed';
                errLog(errMsg, err);
                return res.sendfail(errMsg);
            }

            var policy = req.body;
            policy.action = JSON.parse(policy.action);
            policy.resource = JSON.parse(policy.resource);
            logger.info('[acl] createPolicy', policy);
            userdb.createPolicy(req.user.uid, policy, req.user.token, function(err, result) {
                if (err) {
                    logger.error('createPolicy error : ', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            logger.error('createPolicy error : ', err);
                            sqlConn.rollback(function() {
                                return res.sendfail('createPolicy failed(server internal error)');
                            });
                        }

                        return res.sendok(result);
                    });
                }
            });
        });*/
    }
);

router.post('/webida/api/acl/createpolicies',
    userdb.verifyToken,
    function (req, res) {
        var pArr;
        var errMsg;
        try {
            pArr = JSON.parse(req.body.data);
        } catch (err) {
            errMsg = 'createPolicies error : invalid req.body.data';
            errLog(errMsg, err);
            return res.sendfail(errMsg);
        }
        userdb.createPolicies(req.user.uid, pArr, req.user.token, function(err, results) {
            if (err) {
                logger.error('createPolicies error : ', err);
                return res.sendfail(err);
            } else {
                return res.sendok(results);
            }
        });
        /*var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            var errMsg;
            if (err) {
                errMsg = 'createpolicies failed';
                errLog(errMsg, err);
                return res.sendfail(errMsg);
            }

            var pArr;
            try {
                pArr = JSON.parse(req.body.data);
            } catch (err) {
                errMsg = 'createPolicies error : invalid req.body.data';
                errLog(errMsg, err);
                return res.sendfail(errMsg);
            }
            var policies = [];
            logger.info('[acl] createPolicies', pArr);
            async.eachSeries(pArr, function(policy, cb) {
                userdb.createPolicy(req.user.uid, policy, req.user.token, function(err, result) {
                    if (err) {
                        logger.error('[acl] createPolicies error: ', err);
                        return cb(err);
                    } else {
                        policies.push(result);
                        return cb(null);
                    }
                });
            }, function(err) {
                if (err) {
                    errLog('createPolicies error : ', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            logger.error('createPolicies error : ', err);
                            sqlConn.rollback(function() {
                                return res.sendfail('createPolicies failed(server internal error)');
                            });
                        }

                        return res.sendok(policies);
                    });
                }
            });
        });*/
    }
);

router.get('/webida/api/acl/deletepolicy',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function(err, result) {
            if (err) {
                var errMsg = '[acl] deletepolicy error: policy owner check failed:';
                errLog(errMsg, err);
                return res.sendfail(err, errMsg);
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid:req.user.uid, action:'acl:deletePolicy', rsc:rsc};
                userdb.checkAuthorize(aclInfo, function(err) {
                    if (!err) {
                        return next();
                    } else {
                        return res.sendfail(new ClientError(401, 'Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        logger.info('[acl] deletePolicy', req.query);
        userdb.deletePolicy(req.query.pid, function(err, result) {
            if (err) {
                errLog('[acl] deletePolicy failed', err);
                return res.sendfail(err);
            } else {
                return res.sendok();
            }
        });

        /*var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            if (err) {
                var errMsg = 'deletePolicy failed';
                errLog(errMsg, err);
                return res.sendfail(errMsg);
            }

            logger.info('[acl] deletePolicy', req.query);
            userdb.deletePolicy(req.query.pid, function(err, result) {
                if (err) {
                    errLog('[acl] deletePolicy failed', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            var errMsg = 'deletePolicy failed';
                            errLog(errMsg, err);
                            sqlConn.rollback(function() {
                                return res.sendfail(errMsg);
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });*/
    }
);

router.get('/webida/api/acl/updatepolicy',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function(err, result) {
            var errMsg;
            if (err) {
                errMsg = 'updatePolicy() policy owner check failed.';
                errLog(errMsg, err);
                return res.sendfail(err, errMsg);
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid: req.user.uid, action: 'acl:updatePolicy', rsc: rsc};
                userdb.checkAuthorize(aclInfo, function (err) {
                    if (!err) {
                        return next();
                    } else {
                        return res.sendfail(new ClientError(401, 'Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        logger.info('[acl] updatePolicy', req.query);
        var policy = JSON.parse(req.query.policy);
        userdb.updatePolicy(req.query.pid, policy, req.query.sessionID, function (err, result) {
            if (err) {
                errLog('[acl] updatePolicy failed', err);
                return res.sendfail(err);
            } else {
                return res.sendok(result);
            }
        });
        /*var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            if (err) {
                var errMsg = 'updatepolicy failed';
                errLog(errMsg, err);
                return res.sendfail(errMsg);
            }

            var policy = JSON.parse(req.query.policy);
            logger.info('[acl] updatePolicy', req.query);
            userdb.updatePolicy(req.query.pid, policy, req.query.sessionID, function(err, result) {
                if (err) {
                    errLog('[acl] updatePolicy failed', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            var errMsg = 'updatePolicy failed';
                            errLog(errMsg);
                            sqlConn.rollback(function() {
                                return res.sendfail(errMsg);
                            });
                        }

                        return res.sendok(result);
                    });
                }
            });
        });*/
    }
);

router.get('/webida/api/acl/assignpolicy',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function(err, result) {
            var errMsg;
            if (err) {
                errMsg = 'assignPolicy() policy owner check failed.';
                errLog(errMsg, err);
                return res.sendfail(err, errMsg);
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid:req.user.uid, action:'acl:assignPolicy', rsc:rsc};
                userdb.checkAuthorize(aclInfo, function(err) {
                    if (!err) {
                        return next();
                    } else {
                        return res.sendfail(new ClientError(401, 'Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        logger.info('[acl] assignPolicy', req.query);
        var info = req.query;
        userdb.assignPolicies(info, function (err) {
            if (err) {
                var errMsg = 'assignPolicy failed';
                errLog(errMsg, err);
                return res.sendfail(err);
            } else {
                return res.sendok();
            }
        });
        /*var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            if (err) {
                var errMsg = 'assignpolicy failed: transaction failure';
                errLog(errMsg, err);
                return res.sendfail(errMsg);
            }

            var uidArr = [];
            if (info.user.length > 0) {
                uidArr = info.user.split(';');
            }

            async.eachSeries(uidArr, function(user, cb) {
                userdb.assignPolicy({pid:info.pid, user:user, sessionID:info.sessionID}, function(err, result) {
                    if (err) {
                        var errMsg = 'assignPolicy failed for user: ' + user;
                        errLog(errMsg, err);
                        return cb(new ServerError(errMsg));
                    } else {
                        return cb(null);
                    }
                });
            }, function(err) {
                if (err) {
                    var errMsg = 'assignPolicy failed';
                    errLog(errMsg, err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            var errMsg = 'assignPolicy failed';
                            errLog(errMsg, err);
                            sqlConn.rollback(function() {
                                return res.sendfail(errMsg);
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });*/
    }
);

router.get('/webida/api/acl/assignpolicies',
    userdb.verifyToken,
    function (req, res, next) {
        var pidArr = [];
        if (req.query.pid.length > 0) {
            pidArr = req.query.pid.split(';');
        }

        userdb.isPoliciesOwner(req.user.uid, pidArr, function(err, result) {
            var errMsg;
            if (err) {
                errMsg = 'assignPolicies() policy owner check failed.';
                errLog(errMsg, err);
                return res.sendfail(err, errMsg);
            } else if (result) {
                return next();
            } else {
                async.each(pidArr, function(pid, cb) {
                    var rsc = 'acl:' + pid;
                    var aclInfo = {uid:req.user.uid, action:'acl:assignPolicies', rsc:rsc};
                    userdb.checkAuthorize(aclInfo, function(err) {
                    if (!err) {
                        return cb();
                    } else {
                        cb(new ClientError(401, 'Not authorized.'));
                    }
                });
                }, function (err) {
                    if (err) {
                        return res.sendfail(err);
                    } else {
                        return next();
                    }
                });
            }
        });
    },
    function (req, res) {
        userdb.assignPolicies(req.query, function (err) {
            if (err) {
                return res.sendfail(err);
            } else {
                return res.sendok();
            }
        });

        /*var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            if (err) {
                var errMsg = 'assignpolicies failed with error';
                errLog(errMsg, err);
                return res.sendfail(errMsg);
            }

            logger.info('[acl] assignPolicies', req.query);
            var info = req.query;
            var pidArr = [];
            if (info.pid.length > 0) {
                pidArr = info.pid.split(';');
            }

            async.eachSeries(pidArr, function(pid, cb) {
                userdb.assignPolicy({pid:pid, user:info.user, sessionID:info.sessionID}, function(err, result) {
                    if (err) {
                        var errMsg = 'assignPolicy failed for user' + info.user;
                        errLog(errMsg, err);
                        return cb(new ServerError(500, errMsg));
                    } else {
                        return cb(null);
                    }
                });
            }, function(err) {
                if (err) {
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            var errMsg = 'asignPolicy failed to commit';
                            errLog(errMsg, err);
                            sqlConn.rollback(function() {
                                return res.sendfail(errMsg);
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });*/
    }
);

router.get('/webida/api/acl/removepolicy',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function(err, result) {
            if (err) {
                var errMsg = 'removePolicy() policy owner check failed.';
                errLog(errMsg, err);
                return res.sendfail(err, errMsg);
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid:req.user.uid, action:'acl:removePolicy', rsc:rsc};
                userdb.checkAuthorize(aclInfo, function(err) {
                    if (!err) {
                        return next();
                    } else {
                        return res.sendfail(new ClientError(401, 'Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        userdb.removePolicy(req.query, function(err) {
            if (err) {
                errLog('removePolicy failed', err);
                return res.sendfail(err);
            } else {
                return res.sendok();
            }
        });
        /*var sqlConn = userdb.getSqlConn();
        sqlConn.beginTransaction(function (err) {
            if (err) {
                var errMsg = 'removePolicy failed (server internal error)';
                errLog(errMsg);
                return res.sendfail(errMsg);
            }

            logger.info('[acl] removePolicy');
            userdb.removePolicy(req.query, function(err, result) {
                if (err) {
                    errLog('removePolicy failed', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            errLog('removePolicy failed', err);
                            sqlConn.rollback(function() {
                                return res.sendfail('removePolicy failed(server internal error)');
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });*/
    }
);

router.get('/webida/api/acl/getassigneduser',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function(err, result) {
            var errMsg;
            if (err) {
                errMsg = 'getAssignedUser() policy owner check failed.';
                errLog(errMsg, err);
                return res.sendfail(err, errMsg);
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid:req.user.uid, action:'acl:getAssignedUser', rsc:rsc};
                userdb.checkAuthorize(aclInfo, function(err) {
                    if (!err) {
                        return next();
                    } else {
                        return res.sendfail(new ClientError(401, 'Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        userdb.getAssignedUser(req.query.pid, 'u', function(err, result) {
            if (err) {
                errLog('[acl] getAssignedUser failed', err);
                return res.send(500, utils.fail('getAssignedUser failed(server internal error)'));
            } else {
                logger.info('[acl] getAssignedUser success', result);
                return res.send(utils.ok(result));
            }
        });
    }
);

router.get('/webida/api/acl/getassignedgroup',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function (err, result) {
            var errMsg;
            if (err) {
                errMsg = 'getAssignedGroup() policy owner check failed.';
                errLog(errMsg, err);
                return res.sendfail(err, errMsg);
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid: req.user.uid, action: 'acl:getAssignedGroup', rsc: rsc};
                userdb.checkAuthorize(aclInfo, function (err) {
                    if (!err) {
                        return next();
                    } else {
                        return res.sendfail(new ClientError(401, 'Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        userdb.getAssignedUser(req.query.pid, 'g', function (err, result) {
            if (err) {
                errLog('[acl] getAssignedGroup failed', err);
                return res.send(500, utils.fail('getAssignedGroup failed(server internal error)'));
            } else {
                logger.info('[acl] getAssignedGroup success', result);
                return res.send(utils.ok(result));
            }
        });
    }
);

router.get('/webida/api/acl/getauthorizeduser',
    userdb.verifyToken,
    function (req, res) {
        userdb.getAuthorizedUser(req.query.action, req.query.resource, 'u', function(err, result) {
            if (err) {
                errLog('[acl] getAuthorizedUser failed', err);
                return res.send(500, utils.fail('getAuthorizedUser failed(server internal error)'));
            } else {
                logger.info('[acl] getAuthorizedUser success', result);
                return res.send(utils.ok(result));
            }
        });
    }
);

router.get('/webida/api/acl/getauthorizedgroup',
    userdb.verifyToken,
    function (req, res) {
        userdb.getAuthorizedUser(req.query.action, req.query.resource, 'g', function(err, result) {
            if (err) {
                errLog('[acl] getAuthorizedGroup failed', err);
                return res.send(500, utils.fail('getAuthorizedGroup failed(server internal error)'));
            } else {
                logger.info('[acl] getAuthorizedGroup success', result);
                return res.send(utils.ok(result));
            }
        });
    }
);

router.get('/webida/api/acl/getauthorizedrsc',
    userdb.verifyToken,
    function (req, res) {
        userdb.getAuthorizedRsc(req.user.uid, req.query.action, function(err, result) {
            if (err) {
                errLog('[acl] getAuthorizedRsc failed', err);
                return res.send(500, utils.fail('getAuthorizedRsc failed(server internal error)'));
            } else {
                logger.info('[acl] getAuthorizedRsc success', result);
                return res.send(utils.ok(result));
            }
        });
    }
);

router.get('/webida/api/acl/getassignedpolicy',
    userdb.verifyToken,
    function (req, res) {
        logger.info('[acl] getAssignedPolicy');
        userdb.getAssignedPolicy(req.query.id, function(err, result) {
            if (err) {
                errLog('[acl] getAssignedPolicy failed', err);
                return res.send(500, utils.fail('getAssignedPolicy failed(server internal error)'));
            } else {
                return res.send(utils.ok(result));
            }
        });
    }
);

router.get('/webida/api/acl/getownedpolicy',
    userdb.verifyToken,
    function (req, res) {
        logger.info('[acl] getOwnedPolicy');
        userdb.getOwnedPolicy(req.user.uid, function(err, result) {
            if (err) {
                errLog('[acl] getOwnedPolicy failed', err);
                return res.send(500, utils.fail('getOwnedPolicy failed(server internal error)'));
            } else {
                return res.send(utils.ok(result));
            }
        });
    }
);

// req.query : {uid:int, action:string, rsc:string;string;string}
router.get('/checkauthorize',
    function (req, res, next) {
        var query = req.query;
        var resources = [];
        if (query.rsc.length > 0) {
            resources = query.rsc.split(';');
        }
        if (resources.length > 0 ) {
            logger.debug('check authorize for : ', resources);
        }
        async.each(resources, function(resource, callback) {
            var aclInfo = {uid:query.uid, action:query.action, rsc:resource};
            userdb.checkAuthorize(aclInfo, function(err) {
                    if (!err) {
                        return callback();
                    } else {
                        return callback(new ClientError(401, 'Not authorized.'));
                    }
                });
        }, function (err) {
            if (err) {
                errLog('checkAuthroze error - will return not authorized.', err);
                return res.send(401, utils.fail('Not authorized.'));
            } else {
                return res.sendok(); 
            }
        });
    }
);

router.get('/webida/api/acl/updatepolicyrsc',
    userdb.verifyToken,
    function (req, res) {
        logger.info('[acl] updatePolicyResource', req.query);
        var rsc = req.query;
        userdb.updatePolicyRsc(rsc.src, rsc.dst, function(err) {
            if (err) {
                errLog('updatePolicyResourcefailed', err);
                return res.sendfail(err, 'updatePolicyResource failed(server internal error)');
            } else {
                return res.sendok();
            }
        });
    }
);

router.get('/webida/api/acl/getpolicies',
    userdb.verifyToken,
    function (req, res, next) {
        var pidArr = [];
        if (req.query.pid.length > 0) {
            pidArr = req.query.pid.split(';');
        }

        userdb.isPoliciesOwner(req.user.uid, pidArr, function(err, result) {
            if (err) {
                var errMsg = 'getPolicies() policy owner check failed.';
                errLog(errMsg, err);
                return res.sendfail(err, errMsg);
            } else if (result) {
                return next();
            } else {
                async.each(pidArr, function(pid, cb) {
                    var rsc = 'acl:' + pid;
                    var aclInfo = {uid:req.user.uid, action:'acl:getPolicies', rsc:rsc};
                    userdb.checkAuthorize(aclInfo, function(err) {
                        if (!err) {
                            return cb();
                        } else {
                            return res.sendfail(new ClientError(401, 'Not authorized.'));
                        }
                    });
                }, function (err) {
                    if (err) {
                        return res.sendfail(err);
                    } else {
                        return next();
                    }
                });
            }
        });
    },
    function (req, res) {
        var pidArr = [];
        if (req.query.pid.length > 0) {
            pidArr = req.query.pid.split(';');
        }

        userdb.getPolicies(pidArr, function(err, results) {
            if (err) {
                errLog('getPolicies failed', err);
                return res.sendfail(new ServerError('getAssignedGroup failed'));
            } else {
                return res.sendok(results);
            }
        });
    }
);

