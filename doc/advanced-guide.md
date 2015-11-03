# Advanced Installation Guide

- Do you want to read simpler version? Check [Quick Guide](./quick-guide.md) first.

## Source Structure

    /doc                documents directory
    /src                source directory
        /server         server source, configuration and installation scripts
            /app        app server
            /auth       auth server (oauth2, ACL and user/group management)
            /build      build server
            /buildjm    build job manager server
            /common     common modules
            /conf       configurations
            /emul       emulators
            /fs         file system server
            /notify     notification server
            /proxy      reverse proxy server
            /tests      QUnit test scripts
        /ext            3rd party libraries
    update-system-apps.sh   update system applications from the repositories for each applications.

## Dependencies And Setup

At first, please check the [prerequisites](./prerequisites.md) document.

### Install Node Dependencies
Our server use various libraries that are provided by npm. These libraries specified in the package.json in "<source dir>/src/server" directory.
Before running server, these libraries should be installed. You can run "npm install" command at the "<source dir>/src/server" directory.

    $ git clone git@github.com:webida/webida-server.git
    $ cd ./src/server
    $ npm install
    $ npm install express --save
    $ npm install ffi pty.js

Then, all modules will be installed into node_modules directory.

### Make Required Directory
Create the default log directory.

    $ mkdir ./src/server/log

You can change this paths to modify <source dir>/conf/default-conf.js file

    // default-conf.js
    ...
    logPath: process.env.WEBIDA_LOG_PATH || path.normalize(__dirname + '/../log'),
    ...
    fsPath: process.env.WEBIDA_FS_PATH || path.normalize(__dirname + '/../fs/fs'),
    ...

### Initialize Servers

#### Initialize Auth Server
Our server uses Mysql database which had been already installed in prerequisite step. On this step, you should install the database schema into the database.
The `auth-install.js` which is located in the "<source dir>/src/server/" creates database and tables into your database.
The following command will do what we described above.

    $ node auth-install.js

The default database account and password is "webida". You can change database access information to rewrite <source dir>/src/server/conf/default-conf.js file.

    // default-conf.js
    ...
    db: {
        fsDb: mongoDb + '/webida_fs',
        authDb: mongoDb + '/webida_auth', // db name in mongodb for session store
        appDb: mongoDb + '/webida_app',
        mysqlDb: {
            host : 'localhost',
            user : 'webida',
            password : 'webida',
            database : 'webida'
        }
    },
    ...

You can query tables from the database that created by auth-install.js.

#### Initialize App Server

##### Update system application from GIT

System application is an our default HTML application. <source dir>/update-system-apps.sh will update default client HTML application.
Or following command will download & update default application.

    $ <source dir>/update-system-apps.sh

    # OR

    $ git submodule update --init --recursive
    $ git submodule foreach git pull origin master

##### Install default system application
Our server can serve various HTML Web applications. To serve your own HTML applications, it should be registered into database.
Default system applications specified in <soruce dir>/src/server/conf/default-conf.js as following codes:

default-conf.js

    systemApps: [
        {
            id: 'webida-client',
            oAuthClientId: 'CLIENT_TO_BE_SET',
            oAuthClientSecret: 'CLIENT_SECRET_TO_BE_SET',
            redirectUrl: '/auth.html',
            domain: 'ide',
            appType: 'html',
            name: 'Webida IDE',
            desc: 'Webida client application for Editing',
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
            desc: 'Webida client application for management information',
            status: 'running'
        }
    ],

If you want, you can add your own system application like below:

default-conf.js

    systemApps: [
        ...,
        {
            id: 'app-your-own',
            oAuthClientId: 'YOUR_APP_CLIENT_TO_BE_SET',
            oAuthClientSecret: 'YOUR_APP_CLIENT_SECRET_TO_BE_SET',
            redirectUrl: '/auth.html',  // redirect path relative with your app root directory. It should start with slash("/").
            domain: 'myapp',
            appType: 'html',
            name: 'My app',
            desc: 'This is my app',
            status: 'running'
        }
    ],

And run this command.

    $ update-system-apps.sh

Above command will get submodules from git repository and, run "npm install" & "npm update" command to update submodules of system application.
Then you can access app-your-own by url(http(s)://myapp.webida.mine/). If you use `path` deploy option, the url will be (http(s)://webida.mine:5001/-/myapp/).


##### Install system application to your system.
After downloading system application from GIT, system application need to be installed to your host and database.
Following command will do that.

    $ node app-install.js

app-install.js runs below steps :
* run "npm install" command to install sub modules.
* optimize source codes (compression and minify)
* copy applications to specific file system which specified in default-conf.js.
* register application information to database

### Setup Linux Container and File System

#### Configure Linux Container path
There is a section(lxc) for linux container in server config file.
Each attributes in lxc section means as follow :
* useLxc - whether lxc will be used
* confPath - config file path that used when lxc running
* rootfsPath - specified container image path.
* containerNamePrefix - reversed
* userid - userid used in Linux container

Please refer to lxc section in following sample.

    services: {
    ....
    ....
    fs : {
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

#### Setup the lxc directory that used in Linux Container
Create or Download rootfs file and move it to `rootfsPath` pre-configured.
If you don't have webida rootfs file, you can create one by reference to [LXC Guide](./lxc-guide.md).

#### Choosing file system type
You can choose the file system used by our file system server. The default file system doesn't support quota for each user's file system size.
On the above code block, you can specify file system type at "services.fs.linuxfs" section.
Currently, three file Systems are implemented.

* default: Use basic linux fs. Any POSIX fs can be used. This does not support quota.
* btrfs: Use Btrfs. This supports quota.
* XFS: Use XFS. This supports quota.

If you want to use QUOTA, then you can choose XFS file system that's what we recommended.
Each modules of file system's implementation are located in src/server/fs/lib/linuxfs directory.

If you select XFS, then you should prepare XFS file system and also modify configuration file(<source dir>/src/server/conf/default-conf.js).
Refer to [XFS Guide](./xfs-guide.md) document.

#### File System Path
Before using XFS file system, that should be mounted to your local file system as XFS. This can be specified in services.fsPath section in above code block.
How to mount XFS file system described at prerequisites.

Create file system folder which is used each user's file system.

    $ cd src/server/fs
    $ mkdir fs

This path also specified as "fsPath" variable in default-conf.js

### Setup Reverse Proxy
If you'd like to use reverse proxy for servers, modifying configurations is the only thing you should do before installation.

conf/default-conf.js

    ...
    var useReverseProxy = true;
    ...
    units: [ 'auth0', 'fs0', 'ntf0', 'conn0', 'buildjm0', 'build0', 'app0', 'proxy0' ],
    ...

Then the default applications is automatically going to see the proxy server.
If you have already installed webida-server, you should uninstall first. Check this [section](#Uninstallation).


## Run
### Server runs in single instance
You can simply run all servers with following command.

    $ node unit-manager.js

Then, unit-manager.js just loads configuration file and run all server instance which specified in the configuration file.
In other words, all server runs in single process. and you can see all server's log in single console.

Then you can access the default application at [http://webida.mine:5001/](http://webida.mine:5001/) on the browser.

### Server runs as distributed instance
Our server consist of various servers like auth, fs, app, build, ntf ..so on.
If you want to run each server as different process, you can specify the server instance name as "svc" when you run server as follow.

    $ node unit-manager.js svc=auth0

"auth0" is instance name of service that specified in default-conf.js in src/server/conf directory.

Then you can access the default application at [http://webida.mine:5001/](http://webida.mine:5001/) on the browser.

## Uninstallation

If you want to cleanup webida-server, you need to clear your db and sources.

### Cleanup data

```
$ cd ./src/server
$ node fs-uninstall.js
$ node app-uninstall.js
$ node auth-uninstall.js
```

### Cleanup MysqlDB

```
$ mysql -u webida -p
drop database webida;
```

### Remove repository directory

```
$ rm -rf webida-server
```