/*
 * Copyright (c) 2012-2015 S-Core Co., Ltd.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var fs = require('fs');
var Path = require('path');
var utils = require('./utils');

var request = require('request');
var unzip = require('unzip');
var fstream = require('fstream');

var logger = require('./log-manager');
var config = require('./conf-manager').conf;

var fsBaseUrl = config.fsHostUrl;

///webida/api/fs/archive/{fsid}/?source='list1,list2'&target='archive.zip'&mode=[create|extract|export]

function httpGet(token, encoding, url, cb) {
    var options = {
        uri: url,
        headers: { 
            'Authorization': token
        }
    };
    
    if (encoding == null) {
        options.encoding = null;
    }

    logger.info(options);

    request(options, function (err, res, body) {
        if (err) { 
            return cb(err); 
        }

        if (res.statusCode === 200) {
            logger.info('status code == 200');
            return cb(0, res, body); 
        } else if (res.statusCode === 419) {
            return cb(419);
        } else {
            return cb(500);
        }
    });
}

function httpPost(token, encoding, url, cb) {
    var options = {
        uri: url,
        headers: { 
            'Authorization': token
        }
    };
    
    if (encoding == null) {
        options.encoding = null;
    }

    var r = request.post(options, function (err, res, body) {
        if (err) { 
            logger.error('httpPost error :', err, res, body);
            return cb(err); 
        }

        logger.info('httpPost result :', err, res, body);

        if (res.statusCode === 200) {
            logger.info('status code == 200');
            return cb(0, res, body); 
        } else if (res.statusCode === 419) {
            return cb(419, res, body);
        } else {
            return cb(500, res, body);
        }
    });

    var form = r.form();
    form.append('recursive', 'true');
}


function httpUpload(token, encoding, url, srcPath, cb) {
    var options = {
        uri: url,
        headers: { 
            'Authorization': token
        }
    };
    
    var r = request.post(options, function (err, res, body) {
        if (err) { 
            logger.error('upload error = ', err);
            return cb(err); 
        }

        if (res.statusCode === 200) {
            logger.info('status code == 200');
            return cb(0, res, body); 
        } else if (res.statusCode === 419) {
            return cb(419, res, body);
        } else {
            return cb(500, res, body);
        }
    });

    var form = r.form();
    form.append('file', fs.createReadStream(srcPath));
}


exports.getMyFs = function (token, cb) {
    var url = fsBaseUrl + '/webida/api/fs/';
    httpGet(token, null, url, function(err, res, body) {
        if (err === 0) {
            var data = JSON.parse(body);
            logger.info('fsinfo = ', data);
            var fsid = data.data[0].fsid;
            logger.info('fsid = ', fsid);
            cb(0, fsid);
        } else {
            cb(1);
        }
    });
}


function extractFile(sourceFile, targetPath) {
    var readStream = fs.createReadStream(sourceFile);
    var writeStream = fstream.Writer(targetPath);
    readStream
        .pipe(unzip.Parse())
        .pipe(writeStream);
}

exports.getProj = function (token, fsId, workName, projName, targetDir, cb) {
    var dlPath = Path.join(targetDir, projName + '.zip'); 
    var urlZip = fsBaseUrl + '/webida/api/fs/archive/' + fsId + '/?source=' + workName + '/' + projName + '&target=' + projName + '.zip&mode=export';

    httpGet(token, null, urlZip, function(err, res, body) {
        if (err === 0) {
            fs.writeFile(dlPath, body, function(err) {
                if (err) {
                    logger.error('error getProject:', err);
                    return cb(1, dlPath);
                } 
                extractFile(dlPath, targetDir);
                cb(0, dlPath);
            }); 

        } else {
          cb(1, dlPath);
        }
    });
}


exports.getFile = function (token, fsId, filePath, targetDir, cb) {
    logger.debug('getFile - ', filePath);
    var url = fsBaseUrl + '/webida/api/fs/file/' + fsId + '/' + filePath;
    httpGet(token, null, url, function(err, res, body) {
        if (err === 0) {
            fs.writeFile(targetDir, body, function(err) {
                cb(null);
            }); 
        } else {
          cb('failed to get "' + filePath + '" from file system');
        }
    });
};

// @method RESTful API createDirectory - /webida/api/fs/file/{fsid}/{path}[?recursive={"true"|"false"}]

var createDir= function(token, fsId, uploadPath, cb) {
    var url = fsBaseUrl + '/webida/api/fs/directory/' + fsId + uploadPath;
    logger.info('createDir :', url);
    httpPost(token, 'dummy', url, function(err, res, body) {
        if (err === 0) {
            cb(0);
        } else {
            logger.error('failed to create dir from fs server: ', body);
            cb(1);
        }
    });
}

//@method RESTful API writeFile - /webida/api/fs/file/{fsid}/{path}[?encodig={value}]

var uploadApp = function(token, fsId, pkgPath, uploadPath, fileName, cb) {
    createDir(token, fsId, uploadPath, function (err) {
        if (err !== 0) {
            return cb(1);
        } else {
            var url = fsBaseUrl + '/webida/api/fs/file/' + fsId + uploadPath + '/' +  fileName;
            //var url = Path.join(fsBaseUrl, '/webida/api/fs/file/', fsId, uploadPath, fileName);
            logger.info('upload url = ', url);
            httpUpload(token, 'dummy', url, pkgPath, function(err, res, body) {
                logger.info('upload res body = ', body);
                if (err === 0) {
                    cb(0);
                } else {
                    cb(1);
                }
            });
        }
    });
}
exports.uploadApp = uploadApp;

