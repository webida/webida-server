#/bin/bash

#set -x

check_upstart_service() {
    status $1 | grep -q "^$1 start" > /dev/null
    return $?
}


check_and_start() {
    if check_upstart_service $1; then
        echo "----- $1 is running, stopping.."
        sudo stop $1
        echo "----- $1 is stopped, and restarting.."
        sudo start $1
        echo "----- $1, started"
    else
        echo "----- starting.. $1"
        sudo start $1
        echo "----- started $1"
    fi
}

check_and_start webida-auth
check_and_start webida-build-jm
check_and_start webida-build
check_and_start webida-ntf
check_and_start webida-conn
check_and_start webida-cors-proxy
check_and_start webida-debug
check_and_start webida-fs
check_and_start webida
check_and_start webida-proxy


