CURRENTDIR = $(PWD)
LOGPATH = $(CURRENTDIR)/test/log
NODEUNIT = $(CURRENTDIR)/node_modules/nodeunit/bin/nodeunit
export WEBIDA_DIR=$(CURRENTDIR)

all: test

test:
	mkdir -p $(LOGPATH)
	$(NODEUNIT) test | tee $(LOGPATH)/`date +%Y%m%d.%H%M%S`.log

.PHONY: test all
