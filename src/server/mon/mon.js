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


var fs = require('fs');

var express = require('express');
var corser = require('corser');
var pfMgr = require('./lib/pf-manager');
var compression = require('compression');
var bodyParser = require('body-parser');

var extend = require('../common/inherit').extend;
var baseSvc = require('../common/n-svc').Svc;
var baseSvr = require('../common/n-svr').nSvr;
var logger = require('../common/log-manager');
var httpLogger = require('../common/http-logger');
var utils = require('../common/utils');
var profiler = require('../common/profiler');

function urlParser(req, res, next) {
    req.parsedUrl = require('url').parse(req.url, true);
    next();
}

var register = function (server, unitName, svcType) {
    server.enable('trust proxy');
    server.use(compression());
    server.use(corser.create(
        {
            methods: ['GET', 'POST', 'DELETE'],
            requestHeaders: ['Authorization', 'Accept', 'Accept-Language', 'Content-Language', 'Content-Type', 'Last-Event-ID'],
            supportsCredentials: true,
            maxAge: 86400  // as 1 day
        }
    ));
    server.options('/webida/api/*', function (req, res) {
        // Just finish preflight request.
        res.writeHead(204);
        res.end();
    });
    server.use(httpLogger);
    server.use(urlParser);
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use(bodyParser.json());
    server.use(utils.senders);
    server.use(pfMgr.router);
    server.disable('x-powered-by');
    server.use(utils.onConnectError);
};


var MonSvr = function (svc, svrName, conf) {
    baseSvr.call(this, svc, svrName, conf);

    this.svc = svc;
    this.httpServer = null;
    this.httpsServer = null;

    logger.info('MonSvr constructor');
    extend(MonSvr, baseSvr);
};

MonSvr.prototype.start = function () {
    var self = this;
    var conf = self.svc.config;
    var httpApp = express();

    register(httpApp, self.svc.unitName, self.svc.svcType);

    self.httpServer = httpApp.listen(conf.httpPort, conf.httpHost);
    logger.info('monitor http server is started on port ' + conf.httpPort);

    if (conf.httpsPort && conf.httpsHost) {
        // Set http Server ssl keys
        var options = {
            key: fs.readFileSync(conf.sslKeyPath, 'utf8'),
            cert: fs.readFileSync(conf.sslCertPath, 'utf8')
        };
        var httpsApp = express(options);
        register(httpsApp);
        self.httpsServer = httpsApp.listen(conf.httpsPort, conf.httpsHost);
        logger.info('monitor https server is started on port ' + conf.httpsPort);
    }

}

MonSvr.prototype.stop = function () {
    logger.info('stopping monitor server...');
    var self = this;
    if (self.httpServer) {
        self.httpServer.close();
        self.httpServer = null;
    }

    if (self.httpsServer) {
        self.httpsServer.close();
        self.httpsServer = null;
    }
}

//
// MonSvc
//

var MonSvc = function (unitName, svcType, conf) {
    baseSvc.call(this, unitName, svcType, conf);
    logger.info('MonSvc constructor'); 

    logger.info('svc :', this.svcType, this.unitName);
    this.monSvr = new MonSvr(this, 'mon', conf);
};


extend(MonSvc, baseSvc);

MonSvc.prototype.start = function () {
    var self = this;
    self.monSvr.start();
}

MonSvc.prototype.stop = function () {
    var self = this;
    self.monSvr.stop();
}

MonSvc.prototype.started = function () {

}

MonSvc.prototype.stopped = function () {
}


exports.Svc = MonSvc



