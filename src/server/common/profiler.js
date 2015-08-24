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
var onFinished = require('on-finished');
var url = require('url');
var HashMap = require('hashmap').HashMap;
var db = require('./db');
var pfdb = require('./pfdb');
var async = require('async');



function _log(msg) {
    logger.debug('[PROF] ', msg);
}

function _err(msg) {
    logger.error('[PROF] ', msg);
}


function getip(req) {
  return req.ip
    || req._remoteAddress
    || (req.connection && req.connection.remoteAddress)
    || undefined;
}

function getFormattedTime() {
   return new Date();
}

function getResponseTime(req, res) {
    if (!req._startTime) {
        return null;
    }
    var diff = process.hrtime(req._startAt);
    var ms = diff[0] * 1e3 + diff[1] * 1e-6; 
    return ms;
}


var storeMgr = (function () {
})();

//
// ReqInfo
//

var ReqInfo = function (instId, url, method) { 
    this._instId = instId;
    this._url = url;
    this._method = method;
    this._min = null;
    this._max = null;
    this._avg = null; 
    this._failCnt = 0;
    this._totalCnt = 0;

    this._dirty = false;
}

ReqInfo.prototype.reset = function () {
    this._min = null;
    this._max = null;
    this._avg = null; 
    this._failCnt = 0;
    this._totalCnt = 0;

    this._dirty = false;
}

ReqInfo.prototype.update = function (responseTime) {
    var self = this;
    self._avg = (self._avg === null) ? responseTime : ((self._avg * self._totalCnt + responseTime) / (self._totalCnt + 1)); 
    self._totalCnt++;
    this._min = Math.min((this._min !== null) ? this._min : responseTime, responseTime);
    this._max = Math.max((this._max !== null) ? this._max : responseTime, responseTime);
    //_log('request updated : ' + self._url);
    //_log(self.getOutStr());
    self._dirty = true;
};

ReqInfo.prototype.getOutStr = function() {
    var self = this;
    var outStr = '';
    outStr += 'url =' + self._url + '\n';
    outStr += '\tmethod =' + self._method + '\n';
    outStr += '\tmin =' + self._min + '\n';
    outStr += '\tmax =' + self._max + '\n';
    outStr += '\tavg =' + self._avg + '\n';
    outStr += '\ttotalCnt =' + self._totalCnt + '\n';
    return outStr;
};

ReqInfo.prototype.updateDB = function(cb) {
    var self = this;
    if (!self._dirty) {
        return cb(new Error('there is nothing to update'));
    }
    pfdb.profile_inst_req.addData(self._instId, self._url, self._method, 
                    self._min, self._max, self._avg, self._totalCnt, function(err, result) {
        if (err) {
            logger.error('[PROF]: error inserting into lt_profile_inst_req:', err);
            return cb(err);
        }
        cb(null);
    });
};

// end of ReqInfo


// ProfileInfo
var ProfileInfo = function (id, desc, pattern) {
    this._instId = null;
    this._id = id;
    this._desc = desc;
    this._pattern = pattern;
    this._startTime = getFormattedTime();
    this._endTime = getFormattedTime();
    this._reqMap = new HashMap();

    this.getInstId = function () {
        return this._instId;
    }
    var self = this;

    this.update = function (req, resTime) {
        var url = req._parsedUrl.pathname || req.originalUrl || req.url;
        var targetUrl = url;
        if (self._pattern) {
            var reg = new RegExp(self._pattern);
            var result = reg.exec(url);
            if (!result) {
                //_log('not matched url on filter :' + url);
                return;
            }
            targetUrl = result[0];
        }

        //logger.debug('profile original url:', url);
        //logger.debug('profile target url:', targetUrl);

        var key = {
            url: targetUrl,
            method: req.method
        };

        var val = self._reqMap.get(key.url);
        if (!val) {
            val = new ReqInfo(self._instId, key.url, key.method); 
            self._reqMap.set(key.url, val);
        }
        console.log('restime = ', resTime);
        val.update(resTime); 
    };

    this.getOutStr = function () {
        var outStr = '';
        outStr += 'id =' + self._id + '\n';
        outStr += 'desc =' + self._desc + '\n';
        outStr += 'start time =' + self._startTime.toString() + '\n';
        outStr += 'end time =' + self._endTime.toString() + '\n';
        outStr += 'number of request types =' + self._reqMap.count() + '\n';
        return outStr;
    };

    this.printReqResult = function () {
        self._reqMap.forEach(function (value, key) {
            var str = value.getOutStr(); 
            console.log(str);
        });
    };

    this.insertDB = function () {
        var self = this;
        pfdb.profile_inst.addData(self._id, self._desc, 
                self._reqMap.count(), db.ISODateStr(self._startTime), function(err, result) {
            if (err) {
                logger.error('[PROF]: error inserting into databasse:', err);
                return;
            }
            self._instId = result.insertId;
            console.log('[PROF]: instid = ', result.insertId);
        });
    };

    this.stop = function (callback) {
        var self = this;
        _log('stopping profile ...');
        pfdb.profile_inst.setData(self._instId, function(err, result) {
            if (err) {
                logger.error('[PROF]: error updating to profile_inst table:', err);
                return callback(err);
            }
            logger.debug('[PROF]: stopped profile: ', self._id, self._desc, result);
            callback();
        }); 
    }

    if (config.runProfiler.dbstore) {
        this.insertDB();
    }
    this.updateAndResetReqs = function () {
        self._reqMap.forEach(function (value, key) {
            value.updateDB(function (err) {
                if (!err) {
                    value.reset();
                }
            }); 
        });
    }
};

var Profiler = function () {
    this._pflist = new Array(); 
    this._runDB = false;
    var self = this; 
    this.add = function(pfInfo) {
        self._pflist.push(pfInfo);
        _log('perf profile added - ' + pfInfo._id);
    };
   
    this.stop = function (callback) {
        console.log('[PROF] Stop profiler ...');
        async.eachSeries(self._pflist, function (pfInfo, callbackA) {
            pfInfo.stop(function (err) {
                callbackA();
            });
        }, function (err) {
            console.log('[PROF] Stoped profiler.');
            if (err) {
                callback(err);
            } else {
                callback();
            }
        });

        /*
        for (var i in self._pflist) {
            self._pflist[i].stop();
        }
        */
    };
 
    this.result = function () {
        console.log('profile count = ', self._pflist);
        for (var i in self._pflist) {
            console.log('profileInfo: \n', self._pflist[i].getOutStr());
            self._pflist[i].printReqResult();
        }
    };

    this.updateToDB = function () {
        for (var i in self._pflist) {
            self._pflist[i].updateAndResetReqs();
        }
    }


    var duration = config.runProfiler.updateDuration;
    function onTimer() {
        self.updateToDB(); 
        _log('[PROF] updated to database');     
        setTimeout(onTimer, duration);
    }

    this.setUpdate = function () {
        if (!self._runDB) {
            setTimeout(onTimer, duration);
            self._runDB = true;
        }
    }
};


var profiler = new Profiler();

    
exports.globalProfile = function (id, desc, pattern) {
    var pfInfo = new ProfileInfo(id, desc, pattern); 
    profiler.add(pfInfo);

    if (config.runProfiler.dbstore) {
        profiler.setUpdate();
    }

    return function (req, res, next) {
        req._startAt = process.hrtime();
        req._startTime = new Date();
        req._remoteAddress = getip(req);
        
        function onFinishProc() {
            var resTime = getResponseTime(req, res);
            if (resTime === null) {
                _err('failed to getResponseTime');
                return;
            }
            pfInfo.update(req, resTime);
        }
        
        onFinished(res, onFinishProc);
        next();
    }
};

exports.funcProfile = function (req, res, next) {
    // TODO : add profiling codes for a specific API

};

exports.stop = function (callback) {
    profiler.stop(function (err) {
        profiler.result();
        callback();
    });
};

