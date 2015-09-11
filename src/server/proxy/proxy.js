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

var ProxySvr = function (svc, svrName, conf) {
    baseSvr.call(this, svc, svrName, conf);

    this.httpServer = null;
    this.httpsServer = null;
    this.httpProxy = new (require('http-master'))();
    this.httpProxy.on('logNotice', logger.info);
    this.httpProxy.on('logError', logger.error);

    logger.info('ProxySvr constructor');
    extend(ProxySvr, baseSvr);
};

ProxySvr.prototype.loadConfig = function (cb) {
    var self = this;
    var config = global.app.config;
    var jsfile = require('jsonfile');

    jsfile.readFile(config.routingTablePath, function (err, table) {
        if (err) {
            logger.error('read routing table failed', err);
            cb(err, null);
        } else {
            var conf = self.svc.config;
            var forceHttps = conf.forceHttps;
            var options = {
                //workerCount: require('os').cpus().length,
                ports: {},
                errorHtmlFile: __dirname + '/views/error.ejs'
            };

            /* fill http options */
            if (!forceHttps) {
                if (conf.httpHost && conf.httpPort) {
                    options.ports[conf.httpPort] = {
                        router: table.router
                    };
                }
            }

            /* fill https options */
            if (conf.httpsHost && conf.httpsPort) {
                var caExist = fs.existsSync(config.sslCaPath);
                var keyExist = fs.existsSync(config.sslKeyPath);
                var certExist = fs.existsSync(config.sslCertPath);

                if (caExist && keyExist && certExist) {
                    options.ports[conf.httpsPort] = {
                        router: table.router,
                        ssl: {
                            ca: config.sslCaPath,
                            key: config.sslKeyPath,
                            cert: config.sslCertPath
                        }
                    };
                } else {
                    logger.info('Can not find key or cert file. So does not listen https request');
                }
            }

            logger.debug('options', JSON.stringify(options, null, 4));
            cb(null, options);
        }
    });
};

ProxySvr.prototype.reload = function () {
    var self = this;

    logger.info('reload proxy due to config change');
    self.loadConfig(function (err, options) {
        if (err) {
            logger.error('fail to load config. ignore config change...');
        } else {
            var startTime;
            var proxy = self.httpProxy;
            startTime = new Date().getTime();
            /*
             * http-master reload does not work properly.
             * so close all servers before reload servers with new config.
             */
            proxy.reload({}, function() {
                //if (e1) {
                //    logger.error('failed to stop all servers', e1);
                //}
                proxy.reload(options, function (e) {
                    if (e) {
                        logger.error('failed to reload proxy. ignore error', e);
                    }
                    logger.info('proxy reloaded, downtime was ' +
                            (new Date().getTime() - startTime) + 'ms');
                });
            });
        }
    });
};

ProxySvr.prototype.start = function () {
    var self = this;
    var conf = self.svc.config;
    var config = global.app.config;
    var forceHttps = conf.forceHttps;

    if (forceHttps) {
        var http = express();
        // set up a route to redirect http to https
        http.get('*',function(req, res){
            res.redirect('https://' + req.hostname + req.url);
        });
        http.listen(80);
    }

    self.loadConfig(function (err, options) {
        if (err) {
            logger.error('fail to load config');
            throw err;
        }
        self.httpProxy.init(options, function (err) {
            if (err) {
                logger.error('failed to start proxy');
                throw err;
            }

            var watch = require('node-watch');
            watch(config.routingTablePath, function () {
                self.reload();
            });
        });
    });
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

var ProxySvc = function (unitName, svcType, conf) {
    baseSvc.call(this, unitName, svcType, conf);
    logger.info('ProxySvc constructor');

    logger.info('svc : ', this.unitName, this.svcType);
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
