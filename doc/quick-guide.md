# Quick Installation Guide

> $ git clone git@github.com:webida/webida-server.git

Install node dependencies

```
# move to "<source dir>/src/server" directory
$ cd ./src/server
$ npm install
$ npm install express --save
$ npm install ffi pty.js
```

Update default system apps

```
$ git submodule update --init --recursive
$ git submodule foreach git pull origin master
```

Make required directories

```
$ mkdir ./log
$ mkdir ./fs/fs
```

Initialize database for membership, authorization and apps

```
$ node auth-install.js
$ node app-install.js
```

# Run server

```
# move to "<source dir>/src/server/" directory
$ node unit-manager.js
```

Then you can access application at [http://webida.mine:5001/](http://webida.mine:5001/) on the browser.