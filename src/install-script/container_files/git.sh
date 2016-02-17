#! /bin/bash
AUTH_ID=''
AUTH_PASS=''
ARGS=( )
#SSH_KEY=$HOME/.profile/id_rsa
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
#    echo " > \$HOME/.profile/id_rsa"
#fi

# remove temporary file on exit
#trap "rm -f $TMP_SSH" 0
