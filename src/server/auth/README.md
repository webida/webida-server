Auth Server
===========

This serves user/group/acl APIs and is an OAuth2 provider.

# Installation Guide
## Prerequisites
* Nodejs
* mongodb
* mysql

    
## Source Structure
    conf/                   Configurations
        default-conf.js     Default configuration
    lib/                    Auth server modules
        userdb.js           wrapper for user db operations
        oauth2-manager.js   oauth2 request handler
        user-manager.js     other auth request handler
        acl-manager.js      access control operations
        group-manager.js    group management operations
        ntf-manager.js      Notification server agent
    test/*                  Unit tests
    views/*                 HTML/JS/Templates used in auth server
    auth.js                 Auth server main
    install.js              Initialize auth server
    uninstall.js            Cleanup the server data
    Makefile                Unit test driver
    package.json            Package description
    README.md               This file
    newrelic.js             newrelic agent
     
