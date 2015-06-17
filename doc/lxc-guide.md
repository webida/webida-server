# LXC guide

## Create Container for Webida-server

### Modify LXC Network configurations

For expanding ip address range assigned to each `lxc-execute`s, it should be required.

Modify /etc/init/lxc-net.conf file:

    env USE_LXC_BRIDGE="true"
    env LXC_BRIDGE="lxcbr0"
    env LXC_ADDR="10.0.0.1"
    env LXC_NETMASK="255.0.0.0"
    env LXC_NETWORK="10.0.0.0/8"
    env LXC_DHCP_RANGE="10.0.0.1,10.255.255.254"
    env LXC_DHCP_MAX="16000000"

And also modify /etc/default/lxc-net file:

    LXC_BRIDGE="lxcbr0"
    LXC_ADDR="10.0.0.1"
    LXC_NETMASK="255.0.0.0"
    LXC_NETWORK="10.0.0.0/8"
    LXC_DHCP_RANGE="10.0.0.2,10.255.255.254"
    LXC_DHCP_MAX="16000000"

And restart lxc services:

    $ stop lxc
    $ restart lxc-net
    $ start lxc

### Create Container

    $ mkdir lxc
    $ sudo lxc-create -P ./lxc -t download -n webida -- -d ubuntu -r trusty -a amd64

### Install Required Packages

#### Run container

```
$ sudo lxc-start -n webida -f ./lxc/webida/config
```
#### Open another terminal and attach webida container

```
$ sudo lxc-attach -n webida
```

#### make user

```
root@webida:/# adduser webida --uid 1002
# password: webida
```

#### install

```
root@webida:/# apt-get install git git-svn lxc openjdk-7-jdk
root@webida:/# mkdir /fs
```

#### create git.sh

```
root@webida:/# vi /usr/bin/git.sh
root@webida:/# chmod +x /usr/bin/git.sh
```

git.sh
```
#/bin/bash
AUTH_ID=''
AUTH_PASS=''
ARGS=( )
#SSH_KEY=$HOME/.userinfo/id_rsa
#UNIQ_KEY=`uuid`
#TMP_SSH=/tmp/.git_ssh.$UNIQ_KEY

for args in "$@"
do
        if [[ "$args" = --authuser* ]] ;then
                AUTH_ID=`echo "$args" | cut -d'=' -f2`
        elif [[ "$args" = --authpass* ]] ;then
                AUTH_PASS=`echo "$args" | cut -d'=' -f2`
        else
                ARGS=("${ARGS[@]}" "$args")
        fi
done

#if [ -f $SSH_KEY ]; then
#    echo "ssh -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i $SSH_KEY \$@" > $TMP_SSH
#    chmod +x $TMP_SSH
#    export GIT_SSH=$TMP_SSH
#fi

#git Run the git command
if [ ! -z $AUTH_ID ] ;then
#expect -d <<EOF
expect <<EOF
set timeout -1
spawn -noecho git --no-pager ${ARGS[@]}
expect {
        "*sername" {
                send "$AUTH_ID\r"
                exp_continue
        }
        "*assword" {
                send "$AUTH_PASS\r"
                expect eof
        }
        busy {
                exp_continue
        }
}
EOF
else
        git --no-pager "${ARGS[@]}"
fi

#if [ $? -ne 0 ]; then
#    echo "Note: If using SSH protocol, you need to verify the private key(id_rsa) in the following location."
#    echo " > \$HOME/.userinfo/id_rsa"
#fi

```

#### stop container

```
root@webida:/# exit
$ sudo lxc-stop -n webida
```

### Move container to the webida fs server

```
$ mv ./lxc/webida/config ./lxc/webida/webida.conf
$ sudo cp -R ./lxc/webida/rootfs <source dir>/src/server/fs/lxc/webida/
$ sudo cp ./lxc/webida/webida.conf <source dir>/src/server/fs/lxc/webida/
$ vi ~/webida-server/src/server/fs/lxc/webida/webida.conf

# modify webida.conf
...
lxc.rootfs = /home/webida/webida-server/src/server/fs/lxc/webida/rootfs
...
```