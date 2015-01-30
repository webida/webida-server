/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */
function FileProperties(props) {
    props = props || {};

    function _get(val) {
        return function () {
            return props[val];
        };
    }

    this.__defineGetter__("dateCreated", _get("dateCreated")); //tablet only
    this.__defineGetter__("dateModified", _get("dateModified"));
    this.__defineGetter__("directory", _get("directory"));
    this.__defineGetter__("fileExtension", _get("fileExtension"));
    this.__defineGetter__("isHidden", _get("isHidden"));
    this.__defineGetter__("isReadonly", _get("isReadonly")); //handset only
    this.__defineGetter__("mimeType", _get("mimeType")); //handset only
    this.__defineGetter__("size", _get("size"));
}

module.exports = FileProperties;
