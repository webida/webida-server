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


var nexpect = require('nexpect');

  nexpect.spawn("echo", ["hello"])
         .expect("hello")
         .run(function (err, stdout, exitcode) {
           if (!err) {
             console.log("hello was echoed");
           }
         });

  nexpect.spawn("ls -la /tmp/undefined", { stream: 'stderr' })
         .expect("No such file or directory")
         .run(function (err, stdout) {
            console.log('stdout = ', stdout);
           if (!err) {
             console.log("checked that file doesn't exists");
           }
         });

  nexpect.spawn("node --interactive")
         .expect(">")
         .sendline("console.log('testing')")
         .expect("testing")
         .sendline("process.exit()")
         .run(function (err, stdout, exitcode) {
            console.log('stdout = ', stdout);
           if (!err) {
             console.log("node process started, console logged, process exited");
           }
           else {
             console.log(err)
           }
         });
    
    var params = ["-verbose", "-sigalg", "SHA1withRSA", "-digestalg", "SHA1", "-signedjar", "t11_release", "-keystore", "./workspaces/100001/keystore/dykim-release-key.keystore", "./workspaces/100001/test/mobilesample/pf1/mobilesample/platforms/android/ant-build/t11-release-unsigned.apk", "alias_name"];
    //nexpect.spawn("jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -signedjar t11_release -keystore ./workspaces/100001/keystore/dykim-release-key.keystore workspaces/100001/test/mobilesample/pf1/mobilesample/platforms/android/ant-build/t11-release-unsigned.apk alias_name")
    nexpect.spawn("jarsigner", params, { stream: "stderr", verbose : 1 } )
         .expect("Enter Passphrase for keystore:")
         .sendline("dykim12")
         .run(function (err, stdout, exitcode) {
            console.log('stdout = ', stdout);
           if (!err) {
             console.log("xxxxxxxxxxxxxxx");
           }
           else {
             console.log(err)
           }
         });
