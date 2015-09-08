
/*
 Script for creating a profiling database
*/

CREATE DATABASE dbmon;


grant all on dbmon.* TO webida@localhost;


CREATE TABLE profile_inst (
inst_id INT(10) auto_increment primary key,
inst_name VARCHAR(30) NOT NULL, 
svc_type VARCHAR(30) NOT NULL,
req_type_count INT NOT NULL,
started_at DATETIME DEFAULT 0 NOT NULL,
ended_at DATETIME DEFAULT 0 NOT NULL,

UNIQUE INDEX profile_inst_idx_inst_idname(inst_id, inst_name)
);

# index name convenction: tablename + idx + columnname

CREATE TABLE profile_inst_req (
inst_id INT(10) NOT NULL,
req_url VARCHAR(512) NOT NULL,
req_method VARCHAR(16) NOT NULL,
min_rst INT NOT NULL,
max_rst INT NOT NULL,
avg_rst INT NOT NULL,
total_cnt INT NOT NULL,
created_at DATETIME NOT NULL,

INDEX profile_inst_req_idx_inst_id(inst_id),
INDEX profile_inst_req_idx_req_url(req_url),
INDEX profile_inst_req_idx_created_at(created_at)
);


CREATE TABLE stat_daily_req (
inst_name VARCHAR(30) NOT NULL,
svc_type VARCHAR(30) NOT NULL,
req_url VARCHAR(512) NOT NULL,
req_method VARCHAR(512) NOT NULL,
min_rst INT NOT NULL,
max_rst INT NOT NULL,
avg_rst INT NOT NULL,
total_cnt INT NOT NULL,
issue_date  DATETIME NOT NULL,
updated_at  DATETIME NOT NULL,

INDEX stat_daily_req_idx_inst_name(inst_name),
INDEX stat_daily_req_idx_svc_type(svc_type),
INDEX stat_daily_req_idx_req_url(req_url),
INDEX stat_daily_req_idx_req_method(req_method),
INDEX stat_daily_req_idx_issue_date(issue_date)
);


CREATE TABLE stat_hourly_req (
inst_name VARCHAR(30) NOT NULL,
svc_type VARCHAR(30) NOT NULL,
req_url VARCHAR(512) NOT NULL,
req_method VARCHAR(512) NOT NULL,
min_rst INT NOT NULL,
max_rst INT NOT NULL,
avg_rst INT NOT NULL,
total_cnt INT NOT NULL,
issue_date  DATETIME NOT NULL,
updated_at  DATETIME NOT NULL,

INDEX stat_hourly_req_idx_inst_name(inst_name),
INDEX stat_hourly_req_idx_svc_type(svc_type),
INDEX stat_hourly_req_idx_req_url(req_url),
INDEX stat_hourly_req_idx_req_method(req_method),
INDEX stat_hourly_req_idx_issue_date(issue_date)
);


