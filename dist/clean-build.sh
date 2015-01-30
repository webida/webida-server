#!/bin/bash


#set -x

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


TARGET_BASE="target"
TARGET_HOST=$1
TARGET_PROFILE=$2
echo "----- Target host: " $TARGET_HOST
REPOS_SRC_DIR="../src/server" 
REPOS_EXT_DIR="../src/ext" 

DIST_BASE_DIR=$TARGET_BASE/$TARGET_HOST/$TARGET_PROFILE
DIST_SRC_DIR=$DIST_BASE_DIR/server
BASE_DIR=$(pwd)
echo "Base dir = " $BASE_DIR

exe2 rm -rf $DIST_SRC_DIR
echo "----- current src dir =" $(pwd)
echo "----- Now, let's run pac in each server directory to remove dependency from npm"

SERVER_MODULES=('server-auth' 'server-fs' 'server' 'server-proxy' 'notify-server' 'build-server' 'build-jm-server')
SERVER_COUNT=${#SERVER_MODULES[@]}



function prepare_pac {
for (( i=0;i<$SERVER_COUNT;i++)); do
    echo ${SERVER_MODULES[${i}]} 
    local TMP=$BASE_DIR/$REPOS_SRC_DIR/${SERVER_MODULES[${i}]}
    echo $TMP
    exe cd $TMP
    echo "dir = " $(pwd)
    exe rm -rf .modules
    npm install
    pac
done 

echo "############################################" 
echo "########### update system apps #############" 
echo "###########                    #############" 
echo "############################################" 
exe cd $BASE_DIR/..
exe ./update-system-apps.sh


echo ----- The Packaging submodules is done
}

prepare_pac


exe cd $BASE_DIR
echo "----- current dir = " $PWD

function set_conf_for_target {
    echo "######################################################################" 
    echo "########### Copying conf files to target\'s conf files.. #############" 
    echo "###########                                              #############" 
    echo "######################################################################" 

for (( i=0;i<$SERVER_COUNT;i++)); do
    echo ${SERVER_MODULES[${i}]} 
    local TMP=$BASE_DIR/$DIST_SRC_DIR/${SERVER_MODULES[${i}]}
    echo ----- changing conf file at $TMP
    local TARGET_CONF_SRC=$TMP/conf/$TARGET_HOST.conf.js
    if [ ! -e $TARGET_CONF_SRC ]; then
        echo ----- Target conf doesn\'t exist
        #exit 0
    fi

    local TARGET_CONF_DST=$TMP/conf/conf.js
    cp -f $TARGET_CONF_SRC $TARGET_CONF_DST 
done 
}

exe rsync -avrzh --exclude-from 'exclude.list' $REPOS_SRC_DIR $DIST_BASE_DIR 
exe rsync -avrzh $REPOS_EXT_DIR $DIST_BASE_DIR 

set_conf_for_target


echo "The Preparing for distribution is done now, let's synchronize with remote server"



