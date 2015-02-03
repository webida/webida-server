server
=========

Server

### Requirements
* Linux

### Installation

    $ npm install
    
### Run
* `node unit-manager.js`

e.g. If you want to run auth server, following command will run auth server :
* `node unit-manager.js svc=auth0`

### Test

### Client APIs

Please reference to apidoc.


### Source Structure
    auth/
    fs/
    app/
    notify/
    build/
    buildjm/
    common/
    conf/
        default-conf.js         Default conf file
    test/                       test programs
    unit-manager.js             connection server main
    app-install.js              notification server main
    app-uninstall.js            uninstall apps
    Makefile                    Unit test driver
    package.json                Package description
    README.md                   This file

