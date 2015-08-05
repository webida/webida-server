#!/bin/bash

# Manipulate XFS projects conf
# Author: Wooyoung Cho <wooyoung1.cho@samsung.com>

PROJECTS_FILE=/etc/projects
PROJID_FILE=/etc/projid
#PROJECTS_FILE=./projects
#PROJID_FILE=./projid
FD1=8
FD2=9
TIMEOUT=1

case "$1" in
    add)
        WFSPATH=$2
        FSID=$3
        PROJID=$4
        (
            flock -w $TIMEOUT $FD1 || exit 1;
            (
                flock -w $TIMEOUT $FD2 || exit 2;
                echo "$PROJID:$WFSPATH" >> $PROJECTS_FILE || exit 3;
                echo "$FSID:$PROJID" >> $PROJID_FILE || exit 3;
            ) 9<>$PROJID_FILE || exit $?
        ) 8<>$PROJECTS_FILE || exit $?
        ;;
    remove)
        FSID=$2;
        (
            flock -w $TIMEOUT $FD1 || exit 1;
            (
                flock -w $TIMEOUT $FD2 || exit 2;
                TMPFILE=`mktemp`;
                PROJID=$(sed -n "{s/^$FSID:\(.*\)/\1/p}" $PROJID_FILE);
                sed "{/^$PROJID:/d}" $PROJECTS_FILE > $TMPFILE || exit 3;
                cat $TMPFILE > $PROJECTS_FILE || exit 3;
                sed "{/$FSID/d}" $PROJID_FILE > $TMPFILE || exit 3;
                cat $TMPFILE > $PROJID_FILE || exit 3;
                rm $TMPFILE;
            ) 9<>$PROJID_FILE || exit $?
        ) 8<>$PROJECTS_FILE || exit $?
        ;;
    *)
        echo "Usage: $0 add <wfspath> <fsid> <projid>"
        echo "       $0 remove <fsid>"
        ;;
esac

exit 0
