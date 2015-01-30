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

var fsMgr = require('../lib/fs-manager');
var targetRsc = new fsMgr.Resource('wfs://gJmDsuhUN/app-ide');
var regKeyword = new RegExp('f1');
var regDirectory = new RegExp('\/.git\/');
var regFile = null;
fsMgr.search(targetRsc, regKeyword, regDirectory, regFile, function (err, lists) {
    if (err) { throw err; }
    var f;
    var sum = 0;
    for (f in lists) {
	    sum += lists[f].match.length;
	    console.log(lists[f].filename + ':', lists[f].match.length);
        /*
        for (l in lists[f].match) {
            var line = lists[f].match[l];
            console.log('\t' + line.line + ':' + line.text);
        }
        */
    }
    console.log('Sum:', sum);
    process.exit();
});

