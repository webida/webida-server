#!/bin/bash -e

npm_install() {
    echo "******** npm module install"
    npm install
}

auth_install() {
    echo "******** auth-install.js"
    node auth-install.js
}

fs_install() {
    echo "******** fs-install.js"
    node fs-install.js
}

app_install() {
    echo "******** app-install.js"
    node app-install.js
}

npm_install
auth_install
fs_install
app_install


echo "END server dependency all install script complete"
echo "-------------------------------------------------"
echo "Now you can simply run all server"
echo "    $ sudo -u webida node unit-manager.js"
echo ""
echo "And you can simply test webida on your browser"
echo "(your-address is defined in conf.js's domain)"
echo "    http://your-address:5001"
echo "-------------------------------------------------"
exit 0
