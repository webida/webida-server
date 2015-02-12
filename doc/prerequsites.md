## System requirements
Currently, webida server officially supports Ubuntu only (tested on 14.04 64bit)
Computer for running the Webida Server, with the following system requirements:
* Ubuntu® 14.04 (64-bit)
* At least dual-core 2 GHz of CPU
* At least 4 GB of RAM memory 
* At least (100 GB + number of users * 10 mb) of free disk space
Local administrator authority

## Install Ubuntu packages

    $ sudo apt-get install -y make gcc g++ libattr1-dev lxc openjdk-7-jre


## Install Node.js (tested on version 0.10.26)
Download the latest pre-built binary from nodejs website http://nodejs.org/download and copy it to /usr/local

    $ wget http://nodejs.org/dist/v0.10.26/node-v0.10.26-linux-x64.tar.gz
    $ tar zxvf node-v0.10.26-linux-x64.tar.gz
    $ cd node-v0.10.26-linux-x64
    $ sudo cp -r * /usr/local/

## Install grunt-cli nodejs module to system.

This is required to minify system apps properly.

    $ sudo npm install grunt-cli -g

## Install git-svn command to system.
This is required to use git-svn.

    $ sudo apt-get install git-svn

## Setup mongodb

    $ sudo apt-get install mongodb mongodb-clients mongodb-server
Or prepare a remote mongodb server.


## Setup mysql
Install mysql packages and create the user/database.
database name : "webida"
mysql account(id/pw) : "webida"/"webida"

    $ sudo apt-get install mysql-server mysql-client
    $ sudo mysqladmin -u root create webida -p // create "webida" database
    $ sudo mysql -u root -p webida // connect to "webida" database with root account
    mysql> GRANT ALL PRIVILEGES ON webida.* TO webida@localhost IDENTIFIED BY 'webida' WITH GRANT OPTION; // create webida account
    mysql> exit


## Create webida user
Webida servers should be run as webida user with 1002 uid. Run the following command in each servers.

    $ sudo adduser --uid 1002 webida

## Prepare storage for app and fs
 
/var/webida/apps ;;for app storage. mount this to App Server
/var/webida/fs ;;for fs storage. mount this to FS Server
/var/webida/routingTable.json ;; routing table used by proxy server and app server
; create webida directory and sub directory

    $ sudo mkdir /var/webida/apps
    $ sudo mkdir /var/webida/fs
    $ cp /routingTable.json /var/webida/routingTable.json

; change owner of above directories and files to webida user and group

    $ sudo chown webida.webida /var/webida/apps
    $ sudo chown webida.webida /var/webida/fs
    $ sudo chown webida.webida /var/webida/routingTable.json
    $ ls -al
    ..
    drwxr-xr-x 160 webida webida 12288 Dec 12 18:39 apps
    drwxr-xr-x 42 webida webida 4096 Dec 12 14:42 fs
    -rw-rw-r 1 webida webida 329 Nov 23 12:18 routingTable.json
    ..
If using XFS, run the following commands

    $ sudo apt-get install xfsprogs
    $ sudo mkfs.xfs </dev/sdaX> # create xfs filesystem
    $ sudo mount -o pquota </dev/sdaX> /var/webida/fs # mount with pquota option
    $ sudo touch /etc/projects /etc/projid # make pquota related files
    $ sudo chgrp webida /etc/projects /etc/projid # Set pquota related files writable

For more information about XFS setting, read Server Administrator Guide


## Server domain setting
Webida servers can only be accessed by domain names, not by ip addresses.
Set webida server domain names on DNS server. Or set domain names in local /etc/hosts file for tests.

    127.0.0.1   webida.org
    127.0.0.1   auth.webida.org
    127.0.0.1   fs.webida.org
    127.0.0.1   conn.webida.org
    127.0.0.1   build.webida.org
    127.0.0.1   ntf.webida.org
    127.0.0.1   devenv.webida.org
    
 
The pac which helps deployment of node_modules in each server. 

    $ npm install pac -g
