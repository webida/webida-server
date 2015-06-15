# XFS Guide

## Prepare XFS storage for user file system

Create directories for user file system:

    $ sudo mkdir /webida/fs
    $ soudo chown webida:webida /webida/fs

Create and Mount XFS to /webida:

    $ sudo apt-get install xfsprogs
    $ sudo mkfs.xfs </dev/sdaX> # create xfs filesystem
    $ sudo mount -o pquota </dev/sdaX> /webida/fs # mount with pquota option
    $ sudo touch /etc/projects /etc/projid # make pquota related files (?)
    $ sudo chgrp webida /etc/projects /etc/projid # Set pquota related files writable (?)

Check the contents of `/etc/fstab` file:

    # /etc/fstab: static file system information.
    #
    # Use 'blkid' to print the universally unique identifier for a
    # device; this may be used with UUID= as a more robust way to name devices
    # that works even if disks are added and removed. See fstab(5).
    #
    # <file system> <mount point>   <type>  <options>       <dump>  <pass>
    # / was on /dev/sda5 during installation
    UUID=b854d7a8-e119-40a4-a043-a0fd32edf471 /               ext4    errors=remount-ro 0       1
    # swap was on /dev/sda1 during installation
    UUID=cd6ada1f-5832-4268-a8d2-3df70a167f41 none            swap    sw              0       0

    /dev/sda6   /webida-btrfs   btrfs   defaults    1   2
    /dev/sda7   /webida         xfs defaults, pquota     1   2

Modify webida-server configuration file `<source dir>/src/server/conf/default-conf.js`

    // default-conf.js

    ...
    fsPath: process.env.WEBIDA_FS_PATH || '/webida/fs',
    ...