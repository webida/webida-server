CURRENTDIR = $(PWD)
LOGPATH = $(CURRENTDIR)/test/log
OUTPUT_DIR = $(CURRENTDIR)/test/out
NODEUNIT = $(CURRENTDIR)/node_modules/nodeunit/bin/nodeunit
export WEBIDA_DIR=$(CURRENTDIR)

all: test

make-logdir:
	mkdir -p $(LOGPATH)


build-test: make-logdir
	WEBIDA_DIR=`pwd` $(NODEUNIT) test/test-build.js | tee $(LOGPATH)/`date +%Y%m%d.%H%M%S`.log
	#$(NODEUNIT) --reporter nodeunit/lib/reporters/junit --output $(OUTPUT_DIR) test | tee $(LOGPATH)/`date +%Y%m%d.%H%M%S`.log



clean: 

test: build-test

.PHONY: test all
