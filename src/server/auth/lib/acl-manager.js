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


//var userdb = null;

exports.init = function (svc, conf) {
    //userdb = svc.authSvr.userDb;
}

var router = new express.Router();
module.exports.router = router;

var sqlConn = userdb.sqlConn;


router.post('/webida/api/acl/createpolicy',
    userdb.verifyToken,
    function (req, res) {
        sqlConn.beginTransaction(function (err) {
            if (err)
                return next(err);

            var policy = req.body;
            policy.action = JSON.parse(policy.action);
            policy.resource = JSON.parse(policy.resource);
            logger.info('[acl] createPolicy', policy);
            userdb.createPolicy(req.user.uid, policy, req.user.token, function(err, result) {
                if (err) {
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function() {
                                return res.sendfail('createPolicy failed(server internal error)');
                            });
                        }

                        return res.sendok(result);
                    });
                }
            });
        });
    }
);

router.post('/webida/api/acl/createpolicies',
    userdb.verifyToken,
    function (req, res) {
        sqlConn.beginTransaction(function (err) {
            if (err)
                return next(err);

            var pArr = JSON.parse(req.body.data);
            var policies = [];
            logger.info('[acl] createPolicies', pArr);
            async.eachSeries(pArr, function(policy, cb) {
                userdb.createPolicy(req.user.uid, policy, req.user.token, function(err, result) {
                    if (err) {
                        return cb(err);
                    } else {
                        policies.push(result);
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
                            sqlConn.rollback(function() {
                                return res.sendfail('createPolicy failed(server internal error)');
                            });
                        }

                        return res.sendok(policies);
                    });
                }
            });
        });
    }
);

router.get('/webida/api/acl/deletepolicy',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'deletePolicy() policy owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid:req.user.uid, action:'acl:deletePolicy', rsc:rsc};
                userdb.checkAuthorize(aclInfo, res, function(err, result) {
                    if (err)
                        return res.send(500, utils.fail('checkAuthorized failed(server internal error)'));

                    if (result) {
                        return next();
                    } else {
                        return res.send(401, utils.fail('Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        sqlConn.beginTransaction(function (err) {
            if (err)
                return next(err);

            logger.info('[acl] deletePolicy', req.query);
            userdb.deletePolicy(req.query.pid, function(err, result) {
                if (err) {
                    logger.info('[acl] deletePolicy failed', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function() {
                                return res.sendfail('deletePolicy failed(server internal error)');
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });
    }
);

router.get('/webida/api/acl/updatepolicy',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'updatePolicy() policy owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid:req.user.uid, action:'acl:updatePolicy', rsc:rsc};
                userdb.checkAuthorize(aclInfo, res, function(err, result) {
                    if (err)
                        return res.send(500, utils.fail('checkAuthorized failed(server internal error)'));

                    if (result) {
                        return next();
                    } else {
                        return res.send(401, utils.fail('Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        sqlConn.beginTransaction(function (err) {
            if (err)
                return next(err);

            var policy = JSON.parse(req.query.policy);
            logger.info('[acl] updatePolicy', req.query);
            userdb.updatePolicy(req.query.pid, policy, req.query.sessionID, function(err, result) {
                if (err) {
                    logger.info('[acl] updatePolicy failed', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function() {
                                return res.sendfail('updatePolicy failed(server internal error)');
                            });
                        }

                        return res.sendok(result);
                    });
                }
            });
        });
    }
);

router.get('/webida/api/acl/assignpolicy',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'assignPolicy() policy owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid:req.user.uid, action:'acl:assignPolicy', rsc:rsc};
                userdb.checkAuthorize(aclInfo, res, function(err, result) {
                    if (err)
                        return res.send(500, utils.fail('checkAuthorized failed(server internal error)'));

                    if (result) {
                        return next();
                    } else {
                        return res.send(401, utils.fail('Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        sqlConn.beginTransaction(function (err) {
            if (err)
                return next(err);

            logger.info('[acl] assignPolicy', req.query);
            var info = req.query;
            var uidArr = [];
            if (info.user.length > 0)
                uidArr = info.user.split(';');

            async.eachSeries(uidArr, function(user, cb) {
                userdb.assignPolicy({pid:info.pid, user:user, sessionID:info.sessionID}, function(err, result) {
                    if (err) {
                        logger.info('[acl] assignPolicy failed', err);
                        return cb(new ServerError('assignPolicy failed for user '+user));
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
                            sqlConn.rollback(function() {
                                return res.sendfail('assignPolicy failed(server internal error)');
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });
    }
);

router.get('/webida/api/acl/assignpolicies',
    userdb.verifyToken,
    function (req, res, next) {
        var pidArr = [];
        if (req.query.pid.length > 0)
            pidArr = req.query.pid.split(';');

        userdb.isPoliciesOwner(req.user.uid, pidArr, function(err, result) {
            if (err) {
                return res.sendfail(err, 'assignPolicies() policy owner check failed.');
            } else if (result) {
                return next();
            } else {
                async.each(pidArr, function(pid, cb) {
                    var rsc = 'acl:' + pid;
                    var aclInfo = {uid:req.user.uid, action:'acl:assignPolicies', rsc:rsc};
                    userdb.checkAuthorize(aclInfo, res, function(err, result) {
                        if (err) {
                            return cb(new ServerError(500, 'checkAuthorized failed for ' + pid));
                        } else if (!result) {
                            return cb(new ClientError(401, 'Not authorized.'));
                        } else {
                            return cb();
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
        sqlConn.beginTransaction(function (err) {
            if (err)
                return next(err);

            logger.info('[acl] assignPolicies', req.query);
            var info = req.query;
            var pidArr = [];
            if (info.pid.length > 0)
                pidArr = info.pid.split(';');

            async.eachSeries(pidArr, function(pid, cb) {
                userdb.assignPolicy({pid:pid, user:info.user, sessionID:info.sessionID}, function(err, result) {
                    if (err) {
                        logger.info('[acl] assignPolicy failed', err);
                        return cb(new ServerError(500, 'assignPolicy failed for user '+user));
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
                            sqlConn.rollback(function() {
                                return res.sendfail('assignPolicies failed(server internal error)');
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });
    }
);

router.get('/webida/api/acl/removepolicy',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'removePolicy() policy owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid:req.user.uid, action:'acl:removePolicy', rsc:rsc};
                userdb.checkAuthorize(aclInfo, res, function(err, result) {
                    if (err)
                        return res.send(500, utils.fail('checkAuthorized failed(server internal error)'));

                    if (result) {
                        return next();
                    } else {
                        return res.send(401, utils.fail('Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        sqlConn.beginTransaction(function (err) {
            if (err)
                return next(err);

            logger.info('[acl] removePolicy');
            userdb.removePolicy(req.query, function(err, result) {
                if (err) {
                    logger.info('[acl] removePolicy failed', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function() {
                                return res.sendfail('removePolicy failed(server internal error)');
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });
    }
);

router.get('/webida/api/acl/getassigneduser',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'getAssignedUser() policy owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid:req.user.uid, action:'acl:getAssignedUser', rsc:rsc};
                userdb.checkAuthorize(aclInfo, res, function(err, result) {
                    if (err)
                        return res.send(500, utils.fail('checkAuthorized failed(server internal error)'));

                    if (result) {
                        return next();
                    } else {
                        return res.send(401, utils.fail('Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        userdb.getAssignedUser(req.query.pid, 'u', function(err, result) {
            if (err) {
                logger.info('[acl] getAssignedUser failed', err);
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
        userdb.isPolicyOwner(req.user.uid, req.query.pid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'getAssignedGroup() policy owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'acl:' + req.query.pid;
                var aclInfo = {uid:req.user.uid, action:'acl:getAssignedGroup', rsc:rsc};
                userdb.checkAuthorize(aclInfo, res, function(err, result) {
                    if (err)
                        return res.send(500, utils.fail('checkAuthorized failed(server internal error)'));

                    if (result) {
                        return next();
                    } else {
                        return res.send(401, utils.fail('Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        userdb.getAssignedGroup(req.query.pid, 'g', function(err, result) {
            if (err) {
                logger.info('[acl] getAssignedGroup failed', err);
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
                logger.info('[acl] getAuthorizedUser failed', err);
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
                logger.info('[acl] getAuthorizedGroup failed', err);
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
                logger.info('[acl] getAuthorizedRsc failed', err);
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
                logger.info('[acl] getAssignedPolicy failed', err);
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
                logger.info('[acl] getOwnedPolicy failed', err);
                return res.send(500, utils.fail('getOwnedPolicy failed(server internal error)'));
            } else {
                return res.send(utils.ok(result));
            }
        });
    }
);

// aclInfo : {uid:int, action:string, rsc:string}
router.get('/checkauthorize',
    function (req, res, next) {
        var aclInfo = req.query;

        userdb.checkAuthorize(aclInfo, res, function(err, result) {
            if (err)
                return res.send(500, utils.fail('checkAuthorized failed(server internal error)'));

            if (result) {
                return res.send(utils.ok());
            } else {
                return res.send(401, utils.fail('Not authorized.'));
            }
        });
    }
);

// req.query : {uid:int, action:string, rsc:[string], fsid:string}
router.get('/checkauthorizemulti',
    function (req, res, next) {
        var query = req.query;
        var source = [];
        if (query.rsc.length > 0)
            source = query.rsc.split(';');

        async.each(source, function(value, callback) {
            if (value[0] !== '/')
                value = Path.join('/', value);
            var rsc = 'fs:' + query.fsid + value;
            var aclInfo = {uid:query.uid, action:query.action, rsc:rsc};
            userdb.checkAuthorize(aclInfo, res, function(err, authorized) {
                if (err)
                    return res.send(500, utils.fail('checkAuthorized failed(server internal error)'));

                if (authorized) {
                    callback();
                } else {
                    callback('Not authorized.');
                }
            });
        }, function (err) {
            if (err) {
                return res.send(401, utils.fail('Not authorized.'));
            } else {
                return res.send(utils.ok());
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
                logger.info('[acl] updatePolicyResourcefailed', err);
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
        if (req.query.pid.length > 0)
            pidArr = req.query.pid.split(';');

        userdb.isPoliciesOwner(req.user.uid, pidArr, function(err, result) {
            if (err) {
                return res.sendfail(err, 'getPolicies() policy owner check failed.');
            } else if (result) {
                return next();
            } else {
                async.each(pidArr, function(pid, cb) {
                    var rsc = 'acl:' + pid;
                    var aclInfo = {uid:req.user.uid, action:'acl:getPolicies', rsc:rsc};
                    userdb.checkAuthorize(aclInfo, res, function(err, result) {
                        if (err) {
                            return cb(new ServerError('checkAuthorized failed for ' + pid));
                        } else if (!result) {
                            return cb(new ClientError(401, 'Not authorized.'));
                        } else {
                            return cb();
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
        if (req.query.pid.length > 0)
            pidArr = req.query.pid.split(';');

        userdb.getPolicies(pidArr, function(err, results) {
            if (err) {
                logger.info('[acl] getPolicies failed', err);
                return res.sendfail(new ServerError('getAssignedGroup failed'));
            } else {
                return res.sendok(results);
            }
        });
    }
);
