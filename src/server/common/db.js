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

var mysql = require('mysql');
var DB = mysql.DB; 

//
// dbMgr
//
var dbMgr = (function() {
    return  {
        createPool : function(host, db, dbuser, pwd) {
            var pool = mysql.createPool( {
                host : host,
                user : dbuser,
                password : pwd,
                database : db
            });
            pool.on('connection', function(connection) {
                connection.query('SET SESSION auto_increment_increment=1');
            });
            return pool;
        },
        createQuery: function (pool, queryStr, params, callback) {
            var obj = new dbQuery(pool, queryStr, params, callback);
            return obj;
        },
        createTr: function (pool) {
            var obj = new dbTr(pool);
            return obj;
        }
    };
})();


function noop() {}

exports.dbMgr = dbMgr;

//
// dbQuery
//

var dbQuery = function (pool, queryStr, params, callback) {
    this.pool = pool;
    this.queryString = queryStr;
    this.params = params;
    
    if (callback) {
        this.exec(callback);
    }
};

dbQuery.prototype.setParams = function (params) {
    this.params = params;
}

dbQuery.prototype.exec = function (callback) {
    var self = this;
    self.pool.getConnection(function(err, conn) {
        if (err) {
            console.error(err);
            return callback(err);
        }
        var query = conn.query(self.queryString, self.params, function(err, rows) {
            conn.release();
            return callback(err, rows);
        });
        //console.log('SQL: ', query.sql);
    });
};

exports.dbQuery = dbQuery;


//
// dbTr
//
var dbTr = function (pool) {
    this.pool = pool;
};

dbTr.prototype.exec = function(tasks, callback) {
    callback = callback || noop;
    var length = tasks.length;
    if (length === 0) {
        return callback(new Error('no task'));
    }

    var self = this;
    self.pool.getConnection(function(err, conn) {
        if (err) {
            console.error(err);
            return callback(err);
        }
        conn.beginTransaction(function(err) {
            if (err) {
                return callback(err);
            }
            var queryResult = null;
            for (var i in tasks) {
                tasks[i](conn, queryResult, function (err, result) {
                    if (err) {
                        conn.rollback(function () {
                            return callback(err);
                        });
                    } else {
                        queryResult = result; 
                    }
                });
            }

            conn.commit(function(err) {
                if (err) {
                    conn.rollback(function() {
                        conn.release();
                        callback(err);
                    });
                }
                console.info('success transaction');
                conn.release();
                callback(null, queryResult);
            });
        });
    });
}


exports.dbTr = dbTr;

//
// utils
//
exports.ISODateStr = function (d) {
    var fmt = (new Date ((new Date((new Date(d)).toISOString() )).getTime() - ((d).getTimezoneOffset()*60000))).toISOString().slice(0, 19).replace('T', ' ');
    return fmt;
};


