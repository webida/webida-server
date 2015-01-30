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

'use strict'

var fs = require('fs');
var domUtil = require('jsdom')

var filePath = './workspaces/100001/test/mobilesample/pf1/mobilesample/platforms/android/assets/www/index.html';


var readStream = fs.readFile(filePath, 'utf8', function (err, html) {
    if (err) {
        return console.log(err);
    }

    var document = domUtil.jsdom(html, null);
    var window = document.createWindow();
    /*
    var window = domUtil.jsdom(html, null, {
        // standard options:  disable loading other assets
        // or executing script tags
        FetchExternalResources: false,
        ProcessExternalResources: false,
        MutationEvents: false,
        QuerySelector: false
    }).createWindow();

    */


    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'http://aaa.webida.mine/target/target-script-min.js#t11';

    document.head.appendChild(script);
    //var $ = require('jquery').create(window);

    //$('head').append(script);
    //$('body').append('<script src=http://zzz.webida.mine/target/target-script-min.js></script>');

    console.log(window.document.outerHTML);

    fs.writeFile(filePath, window.document.outerHTML, function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log('the file was saved');
        }
    });
});


