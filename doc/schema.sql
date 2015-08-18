CREATE TABLE `mem_user` (
  `user_id` VARCHAR(32) NOT NULL,
  `email` VARCHAR(255) NULL,
  `password` VARCHAR(255) NULL,
  `name` VARCHAR(128) NULL,
  `company` VARCHAR(128) NULL,
  `telephone` VARCHAR(32) NULL,
  `dep` VARCHAR(128) NULL COMMENT 'department' ,
  `url` VARCHAR(255) NULL,
  `location` TEXT NULL,
  `gravatar` VARCHAR(255) NULL,
  `act_key` VARCHAR(255) NULL COMMENT 'activation key',
  `status` TINYINT(1) NULL COMMENT '0=pending, 1=approved, 2=rejected, 3=password reset',
  `type` TINYINT(1) NULL COMMENT '1=ADMIN, 0=USER',
  `uid` INT UNSIGNED NULL,
  `last_login_time` DATETIME NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`user_id`));
CREATE TABLE `mem_group` (
  `group_id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(255) NULL,
  `owner_id` VARCHAR(32) NULL,
  `user_data` TEXT NULL,
  `gid` INT UNSIGNED NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`group_id`));
CREATE TABLE `mem_group_user` (
  `group_id` VARCHAR(32) NOT NULL,
  `user_id` VARCHAR(32) NOT NULL,
  `create_time` DATETIME NULL,
  PRIMARY KEY (`group_id`, `user_id`));
CREATE TABLE `mem_subject` (
  `subject_id` VARCHAR(32) NOT NULL,
  `type` CHAR(1) NOT NULL COMMENT '\'g\'=GROUP, \'u\'=USER',
  `uid` INT UNSIGNED NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`subject_id`));
CREATE TABLE `mem_policy_subject` (
  `policy_id` VARCHAR(32) NOT NULL,
  `subject_id` VARCHAR(32) NOT NULL,
  `create_time` DATETIME NULL,
  PRIMARY KEY (`policy_id`, `subject_id`));
CREATE TABLE `mem_policy` (
  `policy_id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(255) NULL,
  `owner_id` VARCHAR(32) NOT NULL,
  `effect` VARCHAR(8) NULL,
  `action` TEXT NULL,
  `resource` TEXT NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`policy_id`));
CREATE TABLE `webida_app` (
  `app_id` VARCHAR(32) NOT NULL,
  `key` VARCHAR(255) NULL,
  `name` VARCHAR(255) NOT NULL,
  `domain` VARCHAR(255) NULL,
  `type` VARCHAR(8) NULL COMMENT '\'html\'|\'nodejs\'',
  `process_id` INT NULL,
  `port` INT NULL,
  `desc` TEXT NULL,
  `owner_id` VARCHAR(32) NULL,
  `source_url` VARCHAR(255) NULL,
  `is_deployed` TINYINT(1) NULL,
  `status` VARCHAR(8) NULL COMMENT '\'running\' | \'stop\'',
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`app_id`));
CREATE TABLE `oauth_client` (
  `client_id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(255) NULL,
  `oauth_client_id` VARCHAR(255) NULL,
  `oauth_client_secret` VARCHAR(255) NULL,
  `is_system` TINYINT(1) NULL,
  `redirect_url` VARCHAR(255) NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`client_id`));
CREATE TABLE `oauth_code` (
  `code_id` VARCHAR(32) NOT NULL,
  `code` VARCHAR(255) NULL,
  `oauth_client_id` VARCHAR(255) NULL,
  `redirect_url` VARCHAR(255) NULL,
  `user_id` VARCHAR(32) NULL,
  `expire_time` DATETIME NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`code_id`));
CREATE TABLE `mem_temp_key` (
  `key_id` VARCHAR(32) NOT NULL,
  `user_id` VARCHAR(32) NULL,
  `key` VARCHAR(255) NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`key_id`));
CREATE TABLE `oauth_token` (
  `token_id` VARCHAR(32) NOT NULL,
  `token` VARCHAR(255) NULL,
  `user_id` VARCHAR(32) NULL,
  `oauth_client_id` VARCHAR(255) NULL,
  `validity_period` INT NULL COMMENT '0=INFINITE, n>0=period(sec)',
  `expire_time` DATETIME NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`token_id`));
CREATE TABLE `fs_alias` (
  `alias_id` VARCHAR(32) NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  `url` VARCHAR(255) NULL,
  `wfs_id` VARCHAR(32) NULL,
  `path` VARCHAR(255) NULL,
  `owner_id` VARCHAR(32) NULL,
  `validity_period` INT NULL COMMENT '0=INFINITE, n>0=period(sec)',
  `expire_time` DATETIME NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`alias_id`));
CREATE TABLE `fs_download_link` (
  `download_link_id` VARCHAR(32) NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  `wfs_id` VARCHAR(32) NULL,
  `path` VARCHAR(255) NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`download_link_id`));
CREATE TABLE `webida_key_store` (
  `key_store_id` VARCHAR(32) NOT NULL,
  `wfs_id` VARCHAR(32) NULL,
  `user_id` VARCHAR(32) NULL,
  `alias` VARCHAR(255) NULL,
  `file_name` VARCHAR(255) NULL,
  `key_password` VARCHAR(255) NULL,
  `key_store_password` VARCHAR(255) NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`key_store_id`));
CREATE TABLE `fs_lock` (
  `lock_id` VARCHAR(32) NOT NULL,
  `user_id` VARCHAR(32) NULL,
  `email` VARCHAR(255) NULL,
  `wfs_id` VARCHAR(32) NULL,
  `path` VARCHAR(255) NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`lock_id`));
CREATE TABLE `fs_wfs` (
  `wfs_id` VARCHAR(32) NOT NULL,
  `key` VARCHAR(255) NULL,
  `owner_id` VARCHAR(32) NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`wfs_id`));
CREATE TABLE `fs_wfs_del` (
  `wfs_id` VARCHAR(32) NOT NULL,
  `key` VARCHAR(255) NULL,
  `owner_id` VARCHAR(32) NULL,
  `delete_time` DATETIME NULL,
  PRIMARY KEY (`wfs_id`));
CREATE TABLE `webida_gcm_info` (
  `gcm_info_id` VARCHAR(32) NOT NULL,
  `user_id` VARCHAR(32) NULL,
  `reg_id` VARCHAR(255) NULL,
  `info` VARCHAR(255) NULL,
  `create_time` DATETIME NULL,
  `update_time` DATETIME NULL,
  PRIMARY KEY (`gcm_info_id`));
CREATE TABLE `sequence` (
  `space` VARCHAR(32) NOT NULL,
  `current_seq` INT UNSIGNED NULL,
  `max_seq` INT(10) UNSIGNED NULL DEFAULT 4294967295,
  `create_time` DATETIME NULL,
 PRIMARY KEY (`space`));

ALTER TABLE `mem_group_user`
ADD INDEX `mem_group_user_fk_02_idx` (`user_id` ASC);
ALTER TABLE `mem_group_user`
ADD CONSTRAINT `mem_group_user_fk_01`
  FOREIGN KEY (`group_id`)
  REFERENCES `mem_group` (`group_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION,
ADD CONSTRAINT `mem_group_user_fk_02`
  FOREIGN KEY (`user_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `fs_lock`
ADD INDEX `fs_lock_fk_01_idx` (`user_id` ASC),
ADD INDEX `fs_lock_fk_02_idx` (`wfs_id` ASC);
ALTER TABLE `fs_lock`
ADD CONSTRAINT `fs_lock_fk_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION,
ADD CONSTRAINT `fs_lock_fk_02`
  FOREIGN KEY (`wfs_id`)
  REFERENCES `fs_wfs` (`wfs_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `fs_wfs`
ADD INDEX `fs_wfs_fk_01_idx` (`owner_id` ASC);
ALTER TABLE `fs_wfs`
ADD CONSTRAINT `fs_wfs_fk_01`
  FOREIGN KEY (`owner_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `mem_group`
ADD INDEX `mem_group_fk_01_idx` (`owner_id` ASC);
ALTER TABLE `mem_group`
ADD CONSTRAINT `mem_group_fk_01`
  FOREIGN KEY (`owner_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `mem_policy`
ADD INDEX `mem_policy_fk_01_idx` (`owner_id` ASC);
ALTER TABLE `mem_policy`
ADD CONSTRAINT `mem_policy_fk_01`
  FOREIGN KEY (`owner_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `mem_policy_subject`
ADD INDEX `mem_policy_subject_fk_02_idx` (`subject_id` ASC);
ALTER TABLE `mem_policy_subject`
ADD CONSTRAINT `mem_policy_subject_fk_01`
  FOREIGN KEY (`policy_id`)
  REFERENCES `mem_policy` (`policy_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION,
ADD CONSTRAINT `mem_policy_subject_fk_02`
  FOREIGN KEY (`subject_id`)
  REFERENCES `mem_subject` (`subject_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `mem_temp_key`
ADD INDEX `mem_temp_key_fk_01_idx` (`user_id` ASC);
ALTER TABLE `mem_temp_key`
ADD CONSTRAINT `mem_temp_key_fk_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `oauth_code`
ADD INDEX `oauth_code_fk_01_idx` (`user_id` ASC);
ALTER TABLE `oauth_code`
ADD CONSTRAINT `oauth_code_fk_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `oauth_token`
ADD INDEX `oauth_token_fk_01_idx` (`user_id` ASC);
ALTER TABLE `oauth_token`
ADD CONSTRAINT `oauth_token_fk_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `fs_alias`
ADD INDEX `fs_alias_fk_01_idx` (`wfs_id` ASC),
ADD INDEX `fs_alias_fk_02_idx` (`owner_id` ASC);
ALTER TABLE `fs_alias`
ADD CONSTRAINT `fs_alias_fk_01`
  FOREIGN KEY (`wfs_id`)
  REFERENCES `fs_wfs` (`wfs_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION,
ADD CONSTRAINT `fs_alias_fk_02`
  FOREIGN KEY (`owner_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `webida_app`
ADD INDEX `webida_app_fk_01_idx` (`owner_id` ASC);
ALTER TABLE `webida_app`
ADD CONSTRAINT `webida_app_fk_01`
  FOREIGN KEY (`owner_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `fs_download_link`
ADD INDEX `fs_download_link_fk_01_idx` (`wfs_id` ASC);
ALTER TABLE `fs_download_link`
ADD CONSTRAINT `fs_download_link_fk_01`
  FOREIGN KEY (`wfs_id`)
  REFERENCES `fs_wfs` (`wfs_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `webida_gcm_info`
ADD INDEX `webida_gcm_info_fk_01_idx` (`user_id` ASC);
ALTER TABLE `webida_gcm_info`
ADD CONSTRAINT `webida_gcm_info_fk_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `webida_key_store`
ADD INDEX `webida_key_store_fk_01_idx` (`wfs_id` ASC),
ADD INDEX `webida_key_store_fk_02_idx` (`user_id` ASC);
ALTER TABLE `webida_key_store`
ADD CONSTRAINT `webida_key_store_fk_01`
  FOREIGN KEY (`wfs_id`)
  REFERENCES `fs_wfs` (`wfs_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION,
ADD CONSTRAINT `webida_key_store_fk_02`
  FOREIGN KEY (`user_id`)
  REFERENCES `mem_user` (`user_id`)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
ALTER TABLE `mem_temp_key` ADD UNIQUE INDEX `mem_temp_key_UNIQUE_01` (`user_id` ASC);
ALTER TABLE `mem_temp_key` ADD UNIQUE INDEX `mem_temp_key_UNIQUE_02` (`key` ASC);
ALTER TABLE `oauth_client` ADD UNIQUE INDEX `oauth_client_UNIQUE_01` (`oauth_client_id` ASC);
ALTER TABLE `mem_user` ADD UNIQUE INDEX `mem_user_UNIQUE_01` (`act_key` ASC);
ALTER TABLE `mem_user` ADD UNIQUE INDEX `mem_user_UNIQUE_02` (`uid` ASC);
ALTER TABLE `mem_user` ADD UNIQUE INDEX `mem_user_UNIQUE_03` (`email` ASC);