FROM ubuntu:14.04.3
#FROM phusion/baseimage:latest

MAINTAINER gseok.seo@gamil.com

ADD ./container_files/* /tmp/

RUN  /tmp/proxy_env.sh

RUN echo TERM="xterm" >> /etc/environment

RUN locale-gen en_US.UTF-8 && \
    echo LANG="en_US.UTF-8" >> /etc/default/locale

RUN apt-get update

RUN apt-get install -y git git-svn wget zip uuid xmlsec1 curl

RUN chmod 0666 /dev/null

ADD ./container_files/git.sh /usr/bin/git.sh

RUN useradd -u 1002 -d /fs -m webida -p webida -s /bin/bash

RUN echo webida ALL = \(ALL\) NOPASSWD: ALL > /etc/sudoers.d/webida && \
    chmod 440 /etc/sudoers.d/webida

RUN wget http://nodejs.org/dist/v4.2.2/node-v4.2.2-linux-x64.tar.gz && \
    tar zxvf node-v4.2.2-linux-x64.tar.gz && \
    cd node-v4.2.2-linux-x64 && \
    cp -r * /usr/local/ && \
    cd .. && \
    rm -rf node*

RUN npm install -g grunt-cli bower

