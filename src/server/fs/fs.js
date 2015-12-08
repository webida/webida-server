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
var consoleMgr = require('./lib/console-manager');
var compression = require('compression');
var bodyParser = require('body-parser');

var utils = require('../common/utils');
var extend = require('../common/inherit').extend;
var baseSvr = require('../common/n-svr').nSvr;
var baseSvc = require('../common/n-svc').Svc;
var logger = require('../common/log-manager');
var httpLogger = require('../common/http-logger');
var profiler = require('../common/profiler');

var fsMgr = require('./lib/fs-manager');

function urlParser(req, res, next) {
    req.parsedUrl = require('url').parse(req.url, true);
    next();
}

var register = function (server, unitName, svcType) {
    server.enable('trust proxy');

    server.set('view engine', 'ejs');
    server.set('views', __dirname + '/views');

    server.use(compression());
    server.use(corser.create({
        methods: ['GET', 'POST', 'DELETE'],
        requestHeaders: ['Authorization', 'Accept', 'Accept-Language',
            'Content-Language', 'Content-Type', 'Last-Event-ID'],
        supportsCredentials: true,
        maxAge: 86400  // as 1 day
    }));
    server.options('/webida/api/*', function (req, res) {
        // Just finish preflight request.
        res.writeHead(204);
        res.end();
    });
    server.use(httpLogger);
    server.use(urlParser);
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use(bodyParser.json());
    if (global.app.config.runProfiler.enable) {
        var pattern = '(\/webida\/api\/fs\/[^\/]+|' + '\/webida\/api\/fs|' + '\/webida\/alias\/|' + '\/socket.io\/)';
        server.use(profiler.globalProfile(unitName, svcType, pattern));
    }
    server.use(utils.senders);
    server.use(fsMgr.router);
    server.use(consoleMgr.router);
    // Console Service
    //server.io.route('console', consoleMgr.route);
    server.disable('x-powered-by');
    server.use(utils.onConnectError);
};

var FsSvr = function (svc, svrName, conf) {
    baseSvr.call(this, svc, svrName, conf);

    this.svc = svc;
    this.httpServer = null;
    this.httpsServer = null;

    this.ntfMgr = require('./lib/ntf-manager').NtfMgr;
    this.ntfMgr.init('127.0.0.1', global.app.config.ntf.port, function () {
        logger.debug('connected to ntf');
    });
    extend(FsSvr, baseSvr);
};

FsSvr.prototype.start = function () {
    var self = this;
    var conf = self.svc.config;
    var httpApp = express();

    register(httpApp, self.svc.unitName, self.svc.svcType);

    self.httpServer = httpApp.listen(conf.httpPort, conf.httpHost);
    logger.info('fs http server is started on port ' + conf.httpPort);

    consoleMgr.registerTerminalService(self.httpServer);

    if (conf.httpsPort && conf.httpsHost) {
        // Set http Server ssl keys
        var options = {
            key: fs.readFileSync(conf.sslKeyPath, 'utf8'),
            cert: fs.readFileSync(conf.sslCertPath, 'utf8')
        };
        var httpsApp = express(options);
        register(httpsApp);
        self.httpsServer = httpsApp.listen(conf.httpsPort, conf.httpsHost);
        logger.info('fs https server is started on port ' + conf.httpsPort);
    }

};

FsSvr.prototype.stop = function () {
    logger.info('stopping fs server...');
    var self = this;
    if (self.httpServer) {
        self.httpServer.close();
        self.httpServer = null;
    }

    if (self.httpsServer) {
        self.httpsServer.close();
        self.httpsServer = null;
    }

    fsMgr.close();
};

//
// FsSvc
//

var FsSvc = function (unitName, svcType, conf) {
    baseSvc.call(this, unitName, svcType, conf);
    this.fsSvr = new FsSvr(this, 'fs', conf);
};


extend(FsSvc, baseSvc);

FsSvc.prototype.start = function () {
    var self = this;
    logger.info(this.svcName);
    self.fsSvr.start();
};

FsSvc.prototype.stop = function () {
    var self = this;
    self.fsSvr.stop();
};

FsSvc.prototype.started = function () {

};

FsSvc.prototype.stopped = function () {
};


exports.Svc = FsSvc;



