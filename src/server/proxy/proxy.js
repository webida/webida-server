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
var baseSvr = require('../common/n-svr').nSvr;
var baseSvc = require('../common/n-svc').Svc;

var express = require('express');
var fs = require('fs');
var ejs = require('ejs');

var ProxySvr = function (svc, svrName, conf) {
    baseSvr.call(this, svc, svrName, conf);

    this.httpServer = null;
    this.httpsServer = null;
    this.httpProxy = require('http-proxy');

    logger.info('ProxySvr constructor');
    extend(ProxySvr, baseSvr);
};

var errorTemplate;

ProxySvr.prototype.start = function () {
    var self = this;
    var conf = self.svc.config;
    var config = global.app.config;
    var options = {
        router: global.app.config.routingTablePath
    };
    var forceHttps = conf.forceHttps;

    function renderErrorPage(res, err){
        res.writeHead(500, {'Content-Type': 'text/html'});
        res.end(ejs.render(errorTemplate, {error: err}));
    }

    function createProxyServer(host, port, options) {
        var server = self.httpProxy.createServer(host, options).listen(port);
        server.proxy.on('proxyError', function (err, req, res) {
            if(!errorTemplate) {
                fs.readFile(__dirname + '/views/error.ejs', 'utf-8', function (fileError, template) {
                    if (fileError) {
                        res.writeHead(500, {'Content-Type': 'text/html'});
                        res.end('Something went wrong. We will fix it as soon as possible.');
                    } else {
                        errorTemplate = template;
                        renderErrorPage(res, err);
                    }
                });
            } else {
                renderErrorPage(res, err);
            }
        });
    }

    if (forceHttps) {
        var http = express();
        // set up a route to redirect http to https
        http.get('*',function(req, res){
            res.redirect('https://' + req.hostname + req.url);
        });
        http.listen(80);
    } else {
        createProxyServer(conf.httpHost,conf.httpPort, options);
    }

    if (conf.httpsHost && conf.httpsPort) {
        var keyExist = fs.existsSync(config.sslKeyPath);
        var certExist = fs.existsSync(config.sslCertPath);

        if (keyExist && certExist) {
            options.https = {
                ca: fs.readFileSync('/var/webida/keys/AlphaSSLroot.crt', 'utf8'),
                key: fs.readFileSync(config.sslKeyPath, 'utf8'),
                cert: fs.readFileSync(config.sslCertPath, 'utf8')
            };
            createProxyServer(conf.httpsHost,conf.httpsPort, options);
        } else {
            console.log('Can not find key or cert file. So does not listen https request');
        }
    }
};

ProxySvr.prototype.stop = function () {
    var self = this;
    if (self.httpServer) {
        self.httpServer.close();
        self.httpServer = null;
    }

    if (self.httpsServer) {
        self.httpsServer.close();
        self.httpsServer = null;
    }
};

//
// ProxySvc
//

var ProxySvc = function (svcName, conf) {
    baseSvc.call(this, svcName, conf);
    logger.info('ProxySvc constructor');

    logger.info('svc name = ', this.name);
    this.proxySvr = new ProxySvr(this, 'proxy', conf);
};

extend(ProxySvc, baseSvc);

ProxySvc.prototype.start = function () {
    var self = this;
    self.proxySvr.start();
};

ProxySvc.prototype.stop = function () {
    var self = this;
    self.proxySvr.stop();
};

ProxySvc.prototype.started = function () {

};

ProxySvc.prototype.stopped = function () {

};

exports.Svc = ProxySvc;


