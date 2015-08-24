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
    setData : function (instid, cb) {
        var query = 'update profile_inst set ended_at=now() where inst_id = ?';
        var params = [ instid ]; 
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        }); 
    }
};

exports.profile_inst = profile_inst;

var profile_inst_req = {
    addData : function (instid, url, method, min, max, avg, totalCnt, cb) {
        var query = 'insert into profile_inst_req (inst_id, req_url, req_method, min_rst, max_rst, avg_rst, total_cnt, created_at) values(?, ?, ?, ?, ?, ?, ?, now())';
        var params = [ instid, url, method, min, max, avg, totalCnt ]; 
        dbMgr.createQuery(pool, query, params, function (err, result) {
            return cb(err, result);
        });  
    },
    getData : function() {

    },

    setData : function (cb) {
    }
};

exports.profile_inst_req = profile_inst_req;



