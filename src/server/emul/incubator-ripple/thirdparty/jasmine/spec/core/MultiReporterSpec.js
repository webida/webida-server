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

describe("jasmine.MultiReporter", function() {
  var multiReporter, fakeReporter1, fakeReporter2;

  beforeEach(function() {
    multiReporter = new jasmine.MultiReporter();
    fakeReporter1 = jasmine.createSpyObj("fakeReporter1", ["reportSpecResults"]);
    fakeReporter2 = jasmine.createSpyObj("fakeReporter2", ["reportSpecResults", "reportRunnerStarting"]);
    multiReporter.addReporter(fakeReporter1);
    multiReporter.addReporter(fakeReporter2);
  });

  it("should support all the method calls that jasmine.Reporter supports", function() {
    var delegate = {};
    multiReporter.addReporter(delegate);

    this.addMatchers({
      toDelegateMethod: function(methodName) {
        delegate[methodName] = jasmine.createSpy(methodName);
        this.actual[methodName]("whatever argument");

        return delegate[methodName].wasCalled && 
               delegate[methodName].mostRecentCall.args.length == 1 && 
               delegate[methodName].mostRecentCall.args[0] == "whatever argument";
      }
    });

    expect(multiReporter).toDelegateMethod('reportRunnerStarting');
    expect(multiReporter).toDelegateMethod('reportRunnerResults');
    expect(multiReporter).toDelegateMethod('reportSuiteResults');
    expect(multiReporter).toDelegateMethod('reportSpecStarting');
    expect(multiReporter).toDelegateMethod('reportSpecResults');
    expect(multiReporter).toDelegateMethod('log');
  });

  it("should delegate to any and all subreporters", function() {
    multiReporter.reportSpecResults('blah', 'foo');
    expect(fakeReporter1.reportSpecResults).toHaveBeenCalledWith('blah', 'foo');
    expect(fakeReporter2.reportSpecResults).toHaveBeenCalledWith('blah', 'foo');
  });

  it("should quietly skip delegating to any subreporters which lack the given method", function() {
    multiReporter.reportRunnerStarting('blah', 'foo');
    expect(fakeReporter2.reportRunnerStarting).toHaveBeenCalledWith('blah', 'foo');
  });
});