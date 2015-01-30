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
var logger = require('../../common/log-manager');
var utils = require('../../common/utils');
var userdb = require('./userdb');

var url = require('url');

var router = new express.Router();
module.exports.router = router;

var sqlConn = userdb.sqlConn;

router.get('/webida/api/group/creategroup',
    userdb.verifyToken,
    function (req, res) {
        sqlConn.beginTransaction(function (err) {
            if (err)
                return next(err);

            var groupInfo = req.query;
            groupInfo.owner = req.user.uid;
            logger.info('[group] createGroup', groupInfo);
            userdb.createGroup(groupInfo, function(err, result) {
                if (err) {
                    logger.info('[group] createGroup failed', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function() {
                                return res.sendfail('createGroup failed(server internal error)');
                            });
                        }

                        return res.sendok(result);
                    });
                }
            });
        });
    }
);

function deleteGroup(req, res) {
    sqlConn.beginTransaction(function (err) {
        if (err)
            return res.sendfail(new ServerError('deleteGroup failed'));

        logger.info('[group] deleteGroup', req.query);
        userdb.deleteGroup(req.query.gid, function(err, result) {
            if (err) {
                logger.info('[group] deleteGroup failed', err);
                sqlConn.rollback(function() {
                    return res.sendfail(err);
                });
            } else {
                sqlConn.commit(function (err) {
                    if (err) {
                        sqlConn.rollback(function() {
                            return res.sendfail('deleteGroup failed(server internal error)');
                        });
                    }

                    return res.sendok();
                });
            }
        });
    });
}

router.get('/webida/api/group/enddeletegroup',
    userdb.verifyToken,
    deleteGroup
);

router.get('/webida/api/group/deletegroup',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isGroupOwnerOrMember(req.user.uid, req.query.gid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'deleteGroup() group owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'group:' + req.query.gid;
                var aclInfo = {uid:req.user.uid, action:'group:deleteGroup', rsc:rsc};
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
    deleteGroup
);

router.get('/webida/api/group/addusertogroup',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isGroupOwner(req.user.uid, req.query.gid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'addUserToGroup() group owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'group:' + req.query.gid;
                var aclInfo = {uid:req.user.uid, action:'group:addUserToGroup', rsc:rsc};
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

            var uidArr = [];
            if (req.query.uid.length > 0)
                uidArr = req.query.uid.split(';');

            logger.info('[group] addUserToGroup', uidArr);
            userdb.addUsersToGroup(uidArr, req.query.gid, function(err, result) {
                if (err) {
                    logger.info('[group] addUserToGroup failed', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function() {
                                return res.sendfail('addUserToGroup failed(server internal error)');
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });
    }
);

router.get('/webida/api/group/removeuserfromgroup',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isGroupOwner(req.user.uid, req.query.gid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'removeUserFromGroup() group owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'group:' + req.query.gid;
                var aclInfo = {uid:req.user.uid, action:'group:removeUserFromGroup', rsc:rsc};
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

            var uidArr = [];
            if (req.query.uid.length > 0)
                uidArr = req.query.uid.split(';');

            userdb.removeUsersFromGroup(uidArr, req.query.gid, function(err, result) {
                if (err) {
                    logger.info('[group] removeUserFromGroup failed', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function() {
                                return res.sendfail('removeUserFromGroup failed(server internal error)');
                            });
                        }

                        return res.sendok();
                    });
                }
            });
        });
    }
);

router.get('/webida/api/group/getmygroups',
    userdb.verifyToken,
    function (req, res) {
        logger.info('[group] getMyGroups');
        userdb.getGroups(req.user.uid, function(err, result) {
            if (err) {
                logger.info('[group] getMyGroups failed', err);
                return res.sendfail('getMyGroups failed(server internal error)');
            } else {
                return res.sendok(result);
            }
        });
    }
);

router.get('/webida/api/group/getassignedgroups',
    userdb.verifyToken,
    function (req, res) {
        logger.info('[group] getAssignedGroups');
        userdb.getAssignedGroups(req.user.uid, function(err, result) {
            if (err) {
                logger.info('[group] getAssignedGroups failed', err);
                return res.sendfail('getAssignedGroups failed(server internal error)');
            } else {
                return res.sendok(result);
            }
        });
    }
);

router.get('/webida/api/group/getgroupmembers',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isGroupOwnerOrMember(req.user.uid, req.query.gid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'getGroupMembers() group owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'group:' + req.query.gid;
                var aclInfo = {uid:req.user.uid, action:'group:getGroupMembers', rsc:rsc};
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
        logger.info('[group] getGroupMembers ');
        userdb.getGroupMembers(req.query.gid, function(err, result) {
            if (err) {
                logger.info('[group] getGroupMembers failed', err);
                return res.sendfail('getGroupMembers failed(server internal error)');
            } else {
                return res.sendok(result);
            }
        });
    }
);

router.get('/webida/api/group/setgroupmembers',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isGroupOwner(req.user.uid, req.query.gid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'setGroupMembers() group owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'group:' + req.query.gid;
                var aclInfo = {uid:req.user.uid, action:'group:setGroupMembers', rsc:rsc};
                userdb.checkAuthorize(aclInfo, res, function(err, result) {
                    if (err)
                        return res.sendfail('checkAuthorized failed(server internal error)');

                    if (result) {
                        return next();
                    } else {
                        return res.sendfail(new ClientError(401, 'Not authorized.'));
                    }
                });
            }
        });
    },
    function (req, res) {
        sqlConn.beginTransaction(function (err) {
            if (err)
                return next(err);

            var uidArr = [];
            if (req.query.uid.length > 0)
                uidArr = req.query.uid.split(';');

            logger.info('[group] setGroupMembers ', uidArr);
            userdb.setGroupMembers(req.query.gid, uidArr, function(err, result) {
                if (err) {
                    logger.info('[group] setGroupMembers failed', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function() {
                                return res.sendfail('setGroupMembers failed(server internal error)');
                            });
                        }

                        return res.sendok(result);
                    });
                }
            });
        });
    }
);

router.get('/webida/api/group/getallgroups',
    userdb.verifyToken,
    function (req, res) {
        logger.info('[group] getAllGroups ');
        userdb.getAllGroups(function(err, result) {
            if (err) {
                logger.info('[group] getAllGroups failed', err);
                return res.sendfail('getAllGroups failed(server internal error)');
            } else {
                return res.sendok(result);
            }
        });
    }
);

router.get('/webida/api/group/updategroup',
    userdb.verifyToken,
    function (req, res, next) {
        userdb.isGroupOwner(req.user.uid, req.query.gid, function(err, result) {
            if (err) {
                return res.sendfail(err, 'updateGroup() group owner check failed.');
            } else if (result) {
                return next();
            } else {
                var rsc = 'group:' + req.query.gid;
                var aclInfo = {uid:req.user.uid, action:'group:updateGroup', rsc:rsc};
                userdb.checkAuthorize(aclInfo, res, function(err, result) {
                    if (err)
                        return res.sendfail(err, 'checkAuthorized failed');

                    if (result) {
                        return next();
                    } else {
                        return res.sendfail(new ClientError(401, 'Not authorized.'));
                    }
                });
            }
        });
    },
    function(req, res) {
        sqlConn.beginTransaction(function (err) {
            if (err)
                return next(err);

            var groupInfo = JSON.parse(req.query.group);
            logger.info('[group] updateGroup');
            userdb.updateGroup(req.query.gid, groupInfo, function(err, result) {
                if (err) {
                    logger.info('[group] updateGroup failed', err);
                    sqlConn.rollback(function() {
                        return res.sendfail(err);
                    });
                } else {
                    sqlConn.commit(function (err) {
                        if (err) {
                            sqlConn.rollback(function() {
                                return res.sendfail('updateGroup failed(server internal error)');
                            });
                        }

                        return res.sendok(result);
                    });
                }
            });
        });
    }
);
