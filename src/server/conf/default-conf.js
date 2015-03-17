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

var useSecureProtocol =  false;
var useReverseProxy = false;
var mongoDb = 'mongodb://localhost:27017';
var proto = (useSecureProtocol ? 'https://' : 'http://');
var domain = process.env.WEBIDA_DOMAIN || 'webida.mine';
var serviceInstances = {
    app: [{port: 5001, subDomain: ''}],
    cors: [{port: 5001, subDomain: 'cors'}],
    auth: [{port: 5002, subDomain: 'auth'}],
    fs: [{port: 5003, subDomain: 'fs'}],
    build: [{port: 5004, subDomain: 'build'}],
    debug: [{port: 5008, subDomain: 'debug'}],
    conn: [{port: 5010, subDomain: 'conn'}],
    ntf: [{port: 5011, subDomain: 'ntf'}]
};

for (var svc in serviceInstances){
    if (serviceInstances.hasOwnProperty(svc)) {
        (function (service) {
            service.forEach(function (unit) {
                unit.url = proto + (
                    useReverseProxy ? (unit.subDomain ? unit.subDomain + '.' : '') + domain : domain + ':' + unit.port);
            });
        })(serviceInstances[svc]);
    }
}

var conf = {

    /* Absolute path where log files will be stored.
     * Production server stores log in /var/webida/log.
     * It's ok for developers to let it default.
     */
    logPath: process.env.WEBIDA_LOG_PATH || path.normalize(__dirname + '/../log'),
    //logPath: process.env.WEBIDA_LOG_PATH || '/var/webida/log',

    /* Log level to be printed.
     * Level = silly | debug | verbose | info | warn | error
     * If setting log level for "info" then "silly", "debug" and "verbose" would be omitted.
     */
    logLevel: process.env.WEBIDA_LOG_LEVEL || 'debug',


    workerInfo : {
        multicoreSupported : false,
        workerCount: 0 // 0: use cpu count
    },

    /* Absolute path where ssl key be stored.
     * Production server stores routing table in /var/webida/keys/.
     * It's ok for developers to let it default.
     */
    sslKeyPath: process.env.WEBIDA_SSL_KEY_PATH || path.normalize(__dirname + '/../keys/webida.key'),
    sslCertPath: process.env.WEBIDA_SSL_CERT_PATH || path.normalize(__dirname + '/../keys/webida.crt'),


    routingTablePath: process.env.WEBIDA_ROUTING_TABLE_PATH || path.normalize(__dirname + '/routingTable.json'),

    oauthSettings: {
        webida: {
            verifyTokenURL: 'http://127.0.0.1:' + serviceInstances.auth[0].port + '/webida/api/oauth/verify'
        }
    },

    systemClients: {
        'webida-client': {
            clientID: 'CLIENT_ID_TO_BE_SET',
            clientName: 'webida-client',
            clientSecret: 'CLIENT_SECRET_TO_BE_SET',
            redirectURL: serviceInstances.app[0].url + '/auth.html',
            isSystemApp: true
        }
    },

    domain: domain,

    hostInfo: {
        fs: 'http://127.0.0.1:' + serviceInstances.fs[0].port,
        auth: {
            host: '127.0.0.1',
            port: serviceInstances.auth[0].port
        }
    },

    appHostUrl: serviceInstances.app[0].url,
    authHostUrl: serviceInstances.auth[0].url,
    fsHostUrl: serviceInstances.fs[0].url,
    debugHostUrl: serviceInstances.debug[0].url,
    buildHostUrl: serviceInstances.build[0].url,
    ntfHostUrl: serviceInstances.ntf[0].url,
    corsHostUrl: serviceInstances.cors[0].url,
    connHostUrl: serviceInstances.conn[0].url,

    db: {
        fsDb: mongoDb + '/webida_fs',
        authDb: mongoDb + '/webida_auth', // db name in mongodb for session store
        appDb: mongoDb + '/webida_app'
    },

    services: {
        auth : {
            sessionDb: 'webida_auth',
            sessionCollection: 'sessions',
            cookieKey: 'webida-auth.sid',
            cookieSecret: 'enter cookie secret key',

            codeExpireTime: 1 * 60, // 1 minute
            tokenExpireTime: 10 * 60, // 10 minutes
            tempUserExpireTime: 24 * 60 * 60, // 24 hours
            tempKeyExpireTime: 24 * 60 * 60, // 24 hours

            github: {
                clientID: 'input your client id for git hub',
                clientSecret: 'input your client secret for git hub',
                callbackURL: serviceInstances.auth[0].url + '/webida/api/oauth/githubcallback'
            },

            google: {
                clientID: 'input your client id for google',
                clientSecret: 'input your client secret for google',
                callbackURL: serviceInstances.auth[0].url + '/webida/api/oauth/googlecallback'
            },

            signup: {
                allowSignup: true,
                emailHost: 'your.smtp.server',
                emailPort: 465,
                authUser: 'no-reply@your.host',
                authPass: 'input your password',
                activatingURL: serviceInstances.auth[0].url + '/activateaccount/?',
                emailSender: 'no-reply@your.host',
                webidaSite: serviceInstances.app[0].url + '/' // url that will be redirected to after signup finishes
            },

            resetPasswordURL: serviceInstances.auth[0].url + '/resetpassword/',

            adminAccount: {
                email: 'webida@your.host',
                password: 'enter your admin password',
                isAdmin: true,
                status: 1
            },

            defaultAuthPolicy: {
                name: 'defaultAuth',
                effect: 'allow',
                action: ['auth:*'],
                resource: ['auth:*']
            },

            defaultAppPolicy: {
                name: 'defaultApp',
                effect: 'allow',
                action: ['app:*'],
                resource: ['app:*']
            },

            defaultFSSvcPolicy: {
                name: 'defaultFSSvc',
                effect: 'allow',
                action: ['fssvc:*'],
                resource: ['fssvc:*']
            },

            systemFS : [
                'fs:xkADkKcOW/*' // template engine
            ],


            baseUID: 100000,
            maxUID: 4000000000
        },


        fs: {
            serviceType: 'fs',
            fsPath: process.env.WEBIDA_FS_PATH || path.normalize(__dirname + '/../fs/fs'),

            fsAliasUrlPrefix: '/webida/alias',
            /*
             * Module name for handling lowlevel linux fs.
             * The modules are located in lib/linuxfs directory.
             * Currently two filesystems are implemented.
             * 'default': Use basic linux fs. Any POSIX fs can be used. This does not support quota.
             * 'btrfs': Use Btrfs. This supports quota.
             */
            linuxfs: 'default',

            /*
             * Settings for using LXC(Linux Containers)
             */
            lxc: {
                useLxc: true,
                confPath: path.normalize(__dirname + '/../fs/lxc/webida/webida.conf'),
                rootfsPath: path.normalize(__dirname + '/../fs/lxc/webida/rootfs'),
                containerNamePrefix: 'webida',
                userid: 'webida'
            },

            /*
             * Settings for exec() api
             */
            exec: {
                /* Lists of valid exec commands.
                 * Property name is name of command and its value is a list of valid subcommands(or first arguments of the commands).
                 * If the value is null, any subcommands are allowed.
                 */
                validExecCommands: {
                    'git': ['add', 'branch', 'tag', 'checkout', 'clone', 'commit', 'config', 'diff', 'fetch', 'init', 'log', 'merge', 'mv', 'pull', 'push', 'rebase', 'reset', 'rm', 'revert', 'show', 'stash', 'status', 'submodule', 'rev-parse', 'remote', 'blame'],
                    'git.sh': ['add', 'branch', 'tag', 'checkout', 'clone', 'commit', 'config', 'diff', 'fetch', 'init', 'log', 'merge', 'mv', 'pull', 'push', 'rebase', 'reset', 'rm', 'revert', 'show', 'stash', 'status', 'submodule', 'rev-parse', 'remote', 'blame'],
                    'zip': null,
                    'ssh-keygen': null
                },
                // If exec() is running more than this value, it's stopped and fails.
                timeoutSecs: 5 * 60 // 5 mins
            },

            fsPolicy: {
                numOfFsPerUser: 1,
                fsQuotaInBytes: 1024 * 1024 * 1024 // 1GiB
            },

            uploadPolicy: {
                maxUploadSize: 1024 * 1024 * 100 // 100MB
            }
        },
        conn: {
            modulePath: 'notify/conn-svr.js'
        },
        ntf: {
            modulePath: 'notify/ntf-svr.js'
        },
        build: {
            jmHost: '127.0.0.1',
            jmPort: 5070,
            buildDb: mongoDb + '/build_db'
        },

        buildjm: {
            wsDir: '/var/webida/build/workspaces'
        },

        app: {
            modulePath: 'app/app.js',
            appsPath: process.env.WEBIDA_APPS_PATH || path.normalize(__dirname + '/../apps'),

            /* Application count limit for single user */
            appQuotaCount: process.env.WEBIDA_APP_QUOTA_COUNT || 20,
            /* Application size for single app */
            appQuotaSize: process.env.WEBIDA_APP_QUOTA_SIZE || 70 * 1024 * 1024,

            startNodejsAppsOnStartup: true, // start nodejs apps on startup

            deploy: {
                type: 'path',  // 'path' | 'domain'
                pathPrefix: '-'
            }
        },
        proxy: ''
    },

    ntf: {
        host: '127.0.0.1',
        port: serviceInstances.ntf[0].port
    },

    //units: [ 'auth0', 'fs0', 'conn0', 'ntf0', 'build0', 'buildjm0' ],
    //units: [ 'auth0', 'fs0', 'ntf0', 'conn0', 'buildjm0', 'build0'  ],
    //units: [ 'auth0', 'fs0', 'ntf0', 'conn0', 'buildjm0', 'build0', 'app0', 'proxy0' ],
    units: [ 'auth0', 'fs0', 'ntf0', 'conn0', 'buildjm0', 'build0', 'app0' ],

    conn0: {
        serviceType: 'conn',
        host: '0.0.0.0',
        port: serviceInstances.conn[0].port,
        db: mongoDb + '/notify_db'
    },

    ntf0: {
        serviceType: 'ntf',
        host: '0.0.0.0',
        port: serviceInstances.ntf[0].port
    },

    build0: {
        serviceType: 'build',
        httpPort: '5004',
        httpsPort: null,
        jmHost: '0.0.0.0',
        jmPort: 5070,
        buildDb: mongoDb + '/build_db'
    },

    buildjm0: {
        serviceType: 'buildjm',
        jmListenPort: 5070,
        jmDb: mongoDb + '/jm_db'
    },

    auth0: {
        serviceType: 'auth',
        /* Port that the server listens on.
         * If httpsPort is not specified, do not listen https.
         */
        httpPort: serviceInstances.auth[0].port,
        httpsPort: null,

        /* Host that the server listens on.
         * Set 0.0.0.0 to listen from all IPs.
         * If httpsHost is not specified, do not listen https.
         */
        httpHost: process.env.WEBIDA_HTTP_HOST || '0.0.0.0',
        httpsHost: null
    },

    fs0: {
        serviceType: 'fs',
        httpPort: serviceInstances.fs[0].port,
        httpsPort: null,

        /* Host that the server listens on.
         * Set 0.0.0.0 to listen from all IPs.
         * If httpsHost is not specified, do not listen https.
         */
        httpHost: process.env.WEBIDA_HTTP_HOST || '0.0.0.0',
        httpsHost: null
    },

    app0: {
        serviceType: 'app',
        /* Port that the server listens on.
         * If httpsPort is not specified, do not listen https.
         */
        httpPort: serviceInstances.app[0].port,
        httpsPort: null,

        /* Host that the server listens on.
         * Set 0.0.0.0 to listen from all IPs.
         * If httpsHost is not specified, do not listen https.
         */
        httpHost: process.env.WEBIDA_HTTP_HOST || '0.0.0.0',
        httpsHost: null
    },

    proxy0: {
        serviceType: 'proxy',
        forceHttps: false,
        httpPort: process.env.WEBIDA_HTTP_PORT || '80',
        httpsPort: process.env.WEBIDA_HTTPS_PORT || '443',

        /* Host that the server listens on.
         * Production server uses all ip listen then using 0.0.0.0.
         * Developers MUST use other host
         */
        httpHost: process.env.WEBIDA_HTTP_HOST || '0.0.0.0',
        httpsHost: process.env.WEBIDA_HTTPS_HOST || '0.0.0.0'
    }

};

exports.conf = conf;
