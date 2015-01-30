File System Server
=========

FS Server

### Requirements
* Linux
* libattr1 library
    * Extended attributes are used to store metadata of filesystem
* uuid command
* btrfs
    * User that runs Webida FS Server should have sudo priv for running `btrfs` command without password.
      This can be set in `/etc/sudoers` like `webida ALL = (root) NOPASSWD: /usr/local/bin/btrfs`
* xfs
    * User that runs Webida FS Server should have sudo priv for running `xfs_quota` command without password.
      This can be set in `/etc/sudoers` like `webida ALL = (root) NOPASSWD: /usr/sbin/xfs_quota`
    * User that runs Webida FS Server should have write perm for /etc/projects and /etc/projid files.
      It's recommended to touch both files, change group to the user and chmod to 664.
* lxc
    * Linux containers are used to run user commands securely.

### Installation
* packages
    * `sudo apt-get install uuid libattr1`
* btrfs
    * Install lastest linux kernel
    * `sudo apt-get install btrfs-tools`
* xfs
    * `sudo apt-get install xfsprogs`
* lxc
    * `sudo apt-get install lxc`
    * `sudo tar zxvf lxc/rootfs.tar.gz`

### Test
Test may require sudo privilege for testing btrfs feature.
* `WEBIDA_DIR=<server-fs dir path> node_modules/.bin/nodeunit test/`

### Development
* lxc
If lxc rootfs is changed, tar it to lxc/rootfs.tar.gz
    
    cd lxc
    sudo tar czpf rootfs.tar.gz rootfs/

### Source Structure
    bin/
        git.sh                  SSH wrapper for git commands
    conf/
        default-conf.js         Default conf file
    lib/
        linuxfs/
            btrfs.js            Btrfs specific FS operations
            default.js          Default FS operations
            xfs.js              XFS specific FS operations
            xfs_util.sh         Manipulate XFS project's configuration (xfs project mapping table)
        attr.js                 Extended attribute operations
        console-manager.js      Exec command operations
        fs-alias.js             Alias operations
        fs-manager.js           Manager for all fs operations
        ntf-manager.js          Notification server agent
        webidafs-db.js          WFS db wrapper
        webidafs.js             WebidaFS class 
    lxc/
        rootfs/                 Extracted from of rootfs.tar.gz 
        rootfs.tar.gz           Basic rootfs for lxc
        rootfs.hold             lxc-generated file
        webida.conf             lxc conf for webida
    test/                       Unit tests
    install.js                  Initialize fs server
    Makefile                    Unit test driver
    package.json                Package description
    README.md                   This file
    fs.js                       FS server main

