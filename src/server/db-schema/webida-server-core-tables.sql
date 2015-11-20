/*
 * usually, installers of each server handles creating DB tables
 * so, following SQLs will not work on our DB
 */

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
