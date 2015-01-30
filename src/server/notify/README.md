notify server
=========

Notification Server

### Requirements
* Linux

### Installation

### Run
* `node ntf-svr.js`
* `node conn-svr.js`

### Test

### Client APIs

Please reference to apidoc.

### Development
    

### Source Structure
    conf/
        default-conf.js         Default conf file
    lib/
        client-manager.js       managing client which connected to conn-svr
        conn-msg.js             client message handlers
        conn.js                 connection server listener
        inherit.js              inheritence utility
        notify-common.js        common date types for notification
        ntf-client.js           notification server proxy which connect to ntf-svr, and used by conn-svr
        ntf.js                  notification server operations
    test/                       test programs
    conn-svr.js                 connection server main
    ntf-svr.js                  notification server main
    Makefile                    Unit test driver
    package.json                Package description
    README.md                   This file

