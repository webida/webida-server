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

var util = require('util');
var logger = require('../common/log-manager');
var extend = require('../common/inherit').extend;
var utils = require('../common/utils');
var baseSvr = require('../common/n-svr').nSvr;
var baseSvc = require('../common/n-svc').Svc;
var express = require('express');

var session    = require('express-session');
//var MongoStore = require('connect-mongo')(session);
var FileStore = require('session-file-store')(session);
var passport = require('passport');
var corser = require('corser');
var fs = require('fs');

var oauth2 = require('./lib/oauth2-manager');
var user = require('./lib/user-manager');
var acl = require('./lib/acl-manager');
var group = require('./lib/group-manager');
var compression = require('compression');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();


var config = global.app.config;

function setXFrameOption (req, res, next) {
    res.setHeader('X-Frame-Options', 'DENY');
    next();
}

var register = function (auth, conf) {
    auth.set('views', __dirname + '/views');
    auth.set('view engine', 'ejs');

    //auth.use(setXFrameOption);
    auth.use(compression());
    auth.use(express.static(__dirname + '/views'));

    auth.use(morgan('dev'));
    auth.use(bodyParser.urlencoded({ extended: true }));
    auth.use(bodyParser.json());
    auth.use(corser.create(
        {
            methods: ['GET', 'POST', 'DELETE'],
            requestHeaders: ['Authorization', 'Accept', 'Accept-Language', 'Content-Language', 'Content-Type', 'Last-Event-ID'],
            supportsCredentials: true,
            maxAge: 86400  // as 1 day
        }
    ));
    auth.options('*', function (req, res) {
        // Just finish preflight request.
        res.writeHead(204);
        res.end();
    });
    auth.use(utils.senders);
    auth.use(cookieParser());
    auth.use(session({
        key: config.services.auth.cookieKey,
        secret: config.services.auth.cookieSecret,
        store: new FileStore({
            path: config.services.auth.sessionPath,
            ttl: 1209600    // 14 days
        }),
        /*store: new MongoStore({
            db: 'webida_auth',
            collection: conf.sessionDb
        }),*/
        resave: true,
        saveUninitialized: true
    }));
    auth.use(passport.initialize());
    auth.use(passport.session());
    auth.use(oauth2.router);
    auth.use(user.router);
    auth.use(acl.router);
    auth.use(group.router);
    auth.use(function(err, req, res, next) {
        logger.debug('errorHandler middleware', err);

        res.status(500).send('Internal server error');
        //res.send(500, 'Internal server error');
    });
    auth.disable('x-powered-by');
};


var AuthSvr = function (svc, svrName, conf) {
    baseSvr.call(this, svc, svrName, conf);

    this.svc = svc;
    this.httpServer = null;
    this.httpsServer = null;

    this.ntfMgr = require('./lib/ntf-manager').NtfMgr;
    this.ntfMgr.init('127.0.0.1', global.app.config.ntf.port, function () {
        logger.debug('connected to ntf');
    });

    this.userDb = require('./lib/userdb');
    this.userDb.start(svc, this.ntfMgr);

    extend(AuthSvr, baseSvr);
};

AuthSvr.prototype.start = function () {
    var self = this;
    var conf = self.svc.config;
    var httpApp = express();
    
    // TODO: fixme
    user.start(self.svc);
    acl.init(self.svc, conf);
    //group.init(self.svc, self.config);

    register(httpApp, conf);

    self.httpServer = httpApp.listen(conf.httpPort, conf.httpHost);
    logger.info('authorization http server is started at port ' + conf.httpPort);

    if (conf.httpsPort && conf.httpsHost) {
        // Set http Server ssl keys
        var options = {
            key: fs.readFileSync(conf.sslKeyPath, 'utf8'),
            cert: fs.readFileSync(conf.sslCertPath, 'utf8')
        };
        var httpsApp = express(options);
        register(httpsApp);
        self.httpsServer = httpsApp.listen(conf.httpsPort, conf.httpsHost);
        logger.info('authorization https server is started at port ' + conf.httpsPort);
    }

}

AuthSvr.prototype.stop = function () {
    var self = this;
    if (self.httpServer) {
        self.httpServer.close();
        self.httpServer = null;
    }

    if (self.httpsServer) {
        self.httpsServer.close();
        self.httpsServer = null;
    }

    require('./lib/userdb').close();
}

//
// AuthSvc
//

var AuthSvc = function (svcName, conf) {
    baseSvc.call(this, svcName, conf);
    logger.info('AuthSvc constructor'); 

    logger.info('svc name = ', this.name);
    this.authSvr = new AuthSvr(this, 'auth', conf);
};


extend(AuthSvc, baseSvc);

AuthSvc.prototype.start = function () {
    var self = this;
    self.authSvr.start();
}

AuthSvc.prototype.stop = function () {
    var self = this;
    self.authSvr.stop();
}

AuthSvc.prototype.started = function () {

}

AuthSvc.prototype.stopped = function () {

}


exports.Svc = AuthSvc


