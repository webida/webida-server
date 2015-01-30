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

var path = require('path');

var conf = {
    /* Absolute path where ssl key be stored.
     * Production server stores routing table in /var/webida/keys/.
     * It's ok for developers to let it default.
     */
    sslKeyPath: process.env.WEBIDA_SSL_KEY_PATH || path.normalize(__dirname + '/../keys/webida_core1.key'),
    sslCertPath: process.env.WEBIDA_SSL_CERT_PATH || path.normalize(__dirname + '/../keys/webida_core1.crt'),

    /* Port that the server listens on.
     * Production server uses port 80 and 443.
     * Developers MUST use other port
     */
    httpPort: process.env.WEBIDA_HTTP_PORT || '80',
    httpsPort: process.env.WEBIDA_HTTPS_PORT || '443',

    /* Host that the server listens on.
     * Production server uses all ip listen then using 0.0.0.0.
     * Developers MUST use other host
     */
    httpHost: process.env.WEBIDA_HTTP_HOST || '0.0.0.0',
    httpsHost: process.env.WEBIDA_HTTPS_HOST || '0.0.0.0',

    /* Absolute path where routing table will be stored.
     * Production server stores routing table in /var/webida/routingTable.json.
     * It's ok for developers to let it default.
     */
    routingTablePath: process.env.WEBIDA_ROUTING_TABLE_PATH || path.normalize(__dirname + '/../routingTable.json')
};

exports.conf = conf;
