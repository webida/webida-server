var Path = require('path');
var URI = require('URIjs');
var send = require('send');
var express = require('express');
var async = require('async');
var _ = require('lodash');
var tmp = require('tmp');
var spawn = require('child_process').spawn;

var authMgr = require('../../common/auth-manager');
var utils = require('../../common/utils');
var logger = require('../../common/log-manager');
var config = require('../../common/conf-manager').conf;
var pfdb = require('../../common/pfdb');

var ClientError = utils.ClientError;
var ServerError = utils.ServerError;


var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();


var router = new express.Router();
module.exports.router = router;


router.get('/webida/api/mon/pf/getSvcTypeList',
    authMgr.verifyToken,
    function (req, res, next) {
        pfdb.profile_inst.getSvcTypeList(function (err, result) {
            if (err) {
                return res.sendfail(err, 'failed to get svctypelist');
            }
            logger.debug('result:', result);
            return res.sendok(result);
        });
    }
); 

router.get('/webida/api/mon/pf/getInstNameList',
    authMgr.verifyToken,
    function (req, res, next) {
        pfdb.profile_inst.getInstNameList(function (err, result) {
            if (err) {
                return res.sendfail(err, 'failed to get instnamelist');
            }
            logger.debug('result:', result);
            return res.sendok(result);
        });
    }
); 

router.get('/webida/api/mon/pf/getInstList',
    authMgr.verifyToken,
    function (req, res, next) {
        pfdb.profile_inst.getInstList(function (err, result) {
            if (err) {
                return res.sendfail(err, 'failed to get instlist');
            }
            logger.debug('result:', result);
            return res.sendok(result);
        });

    }
); 

router.get('/webida/api/mon/pf/getInstListByInstName',
    authMgr.verifyToken,
    function (req, res, next) {
        pfdb.profile_inst.getInstListByInstName(req.query.instname, function (err, result) {
            if (err) {
                return res.sendfail(err, 'failed to get instlist');
            }
            logger.debug('result:', result);
            return res.sendok(result);
        });

    }
); 

router.get('/webida/api/mon/pf/getUrlList',
    authMgr.verifyToken,
    function (req, res, next) {
        pfdb.profile_inst_req.getUrlList(function (err, result) {
            if (err) {
                return res.sendfail(err, 'failed to get url list');
            }
            logger.debug('result:', result);
            return res.sendok(result);
        });
    }
); 

router.get('/webida/api/mon/pf/getCurrentReqs',
    authMgr.verifyToken,
    function (req, res, next) {
        logger.debug('query : ', req.query);
        logger.debug('options : ', req.query.options);
        var period = (req.query.period === 'true') ? true : false;
        var options = JSON.parse(req.query.options);
        pfdb.profile_inst_req.getRawData(period, req.query.startTime, req.query.endTime, 
            options, function (err, result) {
            if (err) {
                return res.sendfail(err, 'failed to get requests');
            }
            //logger.debug('result: ', result);
            return res.sendok(result);
        });
    }
); 

router.get('/webida/api/mon/pf/getCurrentReqsStat',
    authMgr.verifyToken,
    function (req, res, next) {
        logger.debug('query : ', req.query);
        logger.debug('options : ', req.query.options);
        var period = (req.query.period === 'true') ? true : false;
        var options = JSON.parse(req.query.options);
        pfdb.profile_inst_req.getData(period, req.query.startTime, req.query.endTime, 
            options, function (err, result) {
            if (err) {
                return res.sendfail(err, 'failed to get requests');
            }
            //logger.debug('result: ', result);
            return res.sendok(result);
        });
    }
); 


router.get('/webida/api/mon/pf/getStatisticsHistory',
    authMgr.verifyToken,
    function (req, res, next) {
        logger.debug('query : ', req.query);
        logger.debug('options : ', req.query.options);
        var options = JSON.parse(req.query.options);

        var unitTime = req.query.unitTime;
        if (unitTime === 'Hourly') {
            pfdb.profile_req_statistics.getHourlyStat(req.query.startTime, req.query.endTime, 
                options, function (err, result) {
                if (err) {
                    return res.sendfail(err, 'failed to get hourly statistics');
                }
                //logger.debug('result: ', result);
                return res.sendok(result);
            });
        } else if (unitTime === 'Daily') {
            pfdb.profile_req_statistics.getDailyStat(req.query.startTime, req.query.endTime, 
                options, function (err, result) {
                if (err) {
                    return res.sendfail(err, 'failed to get daily statistics');
                }
                //logger.debug('result: ', result);
                return res.sendok(result);
            });
        }
    }
); 



