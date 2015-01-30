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

describe('Spec', function () {
  var env, suite;
  beforeEach(function() {
    env = new jasmine.Env();
    env.updateInterval = 0;
    suite = new jasmine.Suite(env, 'suite 1');
  });

  describe('initialization', function () {

    it('should raise an error if an env is not passed', function () {
      try {
        new jasmine.Spec();
      }
      catch (e) {
        expect(e.message).toEqual('jasmine.Env() required');
      }
    });

    it('should raise an error if a suite is not passed', function () {
      try {
        new jasmine.Spec(env);
      }
      catch (e) {
        expect(e.message).toEqual('jasmine.Suite() required');
      }
    });

    it('should assign sequential ids for specs belonging to the same env', function () {
      var spec1 = new jasmine.Spec(env, suite);
      var spec2 = new jasmine.Spec(env, suite);
      var spec3 = new jasmine.Spec(env, suite);
      expect(spec1.id).toEqual(0);
      expect(spec2.id).toEqual(1);
      expect(spec3.id).toEqual(2);
    });
  });

  it('getFullName returns suite & spec description', function () {
    var spec = new jasmine.Spec(env, suite, 'spec 1');
    expect(spec.getFullName()).toEqual('suite 1 spec 1.');
  });

  describe('results', function () {
    var spec, results;
    beforeEach(function () {
      spec = new jasmine.Spec(env, suite);
      results = spec.results();
      expect(results.totalCount).toEqual(0);
      spec.runs(function () {
        this.expect(true).toEqual(true);
        this.expect(true).toEqual(true);
      });
    });


    it('results shows the total number of expectations for each spec after execution', function () {
      expect(results.totalCount).toEqual(0);
      spec.execute();
      expect(results.totalCount).toEqual(2);
    });

    it('results shows the number of passed expectations for each spec after execution', function () {
      expect(results.passedCount).toEqual(0);
      spec.execute();
      expect(results.passedCount).toEqual(2);
    });

    it('results shows the number of failed expectations for each spec after execution', function () {
      spec.runs(function () {
        this.expect(true).toEqual(false);
      });
      expect(results.failedCount).toEqual(0);
      spec.execute();
      expect(results.failedCount).toEqual(1);
    });

    describe('results.passed', function () {
      it('is true if all spec expectations pass', function () {
        spec.runs(function () {
          this.expect(true).toEqual(true);
        });
        spec.execute();
        expect(results.passed()).toEqual(true);
      });

      it('is false if one spec expectation fails', function () {
        spec.runs(function () {
          this.expect(true).toEqual(false);
        });
        spec.execute();
        expect(results.passed()).toEqual(false);
      });

      it('a spec with no expectations will return true', function () {
        var specWithoutExpectations = new jasmine.Spec(env, suite);
        specWithoutExpectations.runs(function() {

        });
        specWithoutExpectations.execute();
        expect(results.passed()).toEqual(true);
      });

      it('an unexecuted spec will return true', function () {
        expect(results.passed()).toEqual(true);
      });
    });

    it("includes log messages, which may contain arbitary objects", function() {
      spec.runs(function() {
        this.log("here's some log message", {key: 'value'}, 123);
      });
      spec.execute();
      var items = results.getItems();
      expect(items).toEqual([
          jasmine.any(jasmine.ExpectationResult),
          jasmine.any(jasmine.ExpectationResult),
          jasmine.any(jasmine.MessageResult)
      ]);
      var logResult = items[2];
      expect(logResult.values).toEqual(["here's some log message", {key: 'value'}, 123]);
    });
  });
});