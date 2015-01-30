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

describe('jasmine.Reporter', function() {
  var env;


  beforeEach(function() {
    env = new jasmine.Env();
    env.updateInterval = 0;
  });

  it('should get called from the test runner', function() {
    env.describe('Suite for JSON Reporter with Callbacks', function () {
      env.it('should be a test', function() {
        this.runs(function () {
          this.expect(true).toEqual(true);
        });
      });
      env.it('should be a failing test', function() {
        this.runs(function () {
          this.expect(false).toEqual(true);
        });
      });
    });
    env.describe('Suite for JSON Reporter with Callbacks 2', function () {
      env.it('should be a test', function() {
        this.runs(function () {
          this.expect(true).toEqual(true);
        });
      });

    });

    var foo = 0;
    var bar = 0;
    var baz = 0;

    env.addReporter({
      reportSpecResults: function() {
        foo++;
      },
      reportSuiteResults: function() {
        bar++;
      },
      reportRunnerResults: function() {
        baz++;
      }
    });

    var runner = env.currentRunner();
    runner.execute();

    expect(foo).toEqual(3); // 'foo was expected to be 3, was ' + foo);
    expect(bar).toEqual(2); // 'bar was expected to be 2, was ' + bar);
    expect(baz).toEqual(1); // 'baz was expected to be 1, was ' + baz);
  });

});