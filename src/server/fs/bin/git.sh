#!/bin/bash

SSH_KEY=$HOME/.profile/id_rsa
UNIQ_KEY=`uuid`
TMP_SSH=/tmp/.git_ssh.$UNIQ_KEY

if [ -f $SSH_KEY ]; then
    echo "ssh -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i $SSH_KEY \$@" > $TMP_SSH
    chmod +x $TMP_SSH
    export GIT_SSH=$TMP_SSH
fi

#git Run the git command
git --no-pager "$@"

#if [ $? -ne 0 ]; then
#    echo "Note: If using SSH protocol, you need to verify the private key(id_rsa) in the following location."
#    echo " > \$HOME/.profile/id_rsa"
#fi

# remove temporary file on exit
trap "rm -f $TMP_SSH" 0

