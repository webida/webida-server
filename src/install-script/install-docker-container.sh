#! /bin/bash -e

PROPERTIES_FILE_NAME=${1:-/tmp/env.json}
PROXY_VALUE=none
DEPLOY_PATH=/home/webida
#./install.js -f /tmp/install.json -p none -d /var/webida -n ******

check_user(){
    echo "********* check user"
    if [ "$(whoami)" != "root" ]
    then
      echo "script must be executed as root!"
      exit 1
    fi
}

set_property_from_parameter() {
    echo "********* set_property_from_parameter"
    optspec="fpdn"
    while getopts "$optspec" optchar; do
        val="${!OPTIND}"; OPTIND=$(( $OPTIND + 1 ))
        case "${optchar}" in
            f) PROPERTIES_FILE_NAME=${val};;
            p) PROXY_VALUE=${val};;
            d) DEPLOY_PATH=${val};;
            *)
                if [ "$OPTERR" != 1 ] || [ "${optspec:0:1}" = ":" ]; then
                    echo "Non-option argument: '-${OPTARG}'" >&2
                fi
                ;;
        esac
    done
}

set_proxy_value(){
    echo "********* set_proxy_value_of_host_to_docker_script"
    if [ $PROXY_VALUE != "none" ]
    then
        sed -i "s/PROXY_VALUE=none/PROXY_VALUE=$PROXY_VALUE/g" ./container_files/proxy_env.sh
        sed -i "s/PROXY_VALUE/$PROXY_VALUE/g" ./Dockerfile
    else
        sed -i "/PROXY_VALUE/d" ./Dockerfile
    fi
}

make_docker_container(){
    echo "********* make_docker_container"
    docker build --tag webida:latest .
}


check_user
set_property_from_parameter "$@"
set_proxy_value
make_docker_container

echo "END_INSTALL_SCRIPT"
exit 0
