# Prerequisites

## System Requirements

Currently, webida server officially supports Ubuntu only (tested on 14.04 64bit) Computer for running the Webida Server, with the following system requirements:

*   Ubuntu® 14.04 (64-bit)
*   At least dual-core 2 GHz of CPU
*   At least 4 GB of RAM memory
*   At least (100 GB + number of users * 10 mb) of free disk space Local administrator authority

## Install Dependencies

### Install Packages

Install Ubuntu Packages

```
$ sudo apt-get install -y make gcc g++ libattr1-dev lxc openjdk-7-jre
```

Install Node.js (tested on version **0.10.26**)

Download the latest pre-built binary from nodejs website [http://nodejs.org/download](http://nodejs.org/download) and copy it to /usr/local

```
$ wget http://nodejs.org/dist/v0.10.26/node-v0.10.26-linux-x64.tar.gz
$ tar zxvf node-v0.10.26-linux-x64.tar.gz
$ cd node-v0.10.26-linux-x64
$ sudo cp -r * /usr/local/
$ sudo npm install npm -g
```

Install grunt-cli nodejs module to system. This is required to minify system apps properly.

```
$ sudo npm install grunt-cli -g
```

Install git-svn command to system.

```
$ sudo apt-get install git-svn
```

### Install Databases

Setup mongodb or prepare a remote mongodb server

```
$ sudo apt-get install mongodb mongodb-clients mongodb-server
```

Install mysql packages and create the user/database. database name : "webida" mysql account(id/pw) : "webida"/"webida"

```
$ sudo apt-get install mysql-server mysql-client
$ sudo mysqladmin -u root create webida -p // create "webida" database
$ sudo mysql -u root -p webida // connect to "webida" database with root account
mysql> GRANT ALL PRIVILEGES ON webida.* TO webida@localhost IDENTIFIED BY 'webida' WITH GRANT OPTION; // create webida account
mysql> exit
```

## Server Settings

Webida servers should be run as webida user with 1002 uid. Run the following command in each servers.

```
$ sudo adduser --uid 1002 webida
```

If you will use reverse proxy server, webida servers can only be accessed by domain names, not by IP addresses. Set webida server domain names on DNS server. Or set domain names in local /etc/hosts file for tests.

```
127.0.0.1   webida.mine
# If you use reverse proxy server, below lines are compulsory.
127.0.0.1   auth.webida.mine
127.0.0.1   fs.webida.mine
127.0.0.1   app.webida.mine
127.0.0.1   deploy.webida.mine
127.0.0.1   jash.webida.mine
127.0.0.1   conn.webida.mine
127.0.0.1   build.webida.mine
127.0.0.1   ntf.webida.mine
127.0.0.1   debug.webida.mine
127.0.0.1   cors.webida.mine
```

## LXC Container

Read [Webida LXC Guide](./lxc-guide.md)