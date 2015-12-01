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
var extend = require('../common/inherit').extend;
var utils = require('../common/utils');
var baseSvr = require('../common/n-svr').nSvr;
var baseSvc = require('../common/n-svc').Svc;
var sessionCache = require('../common/cache').createCache('session');

var express = require('express');

var session    = require('express-session');
var RedisStore = require('connect-redis')(session);
var passport = require('passport');
var corser = require('corser');
var fs = require('fs');

var oauth2 = require('./lib/oauth2-manager');
var user = require('./lib/user-manager');
var acl = require('./lib/acl-manager');
var group = require('./lib/group-manager');
var profiler = require('../common/profiler');
var compression = require('compression');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var config = global.app.config;

var register = function (auth, conf, unitName, svcType) {
    auth.set('views', __dirname + '/views');
    auth.set('view engine', 'ejs');

    auth.use(compression());
    auth.use(express.static(__dirname + '/views'));

    auth.use(morgan('dev', {stream:logger.stream}));
    auth.use(bodyParser.urlencoded({ extended: true }));
    auth.use(bodyParser.json());
    if (global.app.config.runProfiler.enable) {
        var pattern = '(\/webida\/api\/oauth\/[^\/]|' + '\/webida\/api\/acl\/[^\/]|' +
                '\/webida\/api\/group\/[^\/]|' + '.)';
        auth.use(profiler.globalProfile(unitName, svcType, pattern));
    }

    auth.use(corser.create(
        {
            methods: ['GET', 'POST', 'DELETE'],
            requestHeaders: [
                'Authorization',
                'Accept',
                'Accept-Language',
                'Content-Language',
                'Content-Type',
                'Last-Event-ID'
            ],
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
        store: new RedisStore({
            client : sessionCache.redis,
            ttl : sessionCache._getTtl()
        }),
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    }));
    auth.use(passport.initialize());
    auth.use(passport.session());
    auth.use(oauth2.router);
    auth.use(user.router);
    auth.use(acl.router);
    auth.use(group.router);
    /* jshint unused:false */ // omitting 'next' somtimes introduces huge logs
    auth.use(function(err, req, res, next) {
        logger.error('errorHandler middleware', err);
        res.status(500).send('Internal server error');
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

    register(httpApp, conf, self.svc.unitName, self.svc.svcType);

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

};

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
};

//
// AuthSvc
//

var AuthSvc = function (unitName, svcType, conf) {
    baseSvc.call(this, unitName, svcType, conf);
    logger.info('AuthSvc constructor'); 

    logger.info('svc type = ', this.svcType);
    this.authSvr = new AuthSvr(this, 'auth', conf);
};


extend(AuthSvc, baseSvc);

AuthSvc.prototype.start = function () {
    var self = this;
    self.authSvr.start();
};

AuthSvc.prototype.stop = function () {
    var self = this;
    self.authSvr.stop();
};

AuthSvc.prototype.started = function () {

};

AuthSvc.prototype.stopped = function () {

};

exports.Svc = AuthSvc;

