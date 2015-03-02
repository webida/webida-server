# Webida Server Quick Guide

- Server platform for Web-based IDE [webida-client](https://github.com/webida/webida-client)
- Do you want to know details about each step? Check [Advanced Guide](../README.md) first.

## Dependencies and Setup

Follow all of below instructions using `webida` user which will be created on [Prerequisites](#Prerequisites) step.

### Prerequisites

Please check the [prerequisites](./prerequsites.md) document at first.

### Install node dependency

```
# move to "<source dir>/src/server" directory
$ cd ./src/server
$ npm install
$ npm install ffi
$ npm install pty.js
```

### Update default applications

Update submodules(default applications) from git repository.
Then run "npm install/update" for each application.

```
$ git submodule init
# move to "<source dir>/" directory
$ cd ../..
$ ./update-system-apps.sh
```

### Make logging directory

```
$ mkdir ./src/server/log
```

### Initialize database for membership and authorization

```
# move to "<source dir>/src/server/" directory
$ cd ./src/server
$ node auth-install.js
```

### Initialize apps

```
$ node app-install.js
```

### Setup linux container and file system

Download and extract root file system image.

```
# move to "<source dir>/src/server/fs/lxc/webida/" directory
$ cd ./fs/lxc/webida
$ sudo tar zxf rootfs.tar.gz
```

If you want to use other directory path to put root file system image, modify configuration file `<sourcedir>/src/server/fs/lxc/webida/webida.conf`

```
# webida.conf
...
lxc.rootfs = new/directory/path/for/rootfs
...
```

Create root directory used as file system for each user.

```
# move to "<source dir>/src/server/fs/" directory
$ cd ../..
$ mkdir fs
```

## Run

Run unit-manager.js

```
# move to "<source dir>/src/server/" directory
$ cd ..
$ node unit-manager.js
```

Then you can access the default application at [http://webida.mine:5001/](http://webida.mine:5001/) on the browser.