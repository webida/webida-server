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
USER=$3 

echo "##    Target host: " $TARGET_HOST
echo "##    Target profile: " $TARGET_PROFILE
echo "##    Target user: " $USER

REPOS_SRC_DIR="../src/server" 
REPOS_EXT_DIR="../src/ext" 

DIST_BASE_DIR=$TARGET_BASE/$TARGET_HOST/$TARGET_PROFILE
DIST_SRC_DIR=$DIST_BASE_DIR/server
DIST_BIN_DIR=$DIST_BASE_DIR/bin
BASE_DIR=$(pwd)
echo "Base dir = " $BASE_DIR

# the ordering of services and modules have to have same sequence. 
#SERVER_MODULES=('server-auth' 'server-fs' 'server' 'server-proxy' 'notify-server' 'build-server' 'build-jm-server')
SERVER_MODULES=('server-auth' 'server-fs' 'server' 'server-proxy' 'notify-server' 'build-server' 'build-jm-server')
SERVICE_NAMES=('webida-auth' 'webida-fs' 'webida' 'webida-proxy' 'webida-ntf' 'webida-build' 'webida-build-jm')
SERVER_COUNT=${#SERVER_MODULES[@]}


echo "Let's synchronize with remote server"

TARGET_BASE_DIR=/home/$USER/webida-server
TARGET_PROFILE_DIR=$TARGET_BASE_DIR/$TARGET_PROFILE


exe ssh $USER@$TARGET_HOST "mkdir -p $TARGET_BASE_DIR"


echo "########################################################" 
echo "########### check module diff with remote  #############" 
echo "###########                                #############" 
echo "########################################################" 

# First, check diff between two directories
exe rsync -rvnc -e ssh $DIST_BASE_DIR $USER@$TARGET_HOST:$TARGET_BASE_DIR > diff.list


UPDATED_MODULES=()
function check_server_diff {
    for (( i=0;i<$SERVER_COUNT;i++)); do
        echo "...checking ${SERVER_MODULES[${i}]} module"
        local MOD=${SERVER_MODULES[${i}]} 
        local KEYWORD="server\/$MOD"
        echo "..finding $KEYWORD keyword...."

        #local COUNT=$(awk '/'"$KEYWORD"'/ {count++} END { print count }' diff.list)
        local COUNT=$(awk '/'"$KEYWORD"'/ && !/'"skipping non-regular file"'/ {count++} END { print count }' diff.list)
        if [[ $COUNT -gt 0 ]]
        then
            echo "found $COUNT changed entries"
            UPDATED_MODULES=(${UPDATED_MODULES[@]} $MOD)
        else
            echo "Nothing was changed in $MOD"
        fi
        echo -e "-------------\n\n\n"
    done 
}

check_server_diff

echo "The updated modules are \" ${UPDATED_MODULES[@]}\""

UPDATED_COUNT=${#UPDATED_MODULES[@]}

# Let's sync in real. 
exe rsync -avrzh -exclude-from 'exclude.list' -e ssh $DIST_BASE_DIR $USER@$TARGET_HOST:$TARGET_BASE_DIR 

# check exist upstart script for servers

echo "########################################################" 
echo "###########   restart services in remote   #############" 
echo "###########                                #############" 
echo "########################################################" 

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
    for (( i=0;i<$UPDATED_COUNT;i++)); do
        local MOD=${UPDATED_MODULES[${i}]} 
        echo "get index with $MOD ...."

        local index=$(getIndex "${MOD}" "${SERVER_MODULES[@]}")
        echo "$MOD\'s index is $index ."
        echo "$MOD\'s service name is \" ${SERVICE_NAMES[${index}]} \""
        local SERVICE_NAME=${SERVICE_NAMES[${index}]}

        exe2 ssh -t $USER@$TARGET_HOST "sudo stop $SERVICE_NAME"
        exe2 ssh -t $USER@$TARGET_HOST "sudo start $SERVICE_NAME"
    done 
}


#restart_services


echo successful distribution to target server

