#!/bin/bash

SSH_KEY=$HOME/.userinfo/id_rsa
TMP_SSH=`mktemp`

if [ -f $SSH_KEY ]; then
    echo "ssh -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i $SSH_KEY \$@" > $TMP_SSH
    chmod +x $TMP_SSH
    export GIT_SSH=$TMP_SSH
fi

#git Run the git command
git --no-pager "$@"

# remove temporary file on exit
trap "rm -f $TMP_SSH" 0
