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