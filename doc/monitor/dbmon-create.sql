
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
INDEX profile_inst_req_idx_req_url(req_url)
);


CREATE TABLE stat_requests_per_day (
inst_name VARCHAR(30) NOT NULL,
svc_type VARCHAR(30) NOT NULL,
req_url VARCHAR(512) NOT NULL,
req_method VARCHAR(512) NOT NULL,
min_rst INT NOT NULL,
max_rst INT NOT NULL,
avg_rst INT NOT NULL,
total_cnt INT NOT NULL,
issue_date  VARCHAR(8) NOT NULL,

INDEX stat_requests_per_day_idx_inst_name(inst_name),
INDEX stat_requests_per_day_idx_svc_type(svc_type),
INDEX stat_requests_per_day_idx_req_url(req_url),
INDEX stat_requests_per_day_idx_req_method(req_method),
INDEX stat_requests_per_day_idx_issue_date(issue_date)
);


CREATE TABLE stat_requests_per_hour (
inst_name VARCHAR(30) NOT NULL,
svc_type VARCHAR(30) NOT NULL,
req_url VARCHAR(512) NOT NULL,
req_method VARCHAR(512) NOT NULL,
min_rst INT NOT NULL,
max_rst INT NOT NULL,
avg_rst INT NOT NULL,
total_cnt INT NOT NULL,
start_time DATETIME NOT NULL,
end_time DATETIME NOT NULL,

INDEX stat_requests_per_hour_idx_inst_name(inst_name),
INDEX stat_requests_per_hour_idx_svc_type(svc_type),
INDEX stat_requests_per_hour_idx_req_url(req_url),
INDEX stat_requests_per_hour_idx_req_method(req_method),
INDEX stat_requests_per_hour_idx_start_time(start_time),
INDEX stat_requests_per_hour_idx_end_time(end_time)
);


