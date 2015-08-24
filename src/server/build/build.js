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
var corser = require("corser");
var fs = require('fs');

var utils = require('../common/utils');
var extend = require('../common/inherit').extend;
var baseSvr = require('../common/n-svr').nSvr;
var baseSvc = require('../common/n-svc').Svc;

var compression = require('compression');
var morgan = require('morgan');
var bodyParser = require('body-parser');

// custom middlewares
function urlParser(req, res, next) {
    req.parsedUrl = require('url').parse(req.url, true);
    next();
}


// todo: this line should be moved to server constructor
//
var buildMgr = require('./lib/build-manager');


var register = function (server) {
    server.enable('trust proxy');
    server.use(compression());
    server.use(morgan('dev', {stream:logger.stream}));
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use(bodyParser.json());
    
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
    //server.use(express.logger({stream:logger.stream}));
    server.use(urlParser);
    server.use(utils.senders);
    server.use(logger.simpleLogger('REQUEST'));
    server.use(buildMgr.router);
    server.disable('x-powered-by');
};


var BuildSvr = function (svc, svrName, conf) {
    baseSvr.call(this, svc, svrName, conf);

    this.httpServer = null;
    this.httpsServer = null;

    logger.info('BuildSvr constructor');
};

extend(BuildSvr, baseSvr);

BuildSvr.prototype.start = function () {
    var self = this;
    var conf = self.svc.config;
    var httpApp = express();

    register(httpApp);

    self.httpServer = httpApp.listen(conf.httpPort, conf.httpHost);
    logger.info('build http server is started on port ' + conf.httpPort);

    if (conf.httpsPort && conf.httpsHost) {
        // Set http Server ssl keys
        var options = {
            key: fs.readFileSync(conf.sslKeyPath, 'utf8'),
            cert: fs.readFileSync(conf.sslCertPath, 'utf8')
        };
        var httpsApp = express(options);
        register(httpsApp);
        self.httpsServer = httpsApp.listen(conf.httpsPort, conf.httpsHost);
        logger.info('build https server is started on port ' + conf.httpsPort);
    }

}

BuildSvr.prototype.stop = function () {
    var self = this;
    if (self.httpServer) {
        self.httpServer.close();
        self.httpServer = null;
    }

    if (self.httpsServer) {
        self.httpsServer.close();
        self.httpsServer = null;
    }

    buildMgr.close();
}

//
// BuildSvc
//

var BuildSvc = function (unitName, svcType, conf) {
    baseSvc.call(this, unitName, svcType, conf);
    logger.info('BuildSvc constructor'); 

    logger.info('svc : ', this.unitName, this.svcType);
    this.buildSvr = new BuildSvr(this, 'build', conf);
};


extend(BuildSvc, baseSvc);

BuildSvc.prototype.start = function () {
    var self = this;
    logger.info(this.name);
    self.buildSvr.start();
}

BuildSvc.prototype.stop = function () {
    var self = this;
    self.buildSvr.stop();
}

BuildSvc.prototype.started = function () {

}

BuildSvc.prototype.stopped = function () {
}


exports.Svc = BuildSvc



