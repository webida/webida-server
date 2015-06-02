# LXC guide

## Create Container for Webida-server

### Create Container

```
$ mkdir lxc
$ sudo lxc-create -P ./lxc -t download -n webida -- -d ubuntu -r trusty -a amd64
```

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
root@webida:/# apt-get install git git-svn lxc
root@webida:/# mkdir /usr/lib/x86_64-linux-gnu/lxc/fs
```

#### create git.sh

```
root@webida:/# chmod 0666 /dev/null
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
$ sudo cp -R ./lxc/* ~/webida-server/src/server/fs/lxc/
$ vi ~/webida-server/src/server/fs/lxc/webida/webida.conf

# modify webida.conf
...
lxc.rootfs = /home/webida/webida-server/src/server/fs/lxc/webida/rootfs
...
```