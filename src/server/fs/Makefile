CURRENTDIR = $(PWD)
LOGPATH = $(CURRENTDIR)/test/log
BTRFS_IMG_PATH = $(CURRENTDIR)/test/btrfs.img
BTRFS_PATH = $(CURRENTDIR)/test/btrfs
XFS_IMG_PATH = $(CURRENTDIR)/test/xfs.img
XFS_PATH = $(CURRENTDIR)/test/xfs
OUTPUT_DIR = $(CURRENTDIR)/test/out
NODEUNIT = $(CURRENTDIR)/node_modules/nodeunit/bin/nodeunit
export WEBIDA_DIR=$(CURRENTDIR)

all: test

make-logdir:
	mkdir -p $(LOGPATH)

make-xfs:
	dd if=/dev/zero of=$(XFS_IMG_PATH) bs=1M count=100
	mkfs.xfs $(XFS_IMG_PATH)
	mkdir -p $(XFS_PATH)
	sudo mount -o loop,pquota $(XFS_IMG_PATH) $(XFS_PATH)
	sudo chmod 777 $(XFS_PATH)

remove-xfs:
	sudo umount $(XFS_PATH)
	rm $(XFS_IMG_PATH)

make-btrfs:
	dd if=/dev/zero of=$(BTRFS_IMG_PATH) bs=1M count=100
	mkfs.btrfs $(BTRFS_IMG_PATH)
	mkdir -p $(BTRFS_PATH)
	sudo mount -o loop $(BTRFS_IMG_PATH) $(BTRFS_PATH)
	sudo btrfs quota enable $(BTRFS_PATH)
	sudo chmod 777 $(BTRFS_PATH)

remove-btrfs:
	sudo umount $(BTRFS_PATH)
	rm $(BTRFS_IMG_PATH)

fs-test: make-logdir make-btrfs
	WEBIDA_DIR=`pwd` $(NODEUNIT) test/test-fs.js | tee $(LOGPATH)/`date +%Y%m%d.%H%M%S`.log
	#$(NODEUNIT) --reporter nodeunit/lib/reporters/junit --output $(OUTPUT_DIR) test | tee $(LOGPATH)/`date +%Y%m%d.%H%M%S`.log

xfs-test: make-logdir make-xfs
	WEBIDA_DIR=`pwd` $(NODEUNIT) test/test-xfs.js | tee $(LOGPATH)/`date +%Y%m%d.%H%M%S`.log

clean: remove-xfs remove-btrfs

test: fs-test xfs-test clean

.PHONY: test all
