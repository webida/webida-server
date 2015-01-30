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

/** No-op base class for Jasmine reporters.
 *
 * @constructor
 */
jasmine.Reporter = function() {
};

//noinspection JSUnusedLocalSymbols
jasmine.Reporter.prototype.reportRunnerStarting = function(runner) {
};

//noinspection JSUnusedLocalSymbols
jasmine.Reporter.prototype.reportRunnerResults = function(runner) {
};

//noinspection JSUnusedLocalSymbols
jasmine.Reporter.prototype.reportSuiteResults = function(suite) {
};

//noinspection JSUnusedLocalSymbols
jasmine.Reporter.prototype.reportSpecStarting = function(spec) {
};

//noinspection JSUnusedLocalSymbols
jasmine.Reporter.prototype.reportSpecResults = function(spec) {
};

//noinspection JSUnusedLocalSymbols
jasmine.Reporter.prototype.log = function(str) {
};

