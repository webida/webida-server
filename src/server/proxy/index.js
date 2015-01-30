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

var httpProxy = require('http-proxy');
var express = require('express');
var fs = require('fs');

var confMgr = require('webida-server-lib/lib/conf-manager');
var config = confMgr.conf;

// Http Proxy Server with Proxy Table
var options = {
    router: config.routingTablePath
};

httpProxy.createServer(config.httpHost, options).listen(config.httpPort);

if (config.httpsHost && config.httpsPort) {
    var keyExist = fs.existsSync(config.sslKeyPath);
    var certExist = fs.existsSync(config.sslCertPath);

    if (keyExist && certExist) {
        options.https = {
            key: fs.readFileSync(config.sslKeyPath, 'utf8'),
            cert: fs.readFileSync(config.sslCertPath, 'utf8')
        }

        httpProxy.createServer(config.httpsHost, options).listen(config.httpsPort);
    } else {
        console.log('Can not find key or cert file. So does not listen https request');
    }
}

// set up a route to redirect http to https
/*
var http = express();
http.get('*',function(req,res){
    res.redirect('https://' + req.host + req.url);
})
http.listen(80);
*/
