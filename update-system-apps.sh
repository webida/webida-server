#!/bin/bash

exe() {
    echo "\$ $@" ; "$@" ; 
    if [ $? -ne 0 ]; then
        echo "$@ failed with exit code $?"
        exit 0
    fi
}

BASE_DIR=$(pwd)
SYSAPP_DIR="src/server/app/systemapps"
WEBIDA_USER="webida"
if [ `whoami` != $WEBIDA_USER ]; then
    echo "Run $0 as webida user : sudo -u webida $0"
    exit 1
fi

exe git submodule update --init --recursive
exe git submodule foreach git pull origin master

let count=0

for f in `ls $SYSAPP_DIR`; do
    echo "File -> $f"
    APPDIR=$BASE_DIR/$SYSAPP_DIR/$f
    echo $APPDIR
    exe cd $APPDIR
    echo $PWD 
    exe rm -rf .modules
    if test -e 'project.json'; then
        exe npm install
        exe npm update
        exe pac
    fi
    echo "count = $count"
    ((count++))
done

echo "Totally $count of submodules are updated."
echo "The Module files for system apps are successfully updated using npm install and update."
