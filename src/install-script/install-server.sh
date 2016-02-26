#! /bin/bash -ex

PROPERTIES_FILE_NAME=${1:-/tmp/env.json}
TARGET=host
MYSQL_SERVER=localhost
WEBIDA_USER=webida
DEPLOY_PATH=/home/webida
XFS_DEV=/dev/sda3
XFS_DEV_SIZE=10240000 # 5GB
NODE_DOWNLOAD_PATH=http://nodejs.org/dist/v4.2.2/node-v4.2.2-linux-x64.tar.gz
PROXY_VALUE=none
HTTPS_PROXY_VALUE=none
HOST_DNS_ADDRESS=none
INSTALL_SCRIPT_PATH=$(dirname $0)
# host: ./install.sh -v host -m localhost -u webida -d /var/webida -x /dev/sda3 -n https://nodejs.org/dist/v4.2.1/node-v4.2.1-linux-x64.tar.gz -p none
# docker: ./install.sh -v docker -m none -u webida -d /var/webida -x /dev/sda3 -s 20480000 -n https://nodejs.org/dist/v4.2.1/node-v4.2.1-linux-x64.tar.gz -p none

check_user(){
    echo "********* check user"
    if [ "$(whoami)" != "root" ]
    then
      echo "script must be executed as root!"
      exit 1
    fi
}

get_property_value(){
    PROPERTY_NAME=$1
    while IFS=":" read -r key value; do
        printf -v key '%s' $key
        case "$key" in
            "\"${PROPERTY_NAME}\"") echo $value | sed "s/\"//g" | sed "s/,//g";;
        esac
    done < "$PROPERTIES_FILE_NAME"
}

set_property_from_file(){
    if [ -f "$PROPERTIES_FILE_NAME" ]
    then
        TARGET=$(get_property_value target)
        MYSQL_SERVER=$(get_property_value mysqlServer)
        WEBIDA_USER=$(get_property_value webidaUser)
        DEPLOY_PATH=$(get_property_value deployPath)
        XFS_DEV=$(get_property_value xfsDeviceName)
        XFS_DEV_SIZE=$(get_property_value xfsDeviceSize)
        NODE_DOWNLOAD_PATH=$(get_property_value nodeDownloadPath)
        PROXY_VALUE=$(get_property_value proxyValue)
        HTTPS_PROXY_VALUE=$(get_property_value httpsProxyValue)
        HOST_DNS_ADDRESS=$(get_property_value dns)
    fi
}

set_property_from_parameter(){
    optspec="fvmudxsnpah"
    while getopts "$optspec" optchar; do
        val="${!OPTIND}"; OPTIND=$(( $OPTIND + 1 ))
        case "${optchar}" in
            f) PROPERTIES_FILE_NAME=${val};;
            v) TARGET=${val};;
            m) MYSQL_SERVER=${val};;
            u) WEBIDA_USER=${val};;
            d) DEPLOY_PATH=${val};;
            x) XFS_DEV=${val};;
            s) XFS_DEV_SIZE=${val};;
            n) NODE_DOWNLOAD_PATH=${val};;
            p) PROXY_VALUE=${val};;
            h) HTTPS_PROXY_VALUE=${val};;
            a) HOST_DNS_ADDRESS=${val};;
            *)
                if [ "$OPTERR" != 1 ] || [ "${optspec:0:1}" = ":" ]; then
                    echo "Non-option argument: '-${OPTARG}'" >&2
                fi
                ;;
        esac
    done
}

check_property(){
        if [ "$TARGET" = "" ]
        then
            echo "script must be input the target, -t"
            exit 1
        fi
        if [ "$MYSQL_SERVER" = "" ]
        then
            echo "script must be input the mysql server ip, -m"
            exit 1

        fi
        if [ "$WEBIDA_USER" = "" ]
        then
            echo "script must be input the user name, -u"
            exit 1
        fi
        if [ "$DEPLOY_PATH" = "" ]
        then
            echo "script must be input deploy path, -d"
            exit 1
        fi
        if [ "$XFS_DEV" = "" ]
        then
            echo "script must be input the xfs device , -x"
            exit 1
        fi
        if [ "$NODE_DOWNLOAD_PATH" = "" ]
        then
            echo "script must be input the node download path, -n"
            exit 1
        fi
}

install_log_files() {
    echo "********* install log files"
    cp $INSTALL_SCRIPT_PATH/rsyslog-configs/* /etc/rsyslog.d/.
    service rsyslog restart
}

install_ubuntu_packages(){
    echo "********* install ubuntu packages"
    apt-get update
    apt-get install -y expect wget make gcc g++ libattr1-dev git git-svn redis-server
    # openjdk-7-jdk
}

install_nodejs(){
    echo "********* install nodejs"
    if [ $NODE_DOWNLOAD_PATH != "none" ]
    then
        wget $NODE_DOWNLOAD_PATH
        NODE_FILE_NAME=$(basename $NODE_DOWNLOAD_PATH)
        tar -zxvf $NODE_FILE_NAME
        NODE_NAME=${NODE_FILE_NAME%.tar.gz}
        cd ./$NODE_NAME
        cp -r * /usr/local/
        if [ $PROXY_VALUE != "none" ]
        then
            npm config --global set proxy http://$PROXY_VALUE
            if [ $HTTPS_PROXY_VALUE = "none" ]
            then
                npm config --global set https-proxy http://$PROXY_VALUE
            else
                npm config --global set https-proxy https://$PROXY_VALUE
            fi
        fi
        cd ../
        rm -rf $NODE_NAME*
    fi
}

install_npm_module(){
    echo "********* install npm moule"
    npm install -g grunt-cli bower pac forever node-pre-gyp
}

create_webida_user(){
    echo "********* create webida user"
    ret=true
    getent passwd $WEBIDA_USER >/dev/null 2>&1 && ret=false
    if $ret;
    then
        useradd -d /home/$WEBIDA_USER -m $WEBIDA_USER -p $WEBIDA_USER -u 1002 -s /bin/bash
    fi
}

install_mysql(){
    echo "********* setup mysql 1"
    echo "mysql-server mysql-server/root_password password root" | debconf-set-selections
    echo "mysql-server mysql-server/root_password_again password root" | debconf-set-selections
    apt-get -y install mysql-server mysql-client
    if [ $TARGET != "host" ]
    then
        /usr/bin/mysqld_safe &
        sleep 5
    fi
}

setting_mysql(){
    ret=true
    mysql -u$WEBIDA_USER -p$WEBIDA_USER -e exit >/dev/null 2>&1 && ret=false
    if $ret;
    then
        mysqladmin -u root create $WEBIDA_USER -proot
        expect << EOD
        set timeout -1
        spawn mysql -u root -proot $WEBIDA_USER
        expect "mysql>"
        send "GRANT ALL PRIVILEGES ON $WEBIDA_USER.* TO $WEBIDA_USER@localhost IDENTIFIED BY '$WEBIDA_USER' WITH GRANT OPTION;\r"
        expect "mysql>"
        send "SET character_set_client = utf8;\r"
        expect "mysql>"
        send "SET character_set_results = utf8;\r"
        expect "mysql>"
        send "SET character_set_connection = utf8;\r"
        expect "mysql>"
        send "exit\r"
        expect eof
EOD
    fi

}

install_docker_to_host(){
    echo "********* install_docker_to_host"
	# install docker latest version
    wget -qO- https://get.docker.com/ | sudo -E sh
	
    # install docker-engin_1.9.1
    #wget http://apt.dockerproject.org/repo/pool/main/d/docker-engine/docker-engine_1.9.1-0~trusty_amd64.deb
    #dpkg -i docker-engine_1.9.1-0~trusty_amd64.deb
}

configuration_docker_daemon(){
    if [ $HOST_DNS_ADDRESS != "none" ]
    then
        echo "DOCKER_OPTS=\"--dns $HOST_DNS_ADDRESS -g $DEPLOY_PATH/docker\"" >> /etc/default/docker 
    else
        echo "DOCKER_OPTS=\"-g $DEPLOY_PATH/docker\"" >> /etc/default/docker
    fi

    if [ $PROXY_VALUE != "none" ]
    then
        echo "export http_proxy=\"http://$PROXY_VALUE\"" >> /etc/default/docker
        if [ $HTTPS_PROXY_VALUE = "none" ]
        then
            echo "export https_proxy=\"http://$PROXY_VALUE\"" >> /etc/default/docker
        else
            echo "export https_proxy=\"https://$PROXY_VALUE\"" >> /etc/default/docker
        fi
    fi
    service docker restart
    chown $WEBIDA_USER:$WEBIDA_USER $DEPLOY_PATH/docker
}

create_deploy_path(){
    echo "********* set deploy path, apps, fs, build"
    mkdir -p $DEPLOY_PATH/apps
    mkdir -p $DEPLOY_PATH/build
    mkdir -p $DEPLOY_PATH/fs
    mkdir -p $DEPLOY_PATH/docker
    chown -R webida:webida $DEPLOY_PATH
}

set_sudoers(){
    echo "********* set sudoers"
    if [ -f "/etc/sudoers.d/webida" ]
    then
        echo "sudoers file exists"
    else
        echo "Cmnd_Alias INSTALL = /usr/bin/install -o ${WEBIDA_USER} -g ${WEBIDA_USER} -d ${DEPLOY_PATH}/docker/aufs/diff/*/fs" >>  /etc/sudoers.d/webida
        CMDS="/usr/bin/docker, /usr/sbin/xfs_quota, /usr/bin/rsync, /bin/kill, "
        echo "${WEBIDA_USER} ALL = (root) NOPASSWD:${CMDS} INSTALL" >> /etc/sudoers.d/webida
        usermod -aG docker webida
    fi
}


set_xfs_storage(){
    echo "********* set xfs storage"
    apt-get install -y xfsprogs

    if [ $XFS_DEV_SIZE != "none" ]
    then
        XFS_DEV=$DEPLOY_PATH/webida-fs-device
        dd if=/dev/zero of=$XFS_DEV count=$XFS_DEV_SIZE
    fi

    set +e
    IS_SET_XFS=$(blkid | grep xfs | grep -c $XFS_DEV)
    set -e
    if [ "$IS_SET_XFS" -eq 0 ]
    then
        mkfs.xfs $XFS_DEV
    fi

    set +e
    IS_MOUNT=$(mount | grep $XFS_DEV | grep -c $DEPLOY_PATH/fs)
    set -e
    if [ "$IS_MOUNT" -eq 0 ]
    then
        mount -o pquota $XFS_DEV $DEPLOY_PATH/fs
        chown webida:webida $DEPLOY_PATH/fs
    fi

    touch /etc/projects /etc/projid
    chgrp webida /etc/projects /etc/projid
    chmod 664 /etc/projects
    chmod 664 /etc/projid
}

set_uuid_of_xfs_device(){
    FSTAB_PATH=/etc/fstab
    XFS_MOUNT_PATH=$DEPLOY_PATH/fs
    set +e
    ALREADY_SET=$(grep -c $XFS_MOUNT_PATH $FSTAB_PATH)
    set -e
    if [ "$ALREADY_SET" -eq 0 ]
    then
        UUID=$(blkid $XFS_DEV -o value -s UUID)
        echo "UUID=$UUID $XFS_MOUNT_PATH  xfs defaults,pquota  0    1" >> $FSTAB_PATH
    fi
}

install_docker_container(){
    source $INSTALL_SCRIPT_PATH/install-docker-container.sh
}


check_user
set_property_from_file
set_property_from_parameter "$@" 
check_property
install_log_files
install_ubuntu_packages
install_nodejs
install_npm_module
create_webida_user
install_mysql
setting_mysql
install_docker_to_host
create_deploy_path
set_sudoers
## if you want to xfs then using xfs script
## default is no using xfs file system
## default file system don't support of quota information
#set_xfs_storage
#set_uuid_of_xfs_device
configuration_docker_daemon

install_docker_container

echo "success webida-server-base-image"
exit 0

