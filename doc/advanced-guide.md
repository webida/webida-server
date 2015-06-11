# Advanced Installation Guide

- Do you want to read simpler guide? Check [Quick Guide](./quick-guide.md) first.

## Overview

### Source structure

    /doc                documents directory
    /src                source directory
        /server         server source, configuration and installation scripts
        /ext            3rd party libraries
    update-system-apps.sh   update system applications from the repositories for each applications.

## Dependencies and Setup

At first, please check the [prerequisites](./prerequisites.md) document.

### Install sub modules
Our server use various libraries that are provided by npm. These libraries specified in the package.json in "<repository root>/src/server" directory.
Before running server, these libraries should be installed. You can run "npm install" command at the "<repository root>/src/server" directory.

    $ npm install
    $ npm install express --save
    $ npm install ffi pty.js

Then, all modules will be installed into node_modules directory.

### Make log directory
Create the log folder. If not, log will be printed to stdout.

    $ cd src/server
    $ mkdir log

### Install membership database
Our server uses Mysql database which had been already installed in prerequisite step. On this step, you should install the database schema into the database.
The `auth-install.js` which is located in the "<repository root>/src/server/" creates database and tables into your database.
The following command will do what we described above.

    $ node auth-install.js

The default database account and password is "webida".
You can query tables from the database that created by auth-install.js.

### Install default system application
Our server can serve various HTML Web applications. To serve your own HTML applications, it should be registered into database.
Default system applications specified in <source dir>/src/server/app/lib/app-manager.js and <soruce dir>/src/server/conf/default-conf.js as following codes :

app-manager.js

    // Webida system apps that is installed as default
    var WEBIDA_SYSTEM_APPS = {
        ... ,
        'app-your-own': {appid: 'app-your-own', domain: 'subdomain-your-own', apptype: 'html', name: 'Your own application',
            desc: 'Your own application', status: 'running', owner: ''}
    };

default-conf.js

    systemClients: {
        ... ,
        'app-your-own': { "clientID" : "YOUR_APPLICATION_CLINET_ID", "clientName" : "app-your-own", "clientSecret" : "YOUR_APPLICATION_SECRET", "redirectURL" : proto + "subdomain-your-own.webida.mine/auth.html", "isSystemApp" : true }
    },

Above command will get sub modules from git repository and, run "npm install" & "npm update" command to update submodules of system application.
Then you can access your-own-app by url(http(s)://subdomain-your-own.webida.mine/).

### Update system application from GIT
System application is an our default HTML application. <repository root>/update-system-apps.sh will update default client HTML application.
Following command will download & update default application.

```
$ git submodule update --init --recursive
$ git submodule foreach git pull origin master
```

### Install system application to your system.
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

        linuxfs: 'default',
        /*
        * Settings for using LXC(Linux Containers)
        */
        lxc: {
            useLxc: true,
            confPath: path.normalize(__dirname + '/../lxc/webida.conf'),
            rootfsPath: path.normalize(__dirname + '/../lxc/rootfs'),
            containerNamePrefix: 'webida',
            userid: 'webida'
    },

#### Setup the lxc directory that used in Linux Container
Create or Download rootfs file and move it to `rootfsPath` pre-configured.
If you don't have webida rootfs file, you can create one by reference to [LXC Guide](./lxc-guide.md).

#### Choosing file system type
You can choose the file system used by our file system server. The default file system doesn't support quota for each user's file system size.
On the above code block, you can specify file system type at "services.fs.linuxfs" section.
Currently, three filesystems are implemented.
* default: Use basic linux fs. Any POSIX fs can be used. This does not support quota.
* btrfs: Use Btrfs. This supports quota.
* XFS: Use XFS. This supports quota.
If you want to use QUOTA, then you can choose XFS file system that't what we recommended.
Each modules of file system's implementation are located in src/server/fs/lib/linuxfs directory.

#### File System Path
Before using XFS file system, that should be mounted to your local file system as XFS. This can be specified in services.fsPath section in above code block.
How to mount XFS file system described at prerequisites.

Create file system folder which is used each user's file system.

    $ cd /src/server/fs
    $ mkdir fs

This path also specified as "fsPath" variable in default-conf.js

### Setup Reverse Proxy
If you'd like to use reverse proxy for servers, modifying configurations is the only thing you should do before installation.

conf/default-conf.js

```
...
var useReverseProxy = true;
...
units: [ 'auth0', 'fs0', 'ntf0', 'conn0', 'buildjm0', 'build0', 'app0', 'proxy0' ],
...
```

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

### Cleanup MongoDB

```
$ mongo
use build_db
db.dropDatabase()
use webida_app
db.dropDatabase()
use webida_auth
db.dropDatabase()
use webida_fs
db.dropDatabase()
exit
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