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

/**
 * Resource class representing a resource(file, dir) in Webida FS
 * @class
 */

'use strict';

var Path = require('path');
var URI = require('URIjs');
var WebidaFS = require('./webidafs').WebidaFS;

function Resource(wfsUrl) {
    this.uri = URI(wfsUrl);
    this.fsid = this.uri.host();
    this.wfs = new WebidaFS(this.fsid);
    this.pathname = decodeURI(this.uri.pathname());
    this.basename = Path.basename(this.pathname);
    this.localPath = this.wfs.getFSPath(this.pathname);
}

Resource.prototype.equals = function (rsc2) {
    return this.uri.equals(rsc2.uri);
};

Resource.prototype.getParent = function () {
    var parentResource;
    var parentUri = this.uri.clone();
    parentUri.pathname(Path.dirname(this.uri.pathname()));
    parentResource = new Resource(parentUri);
    if (parentResource.equals(this)) {
        return null;
    }
    return parentResource;
};

module.exports = Resource;