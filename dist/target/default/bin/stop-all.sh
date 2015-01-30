#/bin/bash

check_upstart_service() {
    status $1 | grep -q "^$1 start" > /dev/null
    return $?
}


check_and_stop() {
    if check_upstart_service $1; then
        echo "--- running $1, stopping.."
        sudo stop $1
        echo "--- stopped $1.."
    else
        echo "--- stopped $1"
    fi
}


check_and_stop webida-proxy
check_and_stop webida-auth
check_and_stop webida-build-jm
check_and_stop webida-build
check_and_stop webida-conn
check_and_stop webida-cors-proxy
check_and_stop webida-debug
check_and_stop webida-fs
check_and_stop webida-ntf
check_and_stop webida


