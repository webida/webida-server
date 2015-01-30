#!/bin/bash

#set -x

# This script must be in package directory.

echo Arguments :  $@

if [[ ! $1 ]] || [[ ! $2 ]]; then
    echo Host name or Host user are not specified
    exit 0
fi

exe() {
    echo "\$ $@" ; "$@" ; 
    if [ $? -ne 0 ]; then
        echo "$@ failed with exit code $?"
        exit 0
    fi
}

exe2() {
    echo "\$ $@" ; "$@" ; 
}


# copy modules to debian directory
#TARGET_HOST="dykim"
#TARGET_PROFILE="default"

TARGET_HOST=$1
TARGET_PROFILE=$2


DIST_BASE=../target/$TARGET_HOST/$TARGET_PROFILE
DIST_BASE_SERVER=$DIST_BASE/server
DIST_BASE_EXT=$DIST_BASE/ext
TARGET_BASE=debian/usr/local/webida
TARGET_VAR_DIR=debian/var/webida
TARGET_ETC_DIR=debian/etc/init

# clean previous version
echo "Deleting.. previousely installed packages in $TARGET_BASE"
rm -rf $TARGET_BASE

mkdir -p $TARGET_BASE
mkdir -p $TARGET_BASE/bin
mkdir -p $TARGET_VAR_DIR/log

# copy server module to /usr/local/webida/server 
cp -rf $DIST_BASE_SERVER $TARGET_BASE
cp -rf $DIST_BASE_EXT $TARGET_BASE

# copy upstart script to /etc/init 
cp -rf $DIST_BASE/etc/init/* $TARGET_ETC_DIR

# copy routingTable.json to /var/webida/
cp -rf $DIST_BASE/var/webida/* $TARGET_VAR_DIR

# copy start and stop scripts 
cp -rf ./../bin/* $TARGET_BASE/bin

# recommand to change file permissions to 755 or 644
find ./debian -type d | xargs chmod 755

# build debian package and rename 
rm *.deb
fakeroot dpkg-deb --build debian
mv debian.deb nimbus_1.1-0_ubuntu.deb


# let's check quality of deb module whether packaged well
#lintian nimbus_1.1-0_ubuntu.deb

