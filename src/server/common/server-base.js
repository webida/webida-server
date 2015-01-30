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
var domain = require('domain');


var serverDomain = domain.create();
exports.serverDomain = serverDomain;

serverDomain.on('error', function(err) {
    logger.error('--- Server Domain Error ---', err.stack);

    logger.sendEmail('no-reply@webida.org', 'webidascore','dsmtp.naver.com', true,
'webida <no-reply@webida.org>', 'DaiYoung Kim <daiyoung777.kim@samsung.com>, wooyoung cho <wooyoung1.cho@samsung.com>, sangjin <sangjin3.kim@samsung.com>',
 '[webida-server-notice] Server encountered an critical error and will be shutdown', err.stack, function (message) {
        logger.info('sent email: ', message);
        logger.info('Exit server process after sent email');
        process.exit(); // TODO : need to process a graceful closing
    });

    // if SMPT server is not response until timeout, then exit process.
    setTimeout(function() {
        logger.info('Exit server process by timeout');
        process.exit(); // TODO : need
    }, 1000 * 60);
});

var EventEmitter = require('events').EventEmitter;
var express = require('express');
var connectDomain = require('connect-domain');
var corser = require('corser');
var fs = require('fs');

var utils = require('./utils');
var config = require('./conf-manager').conf;
var authMgr = require('./auth-manager');


// set logger format
express.logger.format('dev2', function (tokens, req, res) {
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

function gracefulExit() {
    process.exit();
}

process.on('SIGINT', function () {
    logger.info('gracefully shutting down from SIGINT (Crtl-C)');
    gracefulExit();
});

process.on('SIGTERM', function () {
    logger.info('gracefully shutting down from SIGTERM');
    gracefulExit();
});


// custom middlewares
function urlParser(req, res, next) {
    req.parsedUrl = require('url').parse(req.url, true);
    next();
}

/*
 * http Svr class
 */

var httpSvr = function(service, host, port, ioOptions) {
    this.host = host;
    this.port = port;
    this.app  = express();
    this.lsn = null;
    this.service = service;
    this.ioOptions = ioOptions;
    //this.init();
}

httpSvr.prototype.init = function() {
    var self = this;

    if (this.ioOptions) {
        self.app.http(this.ioOptions).io();
    } else {
        self.app.http().io();
    }

    self.setupMiddleware(self.app);
    self.setupIo(self.app);
    logger.info('httpSvr::init()');
}

function setXFrameOption (req, res, next) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
}

httpSvr.prototype.setupMiddleware = function(app) {
    logger.info('httpSvr::setupMiddleware');
    app.use(connectDomain());
    app.enable('trust proxy');
    app.use(express.compress());
    app.use(express.json());
    app.use(express.urlencoded());
    app.use(setXFrameOption);
    app.use(corser.create(
        {
            methods: ['GET', 'POST', 'DELETE'],
            requestHeaders: ['Authorization', 'Accept', 'Accept-Language', 'Content-Language', 'Content-Type', 'Last-Event-ID'],
            supportsCredentials: true,
            maxAge: 86400  // as 1 day
        }
    ));
    app.options('/webida/api/*', function (req, res) {
        // Just finish preflight request.
        res.writeHead(204);
        res.end();
    });
    app.use(express.logger({stream:logger.stream}));
    app.use(urlParser);
    app.use(utils.senders);
    app.use(logger.simpleLogger('REQUEST'));
    app.use(utils.onConnectError);

}

httpSvr.prototype.setupIo = function(app) {
    app.io.configure(function() {
        app.io.enable('browser client minification'); // send minified client
        app.io.enable('browser client gzip'); // gzip the file
        //app.io.set('log level', 1); // reduce logging
        app.io.set('log level', 7); // reduce logging
        app.io.set('authorization', function (handshake, accept) {
            var accessToken = handshake.query.access_token;
            if (accessToken) {
                logger.debug('Socket.io auth', accessToken);
                authMgr._verifyToken(accessToken, function (err, user) {
                    if (err) {
                        logger.debug('Verifying access token failed', arguments, accessToken);
                        accept('Verifying access token failed.', false);
                    } else {
                        accept(null, true);
                        logger.debug('Vefified access token', user);
                        handshake.user = user;
                    }
                });
            } else {
                logger.debug('Authorization failed.(No access_token)');
                accept('Authorization failed.(No access_token)', false);
            }
        });
    });
}

httpSvr.prototype.start = function () {
    var self = this;

    self.init();
    self.lsn = self.app.listen(self.port, self.host, function () {
        logger.info('Http server listening on port: %d', self.port);
    });
    self.service.emit.emit('svrStarted', this);
}

function closeServer(lsn) {
    if (lsn) {
        lsn.close();
        lsn = null;
    }
}

httpSvr.prototype.stop = function() {
    closeServer(this.lsn);
    this.service.emit.emit('svrStopped', this);
}

exports.httpSvr = httpSvr;

/*
 * Service class is collection of servers
 */

function Service(servername) {
    this.name = servername;
    this.config = config;
    this.supportHttps = true;
    this.serverList = new Array();
    this.emit = new EventEmitter();

    var self = this;
    this.emit.on('svrStarted', function(svr) {
        self.svrStarted(svr);
    });

    this.emit.on('svrStopped', function() {
        self.svrStopped(svr);
    });
}

Service.prototype.addSvr = function(svr) {
    this.serverList.push(svr);
}

Service.prototype.getConfig = function () {
    return this.config;
}
/*
 * start service should start all servers
 * if you want change default behavior of this function, then do overwride.
 */
Service.prototype.start = function () {
    var self = this;

    var http = new httpSvr(self, config.httpHost, config.httpPort);
    this.addSvr(http);
    http.start();

    if (self.config.httpsHost && self.config.httpsPort) {
        // Set ssl keys for http server
        var options = {
            key: fs.readFileSync(config.sslKeyPath, 'utf8'),
            cert: fs.readFileSync(config.sslCertPath, 'utf8')
        };

        var https = new httpSvr(self, config.httpsHost, config.httpsPort, options);
        this.addSvr(https);
        https.start();
    }
}

Service.prototype.started = function() {
    logger.info('started');
}

/*
 * stop service that shutdowns all servers
 */
Service.prototype.stop = function() {
    logger.info('stopping server');
    for (var i=0; i<serverList.length; i++) {
        var svr = serverList[i];
        svr.stop();
    }
    logger.info('gracefully shutting down from shutdownServer');
}

Service.prototype.stopped = function() {
    logger.info('stopped');

}

/*
 * emitted when each server is started
 */
Service.prototype.svrStarted = function(svr){}
Service.prototype.svrStopped = function(svr){}


/*
 * add your custom middleware using this
 */
Service.prototype.addMiddleware = function(middleware) {
    // TODO: wrong function
    this.httpApp.use(middleware);
    if (this.supportHttps)
        this.httpsApp.use(middleware);
}

exports.Service = Service;

function runServer(svr, name,  cb) {
    var a = new svr(name);
    a.start();
}


