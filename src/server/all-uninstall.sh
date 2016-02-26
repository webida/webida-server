#!/bin/bash -e

app_uninstall() {
    echo "******** app-uninstall.js"
    node app-uninstall.js
}

fs_uninstall() {
    echo "******** fs-uninstall.js"
    node fs-uninstall.js
}

auth_uninstall() {
    echo "******** auth-uninstall.js"
    node auth-uninstall.js
}

app_uninstall
fs_uninstall
auth_uninstall

echo "END server dependency all uninstall script complete"
exit 0
