#!/bin/bash


#set -x

echo Arguments :  $@

if [[ ! $1 ]]; then
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
TARGET_PROFILE=$1
echo "----- Target profile: " $TARGET_PROFILE
REPOS_SRC_DIR="../src/server" 
REPOS_EXT_DIR="../src/ext" 

DIST_BASE_DIR=$TARGET_BASE/$TARGET_PROFILE
DIST_SRC_DIR=$DIST_BASE_DIR/server
BASE_DIR=$(pwd)
echo "Base dir = " $BASE_DIR

exe2 rm -rf $DIST_SRC_DIR

echo "----- current src dir =" $(pwd)
echo "----- Now, let's run pac in each server directory to remove dependency from npm"

SERVER_MODULES=('auth' 'fs' 'server' 'proxy' 'notify' 'build' 'buildjm')
SERVER_COUNT=${#SERVER_MODULES[@]}



function prepare_pac {
for (( i=0;i<$SERVER_COUNT;i++)); do
    echo ${SERVER_MODULES[${i}]} 
    local TMP=$BASE_DIR/$REPOS_SRC_DIR/${SERVER_MODULES[${i}]}
    echo $TMP
    exe cd $TMP
    echo "dir = " $(pwd)
    #exe rm -rf .modules
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

function prepare_pac2 {
    local TMP=$BASE_DIR/$REPOS_SRC_DIR
    echo $TMP
    exe cd $TMP
    echo "dir = " $(pwd)
    #exe rm -rf .modules
    npm install
    pac

    echo "############################################" 
    echo "########### update system apps #############" 
    echo "###########                    #############" 
    echo "############################################" 
    exe cd $BASE_DIR/..
    exe ./update-system-apps.sh


    echo ----- The Packaging submodules is done
}



prepare_pac2


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

function set_conf_for_target2 {
    echo "######################################################################" 
    echo "########### Copying conf files to target\'s conf files.. #############" 
    echo "###########                                              #############" 
    echo "######################################################################" 

    local TMP=$BASE_DIR/$DIST_SRC_DIR
    echo ----- changing conf file at $TMP
    local TARGET_CONF_SRC=$TMP/conf/$TARGET_PROFILE.conf.js
    if [ ! -e $TARGET_CONF_SRC ]; then
        echo ----- Target conf doesn\'t exist
        #exit 0
    fi

    local TARGET_CONF_DST=$TMP/conf/conf.js
    cp -f $TARGET_CONF_SRC $TARGET_CONF_DST 
}


exe rsync -avrzh --exclude-from 'exclude.list' $REPOS_SRC_DIR $DIST_BASE_DIR 
exe rsync -avrzh $REPOS_EXT_DIR $DIST_BASE_DIR 
exe rsync -avrzh bin $DIST_BASE_DIR
set_conf_for_target2


echo "The Preparing for distribution is done now, let's synchronize with remote server"



