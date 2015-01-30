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

describe('jasmine.NestedResults', function() {
  it('#addResult increments counters', function() {
    // Leaf case
    var results = new jasmine.NestedResults();

    results.addResult(new jasmine.ExpectationResult({
      matcherName: "foo", passed: true, message: 'Passed.', actual: 'bar', expected: 'bar'}
    ));

    expect(results.getItems().length).toEqual(1);
    expect(results.totalCount).toEqual(1);
    expect(results.passedCount).toEqual(1);
    expect(results.failedCount).toEqual(0);

    results.addResult(new jasmine.ExpectationResult({
      matcherName: "baz", passed: false, message: 'FAIL.', actual: "corge", expected: "quux"
    }));

    expect(results.getItems().length).toEqual(2);
    expect(results.totalCount).toEqual(2);
    expect(results.passedCount).toEqual(1);
    expect(results.failedCount).toEqual(1);
  });

  it('should roll up counts for nested results', function() {
    // Branch case
    var leafResultsOne = new jasmine.NestedResults();
    leafResultsOne.addResult(new jasmine.ExpectationResult({
      matcherName: "toSomething", passed: true, message: 'message', actual: '', expected:''
    }));

    leafResultsOne.addResult(new jasmine.ExpectationResult({
      matcherName: "toSomethingElse", passed: false, message: 'message', actual: 'a', expected: 'b'
    }));

    var leafResultsTwo = new jasmine.NestedResults();
    leafResultsTwo.addResult(new jasmine.ExpectationResult({
      matcherName: "toSomething", passed: true, message: 'message', actual: '', expected: ''
    }));
    leafResultsTwo.addResult(new jasmine.ExpectationResult({
      matcherName: "toSomethineElse", passed: false, message: 'message', actual: 'c', expected: 'd'
    }));

    var branchResults = new jasmine.NestedResults();
    branchResults.addResult(leafResultsOne);
    branchResults.addResult(leafResultsTwo);

    expect(branchResults.getItems().length).toEqual(2);
    expect(branchResults.totalCount).toEqual(4);
    expect(branchResults.passedCount).toEqual(2);
    expect(branchResults.failedCount).toEqual(2);
  });

});
