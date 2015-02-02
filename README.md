Server platform
======

Server platform for web based IDE


### Prerequisites

Please check <a href="doc/prerequsites.md">prerequsites</a>


### Source structure

    /dist               build and distribution scripts
        /bin            runnable modules 
        /package        
        /target         profile directory which has a profile for specific host that provides services.
    /src                source directory
        /server
        /ext            3rd party libraries
    update-system-apps.sh   update system applications from the repositories for each applications.



# Server runs in single instance

## Install membership database
Our server uses my-sql database which is already installed in prerequisite step. On this step, you should install the database schema into the database.
The auth-install.js which is located in the "<repository root>/src/server/" creates database and tables into your database. 
The following command will do what we described above.

    $ cd src/server
    $ node auth-install.js

The default database account and password is "webida".
You can query tables from the database that created by auth-install.js.

## Install default system applications
Our server can serve various HTML Web applications. To serve your own HTML applications, it should be registered into database.
Default system applications specified in <source dir>/src/server/app/lib/app-manager.js and <soruce dir>/src/server/conf/default-conf.js as following codes :

app-manager.js

    // Webida system apps that is installed as default
    var WEBIDA_SYSTEM_APPS = {
        '': {appid: 'app-site', domain: '', apptype: 'html', name: 'Webida Homepage',
            desc: 'Webida Homepage', status: 'running', owner: ''},
        'dashboard': {appid: 'app-dashboard', domain: 'dashboard', apptype: 'html', name: 'Webida dashboard',
            desc: 'Webida dashboard', status: 'running', owner: ''}
    };
 
default-conf.js

        systemClients: {
                 'webida': { "clientID" : "clientid4EGKa5Wm", "clientName" : "webida", "clientSecret" :                       "secretfn9KxHSK", "redirectURL" : proto + "webida.mine/index.html", "isSystemAp    p" : true }
    },
    
## Update system application from GIT
System application is an our default HTML application. <repository root>/update-system-apps.sh will update default client HTML application.
Following command will download & update default application.

    $ git submodule init
    $ ./update-system-apps.sh
    
Above command will get sub modules from git repository and, run "npm install" & "npm update" command to update submodules of system application. 

## Install system application to your system. 
After downloading system application from GIT, system application need to be installed to your host and database.
Following command will do that.

    $ node app-install.js

app-install.js runs below steps :
* run "npm install" command to install sub modules.
* optimize source codes (compression and minify)
* copy applications to specific file system which specified in default-conf.js.
* register application information to database

## Setup Linux Container and File System
Download Linux Container from http://dl..... and extract rootfs files to lxc directory.

    $ cd <source dir>/src/server/fs/lxc
    $ sudo tar zxf rootfs.tar.gz
 
Configure Linux Container path
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

## Choosing file system type
You can choose the file system used by our file system server. The default file system doesn't support quota for each user's file system size.
On the above code block, you can specify file system type at "services.fs.linuxfs" section.
Currently, three filesystems are implemented.
* default: Use basic linux fs. Any POSIX fs can be used. This does not support quota.
* btrfs: Use Btrfs. This supports quota.
* XFS: Use XFS. This supports quota.
If you want to use QUOTA, then you can choose XFS file system that't what we recommended.
Each modules of file system's implementation are located in src/server/fs/lib/linuxfs directory.

## File System Path
Before using XFS file system, that should be mounted to your local file system as XFS. This can be specified in services.fsPath section in above code block.
How to mount XFS file system described at prerequisites.

## Install sub modules
Our server use various libraries that are provided by npm. These libraries specified in the package.json in "<repository root>/src/server" directory.
Before running server, these libraries should be installed. You can run "npm install" command at the "<repository root>/src/server" directory.

    $ npm install

Then, all modules will be installed into node_modules directory.

## Run server as single process
Create the log folder. If not, log will be printed to stdout.

    $ mkdir log

You can simply run with following command

    $ node unit-manager.js

Then, unit-manager.js just loads configuration file and run all server instance which specified in the configuration file.
In other words, all server runs in single process. and you can see server's log in one console.

# Server runs as distributed instance
Our server consist of various servers like auth, fs, app, build, ntf ..so on.
If you want to run each server as different process, you can specify the server instance name as "svc" when you run server as follow.

    $ node unit-manager.js svc=auth0

"auth0" is instance name of service that specified in default-conf.js in src/server/conf directory.
