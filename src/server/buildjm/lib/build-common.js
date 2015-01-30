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

var logger = require('../../common/log-manager');

var eBuildState =  {
    'eInit' : 0,
    'eDownloadSource' : 1,
    'ePlatformAdd' : 2,
    'ePluginAdd' : 3,
    'ePluginRemove' : 3,
    'eBuild' : 4,
    'eSigning' : 5,
    'eUploadPackage' : 6,
    'eCompleted' : 7
};

module.exports.eBuildState = eBuildState;

var eResult = {
    'succ' : 0,
    'fail' : 2
};

module.exports.eResult = eResult;

function BuildState(taskInfo, buildState) {
    var resultVal = {
        ret : 'progress',
        info : taskInfo,
        state : buildState,
    };

    return resultVal;
}

module.exports.setBuildState = function(buildState, param) {
    var msg = BuildState(param.taskInfo, buildState);
    logger.info(JSON.stringify(msg));
    param.cb(1, msg, param.task);
}

var BuildError = {
    'alreadyRunning' : 'The same task for resource is already running'

};

module.exports.BuildError = BuildError;
