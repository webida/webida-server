# Webida Server
Server is a Nodejs server that enables running Apps on our services.

# Features
* Auth
* FileSystem
* Apps

# Install & Run
## Prerequisites
* Nodejs
* MongoDB

# Source Structure
    lib/
        app-manager.js      Manager for all app operations
        templates/          Templates for new apps
    spec/                   Deprecated unit tests
    systemapps/             System apps as submodules
    test/                   Unit tests
    Gruntfile.js            Deprecated unit test driver
    install.js              Initializes app server
    Makefile                Unit test driver
    package.json            Package description
    README.md               This file
    routingTable.json       Sample routing table
    server.js               App server main

