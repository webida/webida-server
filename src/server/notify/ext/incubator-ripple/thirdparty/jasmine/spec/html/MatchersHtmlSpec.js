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

describe("MatchersSpec - HTML Dependent", function () {
  var env, spec;

  beforeEach(function() {
    env = new jasmine.Env();
    env.updateInterval = 0;

    var suite = env.describe("suite", function() {
      spec = env.it("spec", function() {
      });
    });
    spyOn(spec, 'addMatcherResult');

    this.addMatchers({
      toPass: function() {
        return lastResult().passed();
      },
      toFail: function() {
        return !lastResult().passed();
      }
    });
  });

  function match(value) {
    return spec.expect(value);
  }

  function lastResult() {
    return spec.addMatcherResult.mostRecentCall.args[0];
  }

  it("toEqual with DOM nodes", function() {
    var nodeA = document.createElement('div');
    var nodeB = document.createElement('div');
    expect((match(nodeA).toEqual(nodeA))).toPass();
    expect((match(nodeA).toEqual(nodeB))).toFail();
  });
});