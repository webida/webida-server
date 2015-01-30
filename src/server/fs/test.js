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



var str = '<!-- uip-meta-fileid:20140708-309f-4bb0-9fe8-bbea65166b6b -->';

//var str = 'fileid:20140708-309f-4bb0-9fe8-bbea65166b6b -->';

var start = str.indexOf(':', 0);
var end = str.indexOf(' -->', start);

var substr = str.substring(start + 1, end);

console.log(substr);

//var regex  = new RegExp(/[^<!-- uip-meta-fileid:](.*)$/);

//var arr = str.match(regex);


//console.log(arr[0]);
//console.log(arr[1]);
