/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */
var proxy = require('./proxy'),
    server = require('./index'),
    colors = require('colors'),
    express = require('express'),
    cordovaProject = require('./emulate/cordovaProject'),
    hosted = require('./emulate/hosted'),
    static = require('./emulate/static');

var path = require('path');

colors.mode = "console";

var qPath = '/emulate/:usn/:ws/:pj/:pf/*'; 
var qPathBase = '/emulate/:usn/:ws/:pj/:pf'; 

function checkToken(req, res, next) {
    console.log('query = ', req.query);
    //console.log('params = ', req.params);

    if (typeof req.query.access_token !== 'undefined') {
        req.access_token = req.query.access_token;
    } else {
        req.access_token = req.cookies.accessToken;
        console.log("cookie = ", req.cookies);
    }

    res.cookie('accessToken', req.access_token);

    console.log('access token = ', req.access_token);
    //console.log('header = ', JSON.stringify(req.headers));
    next();
}

module.exports = {
    start: function (options) {
        //var app = server.start(options);
        var app = options.app;
        var router = options.router;
        if (!options.path) { options.path = [process.cwd()]; }

        
        if (!options.route) {
            options.route = "/ripple";
        } else if (!options.route.match(/^\//)) {
            options.route = "/" + options.route;
        }

        app = proxy.start({route: options.route}, app);

        app.use(checkToken);
        /*
        app.post(qPathBase + '/ripple/user-agent', function (req, res, next) {
            res.send(200);
            options.userAgent = unescape(req.body.userAgent);
            if (options.userAgent) {
                console.log("INFO:".green + ' Set Device User Agent (String): "' + options.userAgent + '"');
            } else {
                console.log("INFO:".green + ' Using Browser User Agent (String)');
            }
        });
        */

        app.use("/ripple/assets", express.static(__dirname + "/../../pkg/hosted"));

        router.get(qPath, function (req, res, next) {
            req.projPath = path.join(options.workPath, req.params.usn, req.params.ws, req.params.pj, req.params.pf, req.params.pj);
            req.filePath = req.params[0];

            next();
        });

        router.get(qPath, options.ensureLogin);
        router.get(qPath, cordovaProject.inject(options));
        router.get(qPath, hosted.inject(options));
        router.get(qPath, static.inject(options));

        //if (!options.remote) {
        //    app.use("/", static.inject(options));
        //}

// TODO: This should just talk about how to enable ripple via query params
//        app.use(options.route + "/enable/", express.static(__dirname + "/../../assets/server"));
//
//        console.log();
//        console.log("INFO:".green + " Load the URL below (in Chrome) to auto-enable Ripple.");
//        console.log("      " + ("http://localhost:" + app._port + options.route + "/enable/").cyan);
//        console.log();

        return app;
    }
};
