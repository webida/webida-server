#!/bin/bash


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


BASE_DIR=$(pwd)
SYSAPP_DIR="src/server/app/systemapps"



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
    exe npm install
    exe npm update
    exe pac
    echo "count = $count"
    ((count++))
done

echo "Totally $count of submodules are updated."
echo "The Module files for system apps are successfully updated using npm install and update."
