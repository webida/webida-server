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
TARGET_PROFILE=$1
USER=$2 

echo "##    Target profile: " $TARGET_PROFILE
echo "##    Target user: " $USER

REPOS_SRC_DIR="../src/server" 
REPOS_EXT_DIR="../src/ext" 

DIST_BASE_DIR=$TARGET_BASE/$TARGET_PROFILE
DIST_SRC_DIR=$DIST_BASE_DIR/server
DIST_BIN_DIR=$DIST_BASE_DIR/bin
BASE_DIR=$(pwd)
echo "Base dir = " $BASE_DIR

# the services and modules have to have same sequence order. 
SERVER_MODULES=('auth' 'fs' 'app' 'proxy' 'notify' 'build' 'build-jm')
SERVICE_NAMES=('webida-auth' 'webida-fs' 'webida' 'webida-proxy' 'webida-ntf' 'webida-build' 'webida-build-jm')
SERVER_COUNT=${#SERVER_MODULES[@]}


echo "Let's synchronize with remote server"

TARGET_BASE_DIR=/home/$USER/webida-server
TARGET_PROFILE_DIR=$TARGET_BASE_DIR/$TARGET_PROFILE


exe mkdir -p $TARGET_BASE_DIR
exe sudo rm -rf $TARGET_PROFILE_DIR


echo "########################################################" 
echo "########### copy modules to remote host    #############" 
echo "###########                                #############" 
echo "########################################################" 


# Let's sync from dist to target in real. 
exe rsync -avrzhe --exclude-from 'exclude.list' $DIST_BASE_DIR $TARGET_BASE_DIR 


# copy upstart script to /etc/init
exe sudo cp -r $TARGET_PROFILE_DIR/etc/init/* /etc/init



function create_var_dir {
    # create webida directories and change owner of directories

    # prepare storage for app and user file system
    sudo mkdir -p /var/webida/apps
    sudo mkdir -p /var/webida/fs
    sudo mkdir -p /var/webida/log

    #cp /routingTable.json /var/webida/routingTable.json

    # change owner of above directories and files to webida user and group

    sudo chown -R $USER:$USER /var/webida
}


create_var_dir

function unpac {
    cd $1    
    echo "current dir : " $PWD
    exe2 sudo pac install 
    exe2 npm rebuild
}

# unpac servers
unpac $TARGET_PROFILE_DIR/server/

mkdir -p $TARGET_PROFILE_DIR/server/notify-server/log

# check exist upstart script for servers


#unpac system apps
function unpac_sysapps {
    local SYSAPP_DIR=$TARGET_PROFILE_DIR/server/server/systemapps
    for f in `ls $SYSAPP_DIR`; do
        echo "File -> $f"
        local APPDIR=$SYSAPP_DIR/$f
        echo "unpac..ing $APPDIR"
        exe unpac $APPDIR
    done
}

#$chown -R webida:webida $TARGET_PROFILE_DIR

unpac_sysapps

function setup_server {
    # setup auth server
    exe cd $TARGET_PROFILE_DIR/server/auth
    sudo npm run-script install-server

    # setup rootfs for lxc. This assume that lxc is previousely installed.
    exe cd $TARGET_PROFILE_DIR/server/fs/lxc
    exe tar zxf rootfs.tar.gz
    exe2 mkdir -p $TARGET_PROFILE_DIR/server/fs/fs
    exe2 sudo chown -R $USER:$USER $TARGET_PROFILE_DIR/server/fs/fs


    # setup system apps
    exe cd $TARGET_PROFILE_DIR/server/server
    exe sudo node install-offline.js
    exe2 mv $TARGET_PROFILE_DIR/server/server/apps/app-uip $TARGET_PROFILE_DIR/server/server/apps/tmp
    exe2 cp -rf $TARGET_PROFILE_DIR/server/server/apps/tmp/src $TARGET_PROFILE_DIR/server/server/apps/app-uip
}

#setup_server

sudo chown -R $USER:$USER $TARGET_PROFILE_DIR

echo "########################################################" 
echo "###########   restart services in remote   #############" 
echo "###########                                #############" 
echo "########################################################" 

# Stop services
exe sudo $TARGET_PROFILE_DIR/bin/stop-all.sh


# Start services
exe sudo $TARGET_PROFILE_DIR/bin/start-all.sh


containsElement () {
  local e
  for e in "${@:2}"; do [[ "$e" == "$1" ]] && return 0; done
  return 1
}

getIndex() {
    local TMPMOD="${1}"
    shift
    local TMPARRAY=("${@}")
    index=0; while ((index<${#TMPARRAY[*]})); do
        if [ "${TMPARRAY[$index]}" = "$TMPMOD" ]; then
            echo $index; return
        fi
    ((index++)); done
    echo 'Not Found'; return 1
}


function restart_services {
    for (( i=0;i<$SERVER_COUNT;i++)); do
        local MOD=${SERVER_MODULES[${i}]} 
        echo "get index with $MOD ...."

        local index=$(getIndex "${MOD}" "${SERVER_MODULES[@]}")
        echo "$MOD\'s index is $index ."
        echo "$MOD\'s service name is \" ${SERVICE_NAMES[${index}]} \""
        local SERVICE_NAME=${SERVICE_NAMES[${index}]}

        exe2 sudo stop $SERVICE_NAME
        exe2 sudo start $SERVICE_NAME
    done 
}


#restart_services


echo successful distribution to target server

