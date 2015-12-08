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

var onFinished = require('on-finished');
var onHeaders = require('on-headers');
var uuid = require('uuid'); 

var factory = require ('./logger-factory.js');
var accessLogger = factory.getLogger('access');

class AccessLogData {
    constructor() {
        this.requestStartTime = process.hrtime();
        this.firstByteResponseTime = undefined;
        this.lastByteResponseTime = undefined;
        this.request = {};
        this.response = {};
    }

    _getIp(req) {
        return req.ip || (req.connection && req.connection.remoteAddress) || '';
    }

    _toMilisec(highResolutionTime) {
        let sec = highResolutionTime[0]; 
        let nanosec = highResolutionTime[1]; 
        return sec * 1000 + Math.floor(nanosec/1000000);
    }

    recordResponseStart() {
        const diff = process.hrtime(this.requestStartTime);
        this.firstByteResponseTime = this._toMilisec(diff);
    }

    recordResponseComplete() {
        const diff = process.hrtime(this.requestStartTime);
        this.lastByteResponseTime = this._toMilisec(diff);
    }

    // do not call before response complete
    fixRequestStartTime() {
        this.requestStartTime = this._toMilisec(this.requestStartTime);
    }

    // we may need to 'censor' some request data
    //  especially some headers and body properties
    //  let's see bodies
    gatherInitialRequestData(req) {
        this.request.version = req.httpVersionMajor + '.' + req.httpVersionMinor;
        this.request.url = req.originalUrl || req.url;
        this.request.method = req.method;
        this.request.headers = req.headers;
        this.request.protocol = req.protocol;
    	this.remoteAddress = this._getIp(req);
    }

    gatherProcessedRequestData(req) {
        this.request.id = req.reqId;
        this.request.stale = req.stale;
        this.request.ips = req.ips;
        this.request.params = req.params;
        this.request.body = req.body;
    }

    gatherResponseData(res) {
        // yes we need some censoring...
        this.response.status = res.statusCode;
        this._parseResponseHeader(res._header);
    }

    _parseResponseHeader(rawHeader) {
		if (!rawHeader) {
			return undefined; 
        }
        let headers = rawHeader.split('\r\n'); 
        // headers[0] == protocol/version status message
        // headers[x] == name: value  (some names are duplicated) 
        // headers[-1] == "" (end of header!) 
        if (headers.length > 0) {
            this.response.message = headers[0].split(' ').slice(2).join(' ');
	    }
        this.response.headers = {}; 
        for (let i=1; i < headers.length-1; i++) {
            let line = headers[i].split(':'); 
            if (line.length < 2) {
                continue; 
            }
            let key = line[0].trim();
            let value = line[1].trim();
            let current = this.response.headers[key];
            if (current) {
	            if (Array.isArray(current)){
                    current.push(value); 
                } else {
                    this.response.headers[key] = [current, value];
                }	
	        } else {
                this.response.headers[key] = value; 
            }
	    }
    }
}

function logAccess(accessLogData) {
    accessLogger.info(accessLogData.response.message || 'no response', accessLogData);
}

function expressHttpLog(req, res, next) {
    // log data object should be shared between req/res
    let accessLogData = new AccessLogData();
    accessLogData.gatherInitialRequestData(req);

    // record response start
    onHeaders(res, () => { accessLogData.recordResponseStart(); });
    onFinished(res, () => {
        accessLogData.recordResponseComplete();
        accessLogData.fixRequestStartTime();
        accessLogData.gatherProcessedRequestData(req);
        accessLogData.gatherResponseData(res);
        logAccess(accessLogData);
        req.logger.close();
        delete req.logger;
    });

    let reqId = uuid.v4();
    let reqLoggerName = '_request/' + reqId;
    req.reqId = reqId;
    req.logger = factory.getLogger(reqLoggerName, {
        tags : { reqId }
    });
    next();
}

module.exports = expressHttpLog;

