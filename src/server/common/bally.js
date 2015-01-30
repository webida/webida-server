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

'use strict'

var logger = require('webida-server-lib/lib/log-manager');
var dbMgr = require('./db-connect');
var dbBase = dbMgr.dbQuery;


// db table
var get_db = function(params) {
    var queryStr = 'select * from bally.db where owner_usn=?;';
    dbBase.call(this, queryStr, params);
    get_db.prototype.onResult = function(err, rows) {
        logger.info('getDB::onResult');
        logger.info(rows);
        logger.info('result = ' + JSON.stringify(rows));
    }
}

get_db.prototype = new dbBase(); 
get_db.prototype.constructor = get_db;
exports.get_db = get_db;

var update_db = function(params) {
    var queryStr = 'select * from bally.db where owner_usn=?;';
    dbBase.call(this, queryStr, params);
    update_db.prototype.onResult = function(err, rows) {
        logger.info('update_db::onResult');
        logger.info(rows);
        logger.info('result = ' + JSON.stringify(rows));
    }
}

update_db.prototype = new dbBase(); 
update_db.prototype.constructor = update_db;
exports.update_db = update_db;

var insert_db = function(owner_usn, db_name, desc) {
    var queryStr = 'INSERT INTO bally.db (owner_usn, db_name, descr, create_date, update_date) VALUES(' + owner_usn + ', \'' + db_name + '\',\'' + desc +  '\', now(), now());';

    dbBase.call(this, queryStr);
    insert_db.prototype.onResult = function(err, rows) {
        logger.info('update_db::onResult');
        logger.info(rows);
        logger.info('result = ' + JSON.stringify(rows));
    }
}
insert_db.prototype = new dbBase(); 
insert_db.prototype.constructor = insert_db;
exports.insert_db = insert_db;

// delete db
var delete_db = function(dbsn) {
    var params = [dbsn]; 
    var queryStr = 'DELETE FROM bally.db WHERE dbsn = ?';

    dbBase.call(this, queryStr, params);
    delete_db.prototype.onResult = function(err, rows) {
        logger.info('delete_db::onResult');
        logger.info(rows);
        logger.info('result = ' + JSON.stringify(rows));
    }
}
delete_db.prototype = new dbBase(); 
delete_db.prototype.constructor = delete_db;
exports.delete_db = delete_db;


// create domain
var create_domain = function(dbsn, domain_name, descr) {
    var queryStr = 'INSERT INTO bally.domain (db_dbsn, domain_name, descr, create_date, update_date) VALUES(' + dbsn + ',\'' + domain_name + '\',\'' + descr + '\', now(), now());';
    dbBase.call(this, queryStr);
    create_domain.prototype.onResult = function(err, rows) {
        logger.info('insert_domain::onResult');
        logger.info(rows);
        logger.info('result = ' + JSON.stringify(rows));
    }
}
create_domain.prototype = new dbBase(); 
create_domain.prototype.constructor = create_domain;
exports.create_domain = create_domain;



// delete domain 
var delete_domain = function(dbsn, dsn) {
    var params = new Array(dbsn, dsn);
    var queryStr = 'DELETE FROM bally.domain where db_dbsn = ?, dsn = ?;';
    dbBase.call(this, queryStr, params);
    delete_domain.prototype.onResult = function(err, rows) {
        logger.info('delete_domain::onResult');
        logger.info(rows);
        logger.info('result = ' + JSON.stringify(rows));
    }
}
delete_domain.prototype = new dbBase(); 
delete_domain.prototype.constructor = delete_domain;
exports.delete_domain = delete_domain;


/*
 * delete_all_domain
 * which deletes all domains from the domain table has specific dbsn
 * */

var delete_all_domain = function(dbsn) {
    var params = [dbsn]; 
    var queryStr = 'DELETE FROM bally.domain WHERE db_dbsn=?';
    dbBase.call(this, queryStr, params);
    delete_all_domain.prototype.onResult = function(err, rows) {
        logger.info('delete_all_domain::onResult');
        logger.info(rows);
        logger.info('result = ' + JSON.stringify(rows));
    }
}
delete_all_domain.prototype = new dbBase(); 
delete_all_domain.prototype.constructor = delete_all_domain;
exports.delete_all_domain = delete_all_domain;

//
// delete database
// which deletes the database includes related domains
//

function deleteDB(usn, dbsn, cb) {
    var delDomain = new delete_all_domain(dbsn); 
    var delDB = new delete_db(dbsn);
    delDomain.setNext(delDB);

    try {
        dbMgr.execTr(delDomain, function(err, result) {
            if (err) {
                return cb(false);
            } else {
                return cb(true);
            }
        });
    } catch (err) {
        logger.info('catch error - ' + err);
        cb(false);
    }
}

exports.deleteDB = deleteDB;

// table queries

function createDomain(domain_name) {

}

function deleteDomain(domain_name) {


}

function updateDomain(domain_name) {


}



