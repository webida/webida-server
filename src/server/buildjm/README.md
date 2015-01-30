buildjm
=========

build job manager

### Requirements
* Linux
* adk
    * Android development kit is required.
* jdk 1.7 or later
    * ADK requires java.

### Installation

### Run
* `unit-manager svc=buildjm0

### Test

### Development

### Source Structure
    lib/
        build-common.js
        build-job-manager.js
        build.js
        debugmode-handler.js
        emul.js
    test/                       Unit tests
    buildjm.js                  Entry point of build job manager
    Makefile                    Unit test driver
    package.json                Package description
    README.md                   This file

