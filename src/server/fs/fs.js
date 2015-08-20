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

var logger = require('../common/log-manager');
var express = require('express');
var corser = require('corser');
var fs = require('fs');
var fsMgr = require('./lib/fs-manager');
var consoleMgr = require('./lib/console-manager');

var utils = require('../common/utils');
var extend = require('../common/inherit').extend;
var baseSvr = require('../common/n-svr').nSvr;
var baseSvc = require('../common/n-svc').Svc;
var compression = require('compression');
var morgan = require('morgan');
var bodyParser = require('body-parser');

function urlParser(req, res, next) {
    req.parsedUrl = require('url').parse(req.url, true);
    next();
}


morgan.format('dev', function (tokens, req, res) {
    var status = res.statusCode;
    var len = parseInt(res.getHeader('Content-Length'), 10);
    var color = 32;

    if (status >= 500) { color = 31; }
    else if (status >= 400) { color = 33; }
    else if (status >= 300) { color = 36; }

    len = isNaN(len) ? '' : len = ' - ' + len;

    return '\u001b[90m' +
        req.ip + ' ' +
        req.method + ' ' +
        req.originalUrl + ' ' + '\u001b[' + color + 'm' + res.statusCode +
        ' \u001b[90m' + (new Date() - req._startTime) + 'ms' + len + '\u001b[0m';
});

var register = function (server) {
    server.enable('trust proxy');

    server.set('view engine', 'ejs');
    server.set('views', __dirname + '/views');

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
    server.use(morgan('dev', {stream:logger.stream}));
    server.use(urlParser);
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use(bodyParser.json());
    server.use(utils.senders);
    server.use(logger.simpleLogger('REQUEST'));
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

    logger.info('FsSvr constructor');
    extend(FsSvr, baseSvr);
};

FsSvr.prototype.start = function () {
    var self = this;
    var conf = self.svc.config;
    var httpApp = express();

    register(httpApp);

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

}

FsSvr.prototype.stop = function () {
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
}

//
// FsSvc
//

var FsSvc = function (svcName, conf) {
    baseSvc.call(this, svcName, conf);
    logger.info('FsSvc constructor');

    logger.info('svc name = ', this.name);
    this.fsSvr = new FsSvr(this, 'fs', conf);
};


extend(FsSvc, baseSvc);

FsSvc.prototype.start = function () {
    var self = this;
    logger.info(this.svcName);
    self.fsSvr.start();
}

FsSvc.prototype.stop = function () {
    var self = this;
    self.fsSvr.stop();
}

FsSvc.prototype.started = function () {

}

FsSvc.prototype.stopped = function () {
}


exports.Svc = FsSvc



