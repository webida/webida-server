#! /bin/bash -e

PROXY_VALUE=none

check_user(){
    if [ "$(whoami)" != "root" ]
    then
        echo "script must be executed as root"
        exit 1
    fi
}

set_proxy(){
    if [ $PROXY_VALUE != "none" ]
    then
        echo http_proxy=\"http\:\/\/$PROXY_VALUE\" >> /etc/environment
        echo https_proxy=\"https\:\/\/$PROXY_VALUE\" >> /etc/environment
        echo ftp_proxy=\"ftp\:\/\/$PROXY_VALUE\" >> /etc/environment
        echo socks_proxy=\"socks\:\/\/$PROXY_VALUE\" >> /etc/environment
        echo Acquire::http::proxy \"http\:\/\/$PROXY_VALUE\"\; >> /etc/apt/apt.conf
        echo Acquire::https::proxy \"https\:\/\/$PROXY_VALUE\"\; >> /etc/apt/apt.conf
        echo Acquire::ftp::proxy \"ftp\:\/\/$PROXY_VALUE\"\; >> /etc/apt/apt.conf
        echo Acquire::socks::proxy \"socks\:\/\/$PROXY_VALUE\"\; >> /etc/apt/apt.conf
    fi
}
set_proxy
