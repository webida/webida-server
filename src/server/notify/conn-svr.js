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

var express = require('express');
var corser = require('corser');
var compression = require('compression');
var bodyParser = require('body-parser');
var sio = require('socket.io');

var logger = require('../common/log-manager');
var httpLogger = require('../common/http-logger');
var extend = require('../common/inherit').extend;
var utils = require('../common/utils');
var baseSvr = require('../common/n-svr').nSvr;
var baseSvc = require('../common/n-svc').Svc;

var conn = require('./lib/conn');

function urlParser(req, res, next) {
    req.parsedUrl = require('url').parse(req.url, true);
    next();
}

function setXFrameOption (req, res, next) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
}

function register(app) {
    app.enable('trust proxy');
    app.use(compression({
        threshold: 0
    }));
    app.use(httpLogger);
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(setXFrameOption);
    app.use(corser.create(
        {
            methods: ['GET', 'POST', 'DELETE'],
            requestHeaders: ['Authorization', 'Accept', 'Accept-Language',
                'Content-Language', 'Content-Type', 'Last-Event-ID'],
            supportsCredentials: true,
            maxAge: 86400  // as 1 day
        }
    ));
    app.options('/webida/api/*', function (req, res) {
        // Just finish preflight request.
        res.writeHead(204);
        res.end();
    });
    //app.use(express.logger({stream:logger.stream}));
    app.use(urlParser);
    app.use(utils.senders);
}



/*
 * ConnSvr class
 */

var ConnSvr = function (svc, svrName, conf) {
    baseSvr.call(this, svc, svrName, conf);
    this.server = null;
};

extend(ConnSvr, baseSvr);

ConnSvr.prototype.start = function () {
    var self = this;
    var conf = self.svc.config;
    var app = express();

    register(app, conf);

    self.server = require('http').createServer(app);
    self.server.listen(conf.port, function () {
        logger.info('conn server started on ' + conf.host + ' : ' + conf.port);
    });

    var io = sio.listen(self.server);
    io.sockets.on('connection', function(sock) {
        conn.onClientConnected(sock, function () {
            logger.debug('client connected');
        });
    });

    /*
    self.httpServer = httpApp.listen(conf.host, conf.port, function () {
        logger.info('conn server started on ' + conf.host + ' : ' + conf.port);
        var io = sio.listen(self.httpServer);
        io.sockets.on('connection', function(sock) {
            conn.onClientConnected(sock, function (cli) {

            });
        });
    });
    */
};

ConnSvr.prototype.stop = function () {
    var self = this;
    if (self.server) {
        self.server.close();
        self.server = null;
    }
};

//
// ConnSvc
//

var ConnSvc = function (unitName, svcType, conf) {
    baseSvc.call(this, unitName, svcType, conf);
    this.connSvr = new ConnSvr(this, 'conn', conf);
};

extend(ConnSvc, baseSvc);

ConnSvc.prototype.start = function () {
    var self = this;
    self.connSvr.start();
};

ConnSvc.prototype.stop = function () {
    var self = this;
    self.connSvr.stop();
};

ConnSvc.prototype.started = function () {
    logger.info('ConnSvc started');
};

ConnSvc.prototype.stopped = function () {
    logger.info('ConnSvc stopped');
};


exports.Svc = ConnSvc;


