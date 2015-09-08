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

var logger = require('./log-manager');
var config = require('./conf-manager').conf;
var db = require('./db');
var dbMgr = db.dbMgr;
var connInfo = config.runProfiler.dbconn;

var pool = dbMgr.createPool(connInfo.host, connInfo.database, 
                            connInfo.user, connInfo.password);

function _log(msg) {
    logger.debug('[PROF] ', msg);
}

function _err(msg) {
    logger.error('[PROF] ', msg);
}


var profile_inst = {
    addData : function (instname, svctype, req_type_count, started_time, cb) {
        var query = 'insert into profile_inst (inst_name, svc_type, req_type_count, started_at, ended_at) values(?, ?, ?, ?, 0);';
        var params = [ instname, svctype, req_type_count, started_time ]; 
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        });        
    },
    getData : function() {
    },

    getInstNameList: function(cb) {
        var query = 'SELECT DISTINCT inst_name from profile_inst';
        var params = [];
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        }); 
    },

    getSvcTypeList: function (cb) {
        var query = 'SELECT DISTINCT svc_type FROM profile_inst';
        var params = [];
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        }); 
    },

    getInstList: function (cb) {
        var query = 'SELECT inst_id, started_at, ended_at FROM profile_inst';
        var params = [];
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        }); 
    },

    getInstListByInstName: function (instName, cb) {
        var query = 'SELECT inst_id, started_at, ended_at FROM profile_inst WHERE inst_name = ?';
        var params = [ instName ];
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        }); 
    },

    setData : function (instid, cb) {
        var query = 'UPDATE profile_inst set ended_at=now() where inst_id = ?';
        var params = [ instid ]; 
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        }); 
    }
};

exports.profile_inst = profile_inst;


var fieldsA = [ 'inst_id', 'req_url', 'req_method' ];
var fieldsB = [ 'svc_type', 'inst_name' ];

function existObj(arr, obj) {
    return (arr.indexOf(obj) != -1);
}

function makeReqOptionQuery(options, str) {
    for (var key in options) {
        logger.debug('key = ', key);
        var px;
        if (existObj(fieldsA, key)) {
            px = ' a.';
        } else if (existObj(fieldsB, key)) {
            px = ' b.';
        }

        if (px) {
            if (str) {
                str += ' AND ';
            }
            var op = options[key];
            str += px + key + '=\'' + op + '\''; 
        }
    }
    return str;
}

var profile_inst_req = {
    addData : function (instid, url, method, min, max, avg, totalCnt, cb) {
        var query = 'insert into profile_inst_req (inst_id, req_url, req_method, min_rst, max_rst, avg_rst, total_cnt, created_at) values(?, ?, ?, ?, ?, ?, ?, now())';
        var params = [ instid, url, method, min, max, avg, totalCnt ]; 
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        });  
    },
    getData : function(period, startTime, endTime, options, cb) {
        var query = 'SELECT a.inst_id, b.inst_name, b.svc_type, req_url, req_method, avg(min_rst) min, avg(max_rst) max, avg(avg_rst) avg, sum(total_cnt) total, min(a.created_at) started, max(a.created_at) ended FROM profile_inst_req a';

        query += ' LEFT JOIN profile_inst b ON a.inst_id=b.inst_id ';

        var str = '';
        str = makeReqOptionQuery(options, str);
        if (period) {
            var tmStart = db.ISODateStr(new Date(startTime));
            var tmEnd = db.ISODateStr(new Date(endTime));
            str += ' created_at between \'' + tmStart + '\' AND  \'' + tmEnd + '\'';
        }

        if (str) {
            str = ' WHERE ' + str;
            query += str;
        }
        
        query += ' GROUP BY inst_id, req_url, req_method ORDER BY avg(max_rst) Desc;';

        logger.debug('query = ', query);

        var params = [];
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        });
    },

    getRawData : function(period, startTime, endTime, options, cb) {
        var query = 'SELECT a.inst_id, b.inst_name, b.svc_type, req_url, req_method, min_rst min, max_rst max, avg_rst avg, total_cnt total, a.created_at FROM profile_inst_req a';

        query += ' LEFT JOIN profile_inst b ON a.inst_id=b.inst_id ';

        var str = '';
        str = makeReqOptionQuery(options, str);

        if (period) {
            var tmStart = db.ISODateStr(new Date(startTime));
            var tmEnd = db.ISODateStr(new Date(endTime));
            str += ' created_at between \'' + tmStart + '\' AND  \'' + tmEnd + '\'';
        }

        if (str) {
            str = ' WHERE ' + str;
            query += str;
        }
        
        logger.debug('query = ', query);

        var params = [];
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        });
    },


    getUrlList: function(cb) {
        var query = 'select DISTINCT req_url, req_method from profile_inst_req';
        var params = [];
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        });
    },

    setData : function (cb) {
    }
};

exports.profile_inst_req = profile_inst_req;

var fieldsStat = [ 'inst_name', 'svc_type', 'req_url', 'req_method' ];

function makeOptionQuery(fields, options, str) {
    for (var key in options) {
        logger.debug('key = ', key);
        if (existObj(fields, key)) {
            if (str) {
                str += ' AND ';
            }
            var op = options[key];
            str += px + key + '=\'' + op + '\''; 
        }
    }
    return str;
}


var profile_req_statistics = {
    getHourlyStat : function(startTime, endTime, options, cb) {
        var query = 'SELECT inst_name, svc_type, req_url, req_method, min_rst min, max_rst max, avg_rst avg, total_cnt total, issue_date FROM stat_hourly_req ';

        var str = '';
        str = makeOptionQuery(fieldsStat, options, str);

        var tmStart = db.ISODateStr(new Date(startTime));
        var tmEnd = db.ISODateStr(new Date(endTime));
        str += ' issue_date between \'' + tmStart + '\' AND  \'' + tmEnd + '\'';

        if (str) {
            str = ' WHERE ' + str;
            query += str;
        }
        
        logger.debug('query = ', query);

        var params = [];
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        });
    },

    getDailyStat : function(startTime, endTime, options, cb) {
        var query = 'SELECT inst_name, svc_type, req_url, req_method, min_rst min, max_rst max, avg_rst avg, total_cnt total, issue_date FROM stat_daily_req ';

        var str = '';
        str = makeOptionQuery(fieldsStat, options, str);

        var tmStart = db.ISODateStr(new Date(startTime));
        var tmEnd = db.ISODateStr(new Date(endTime));
        str += ' issue_date between \'' + tmStart + '\' AND  \'' + tmEnd + '\'';

        if (str) {
            str = ' WHERE ' + str;
            query += str;
        }
        
        logger.debug('query = ', query);

        var params = [];
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        });
    },


    setData : function (cb) {
    }
};


exports.profile_req_statistics = profile_req_statistics;


