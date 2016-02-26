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

var fs = require('fs');
var path = require('path');

/*
 * WEBIDA_HOME is mandatory (should be an existing directory) in production mode
 * to distinguish production mode and development mode, we respect node convention NODE_ENV
 */
var WEBIDA_HOME = (function () {
    var home = process.env.WEBIDA_HOME || '/home/webida';
    if (process.env.NODE_ENV === 'production') {
        if (!fs.statSync(home).isDirectory()) {
            throw new Error('WEBIDA_HOME, ' + home + ' should be a directory');
        }
    }
    return path.normalize(home);
})();

var useSecureProtocol = false;
var useReverseProxy = false;
var proto = (useSecureProtocol ? 'https://' : 'http://');

// if you want to use IP rather than domain name
//  then relace 'webida.mine' with your IP address like '12.34.56.78'

var domain = process.env.WEBIDA_DOMAIN || '127.0.0.1';
var _serviceInstances = {
    app: [{port: 5001, subDomain: ''}],
    cors: [{port: 5001, subDomain: 'cors'}],
    auth: [{port: 5002, subDomain: 'auth'}],
    fs: [{port: 5003, subDomain: 'fs'}],
    build: [{port: 5004, subDomain: 'build'}],
    debug: [{port: 5008, subDomain: 'debug'}],
    conn: [{port: 5010, subDomain: 'conn'}],
    ntf: [{port: 5011, subDomain: 'ntf'}],
    mon: [{port: 5090, subDomain: 'mon'}]
};
var serviceInstances = (function () {
    for (var svc in _serviceInstances) { //eslint-disable-line vars-on-top
        if (_serviceInstances.hasOwnProperty(svc)) {
            (function (service) {
                service.forEach(function (unit) {
                    unit.url = proto + (useReverseProxy ?
                        (unit.subDomain ? unit.subDomain + '.' : '') + domain : domain + ':' + unit.port);
                });
            })(_serviceInstances[svc]);
        }
    }
    return _serviceInstances;
})();

var conf = {

    home: WEBIDA_HOME,
    domain: domain,
    useReverseProxy: useReverseProxy,
    useSecureProtocol: useSecureProtocol,
    serviceInstances: serviceInstances,

    /*
     * Absolute path where log files will be stored.
     * Production server stores log in /home/webida/log.
     * It's ok for developers to let it default.
     */
    logPath: process.env.WEBIDA_LOG_PATH || WEBIDA_HOME + '/log',

    /* Log level to be printed. do not enable debug log in production.
     * Level = debug | info | warn | error
     */
    logLevel: process.env.WEBIDA_LOG_LEVEL || 'info',

    /*
     * Enable multicoreSupported to true, to handle requests in forked processes
     * (using node.js cluster module)
     */
    workerInfo: {
        multicoreSupported: false,
        workerCount: 0 // 0: use cpu count
    },

    runProfiler: {
        enable: false,
        dbstore: true,
        dbconn: {
            host: 'localhost',
            database: 'dbmon',
            user: 'webida',
            password: 'webida'
        },
        updateDuration: (1000 * 60)
    },

    /*
     * Absolute path where ssl key be stored.
     * Must use SSL in production mode and change file names as you have
     */
    sslKeyPath: process.env.WEBIDA_SSL_KEY_PATH || WEBIDA_HOME + '/keys/webida.key',
    sslCertPath: process.env.WEBIDA_SSL_CERT_PATH || WEBIDA_HOME + '/keys/webida.crt',
    sslCaPath: process.env.WEBIDA_SSL_CA_PATH || WEBIDA_HOME + '/keys/AlphaSSLroot.crt',


    /*
     * Routing table path controls how our internal requests would be routed.
     * Do not touch until you split each servers into separated hosts
     * routing file should be placed in the directory where this configurtion file exists
     */
    routingTablePath: process.env.WEBIDA_ROUTING_TABLE_PATH || path.normalize(__dirname + '/routingTable.json'),

    /*
     * client oauth verifiation.
     * DO NOT TOUCH : Should know what you are doing when changing this.
     */
    oauthSettings: {
        webida: {
            verifyTokenURL: 'http://127.0.0.1:' + serviceInstances.auth[0].port + '/webida/api/oauth/verify'
        }
    },

    /*
     * Deploy descriptors of system apps.
     * DO NOT TOUCH : You should know what should be changed with for
     */
    systemApps: [
        {
            id: 'webida-client',
            oAuthClientId: 'IDE_CLIENT_ID',
            oAuthClientSecret: 'IDE_CLIENT_SECRET',
            redirectUrl: '/auth.html',
            domain: 'ide',
            appType: 'html',
            name: 'Webida IDE',
            desc: 'Webida client application that provides development environment',
            status: 'running'
        },
        {
            id: 'app-dashboard',
            oAuthClientId: 'DASHBOARD_CLIENT_ID',
            oAuthClientSecret: 'DASHBOARD_CLIENT_SECRET',
            redirectUrl: '/pages/auth.html',
            domain: '',
            appType: 'html',
            name: 'Webida Dashboard',
            desc: 'Webida client application that manages workspaces & user profiles',
            status: 'running'
        }
    ],

    internalAccessInfo: {
        fs: {
            host: '127.0.0.1',
            port: serviceInstances.fs[0].port
        },
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
    monHostUrl: serviceInstances.mon[0].url,

    cache: {
        // conf.cache.redis object will be passed to ioredis client library directly
        // see ioredis API document for detalied options. (We don't support redis-cluster yet);
        redis : {
            host: '127.0.0.1',
            port: 6379,
            showFriendlyErrorStack:true
        },
        // cache items are categorized
        types : {
            session : {
                ttl : 86400*5 // 5 days
            },
            token : {
                prefix:'tk',
                expireTimePropertyName: 'expireTime',
                ttl: 0 // default value when token has no valid expire Time value
            },
            authorization: {
                prefix:'acl',
                ttl: 10*60,
                autoExtendTtl:true
            }
        }
    },

    dataMapperConf: {
        connectors: {
            mysql: {
                type: 'mysql',
                connectionLimit: 5,
                host: 'localhost',
                user: 'webida',
                password: 'webida',
                database: 'webida',
                default: true
            }
        },
        mappers: {
            sequence: 'conf/mapper/sequence-mapper.json',
            user: 'conf/mapper/user-mapper.json5',
            group: 'conf/mapper/group-mapper.json5',
            client: 'conf/mapper/client-mapper.json5',
            code: 'conf/mapper/code-mapper.json',
            token: 'conf/mapper/token-mapper.json5',
            tempKey: 'conf/mapper/temp-key-mapper.json5',
            policy: 'conf/mapper/policy-mapper.json5',
            app: 'conf/mapper/app-mapper.json5',
            alias: 'conf/mapper/alias_mapper.json',
            downloadLink: 'conf/mapper/download-link-mapper.json',
            gcmInfo: 'conf/mapper/gcm-info-mapper.json',
            keyStore: 'conf/mapper/key-store-mapper.json',
            lock: 'conf/mapper/lock-mapper.json',
            wfs: 'conf/mapper/wfs-mapper.json',
            wfsDel: 'conf/mapper/wfs-del-mapper.json',
            system: 'conf/mapper/system-mapper.json5'
        }
    },

    guestMode: {
        enable: false,
        accountPrefix: '__webida-guest-',
        passwordPrefix: 'qlalf!',
        ttl: 24 * 60 * 60 * 2 // 48 hours
    },

    services: {
        auth: {
            cookieKey: 'webida-auth.sid',
            cookieSecret: 'enter cookie secret key',
            // all time unit values are 'seconds' here
            codeExpireTime: 60, // 1 minute
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

            /*
             * To allow public sign-up, you should provide valid SMTP account to send mail
             *  And we also recomment you to use mail server that supports STARTTLS or direct SSL connection
             * If you want to change webidaSite, then you may have to write your own page with redirection
             *  to dashboard or IDE app.
             */
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

            /*
             * DO NOT TOUCH : You should know how password-reset works with, especially on dashboard.
             */
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
                resource: ['auth:<%= userId %>']
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

            systemFS: [
                'fs:xkADkKcOW/*' // template engine
            ],

            baseUID: 100000,
            maxUID: 4000000000
        },


        fs: {
            serviceType: 'fs',
            fsPath: process.env.WEBIDA_FS_PATH || WEBIDA_HOME + '/fs',
            fsAliasUrlPrefix: '/webida/alias',

            /*
             * Module name for handling lowlevel linux fs.
             * The modules are located in lib/linuxfs directory.
             * Currently two filesystems are implemented.
             * 'default': Use basic linux fs. Any POSIX fs can be used. This does not support quota.
             * 'btrfs': Use Btrfs. This supports quota.
             */
            linuxfs: 'default',

            container: {
                type: 'lxc',     // support type: ['none', 'lxc', 'docker'], do not use lxcd (deprecated)
                userid: 'webida',
                namePrefix: 'webida-',
                lxc: {
                    confPath: process.env.WEBIDA_CONTAINER_CONFIG_PATH || '/var/lib/lxc/webida/config',
                    // Evey container has it's own IP.
                    // If you are running webida in VM or your host is using 10.x.y.z IP,
                    //  0) Assign valid base, gw, ip range value.
                    //     See your LXC network configuration
                    //  1) Keep 'reserved' area not to violate DHCP range

                    net: {
                        reserved: {
                            '0.0.0': null,          /* min */
                            '255.255.255': null,    /* max */
                            '0.0.1': null           /* gateway */
                        },
                        base: '0.0.1',              /* ip base */
                        ip: '10.<%= subip %>/8',    /* ip template */
                        gw: '10.0.0.1'              /* gateway */
                    }
                },

                // deprecated. do not enable this type if you don't know what's next to enable this one.
                lxcd: {
                    confPath: process.env.WEBIDA_CONTAINER_CONFIG_PATH || '/var/lib/lxc/webida/config',
                    rootfsPath: process.env.WEBIDA_CONTAINER_ROOTFS_PATH ||'/var/lib/lxc/webida/rootfs',
                    /*
                     * lxc container expire time
                     * - stop lxc container after <expire> idle times
                     * - infinite(-1) or expire time
                     */
                    expireTime: 10 * 60,    /* 10 minutes */
                    /*
                     * wait seconds before killing container
                     * - see lxc-stop manual
                     */
                    waitTime: 5            /* 5 secs */
                },

                docker: {
                    /*
                     * container base image name
                     */
                    imageName: 'webida',
                    /*
                     * container host name
                     */
                    hostname: 'webida',
                    /*
                     * docker container expire time
                     * - stop docker container after <expire> idle times
                     * - infinite(-1) or expire time
                     */
                    expireTime: 10 * 60,    /* 10 minutes */
                    /*
                     * wait seconds before killing container
                     * - see docker stop manual
                     */
                    waitTime: 5,            /* 5 secs */
                    /*
                     * container working directory
                     */
                    workDir: '/fs',
                    /*
                     * rootfs path on the docker such as
                     * <docker root>/aufs/diff
                     */
                    rootfsPath: '****',
                    /*
                     * shared volume options such as
                     * '<host|container>:<container>[:ro]
                     */
                    volumes: []
                }
            },

            /*
             * Settings for exec() api.
             * DO NOT TOUCH : you should know what should be allowed or not for user's action
             */
            exec: {
                /* Lists of valid exec commands.
                 * Property name is name of command and its value is a list of valid subcommand
                 * (or first arguments of the commands).
                 * If the value is null, any subcommands are allowed.
                 */
                validExecCommands: {
                    git: ['add', 'branch', 'tag', 'checkout', 'clone', 'commit', 'config', 'diff', 'fetch', 'init',
                        'log', 'merge', 'mv', 'pull', 'push', 'rebase', 'reset', 'rm', 'revert', 'show', 'stash',
                        'status', 'submodule', 'rev-parse', 'remote', 'blame'],
                    'git.sh': ['add', 'branch', 'tag', 'checkout', 'clone', 'commit', 'config', 'diff', 'fetch', 'init',
                        'log', 'merge', 'mv', 'pull', 'push', 'rebase', 'reset', 'rm', 'revert', 'show', 'stash',
                        'status', 'submodule', 'rev-parse', 'remote', 'blame'],
                    zip: null,
                    'ssh-keygen': null,
                    java: null,
                    javac: null
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
            jmPort: 5070
        },

        buildjm: {
            wsDir: '/var/webida/build/workspaces'
        },

        app: {
            modulePath: 'app/app.js',
            appsPath: process.env.WEBIDA_APPS_PATH || WEBIDA_HOME + '/apps',

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

        batch: {
            modulePath: 'batch/batch.js'
        },
        mon: {
            modulePath: 'mon/mon.js'
        },
        proxy: ''
    },

    ntf: {
        host: '127.0.0.1',
        port: serviceInstances.ntf[0].port
    },

    //units: [ 'auth0', 'fs0', 'conn0', 'ntf0', 'build0', 'buildjm0' ],
    //units: [ 'auth0', 'fs0', 'ntf0', 'conn0', 'buildjm0', 'build0'  ],
    //units: [ 'auth0', 'fs0', 'ntf0', 'conn0', 'buildjm0', 'build0', 'app0', 'proxy0', 'mon0' ],
    units: [ 'auth0', 'fs0', 'ntf0', 'conn0', 'buildjm0', 'build0', 'app0', 'batch0' ],

    mon0: {
        serviceType: 'mon',
        httpHost: '0.0.0.0',
        httpPort: 5090
    },

    conn0: {
        serviceType: 'conn',
        host: '0.0.0.0',
        port: serviceInstances.conn[0].port
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
        jmPort: 5070
    },

    buildjm0: {
        serviceType: 'buildjm',
        jmListenPort: 5070
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

    batch0: {
        serviceType: 'batch'
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

if (require.main === module) {
    let checker = require('./checker');
    checker.checkConfiguration(conf);
}
