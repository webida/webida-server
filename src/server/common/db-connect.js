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

var utils = require('webida-server-lib/lib/utils');
var logger = require('webida-server-lib/lib/log-manager');
var config = require('webida-server-lib/lib/conf-manager').conf;


var db_connect = (function() {
    var pool;    
    function init() {
        pool = mysql.createPool( {
            host : 'localhost',
            user : 'bally_user',
            password : '1234'
        });
        pool.on('connection', function(connection) {
            connection.query('SET SESSION auto_increment_increment=1');
        });
        return pool;
    }
    
    return {
        getInstance: function() {
            if (!pool) {
                pool = init();
            }
            return pool;
        }
    };
})();

var pool = db_connect.getInstance();

var dbQuery = function(queryStr, params) {
    this.queryString = queryStr;
    this.params = params;
    this.next = null;
}

dbQuery.prototype.setNext = function(next) {
    this.next = next;
}

dbQuery.prototype.onResult = function(err, rows) {
    logger.info('dbQuery::onResult');
}

dbQuery.prototype.execProc = function(conn, next, cb) {
    var self = this;
    var query = conn.query(this.queryString, [this.params], function(err, rows) {
        if (err) {
            logger.error('failed to execute query');
            throw err; 
        }

        logger.info(rows);

        self.onResult(err, rows);
        
        if (self.next) {
            self.next.execProc(conn, self.next, cb);
        } else {
            return cb(err, rows);
        }
        //return cb(err, rows);
    });
    logger.info(query.sql);
}

dbQuery.prototype.exec = function(next, cb) {
    var self = this;
    pool.getConnection(function(err, conn) {
        self.execProc(conn, next, cb);
        conn.release();
    });    
}

exports.dbQuery = dbQuery;
exports.createQuery = function (queryStr, params) {
    return new Query(queryStr, params);
}

exports.execQuery = function(query) {
    pool.getConnection(function(err, conn) {
        query.execProc(conn, null, function(err, rows) {
            conn.release();
        });
    });
}

function execTr(query, cb) {
    pool.getConnection(function(err, conn) {
        conn.beginTransaction(function(err) {
            query.execProc(conn, query.next, function(err, result) {
                if (err) {
                    conn.rollback(function() {
                        throw err;
                    });

                } else {
                    conn.commit(function(err) {
                        if (err) {
                            conn.rollback(function() {
                                throw err;
                            });
                        }
                        logger.info('success transaction');
                    });
                }    
            });
        });
    });
}

exports.execTr = execTr;


