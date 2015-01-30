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

describe('Suite', function() {
  var fakeTimer;
  var env;

  beforeEach(function() {
    env = new jasmine.Env();
    env.updateInterval = 0;

    fakeTimer = new jasmine.FakeTimer();
    env.setTimeout = fakeTimer.setTimeout;
    env.clearTimeout = fakeTimer.clearTimeout;
    env.setInterval = fakeTimer.setInterval;
    env.clearInterval = fakeTimer.clearInterval;
  });

  describe('Specs', function () {
    var suite;

    beforeEach(function() {
      suite = env.describe('Suite 1', function () {
        env.it('Spec 1', function() {
          this.runs(function () {
            this.expect(true).toEqual(true);
          });
        });
        env.it('Spec 2', function() {
          this.runs(function () {
            this.expect(true).toEqual(true);
          });
        });
        env.describe('Suite 2', function () {
          env.it('Spec 3', function() {
            this.runs(function () {
              this.expect(true).toEqual(true);
            });
          });
        });
        env.it('Spec 4', function() {
          this.runs(function () {
            this.expect(true).toEqual(true);
          });
        });
      });
    });
    
    it('#specs should return all immediate children that are specs.', function () {
      var suiteSpecs = suite.specs();
      expect(suiteSpecs.length).toEqual(3);
      expect(suiteSpecs[0].description).toEqual('Spec 1');
      expect(suiteSpecs[1].description).toEqual('Spec 2');
      expect(suiteSpecs[2].description).toEqual('Spec 4');
    });

    it("#suites should return all immediate children that are suites.", function() {
      var nestedSuites = suite.suites();
      expect(nestedSuites.length).toEqual(1);
      expect(nestedSuites[0].description).toEqual('Suite 2');
    });

    it("#children should return all immediate children including suites and specs.", function() {
      var children = suite.children();
      expect(children.length).toEqual(4);
      expect(children[0].description).toEqual('Spec 1');
      expect(children[1].description).toEqual('Spec 2');
      expect(children[2].description).toEqual('Suite 2');
      expect(children[3].description).toEqual('Spec 4');
    });
  });

  describe('SpecCount', function () {

    it('should keep a count of the number of specs that are run', function() {
      var suite = env.describe('one suite description', function () {
        env.it('should be a test', function() {
          this.runs(function () {
            this.expect(true).toEqual(true);
          });
        });
        env.it('should be another test', function() {
          this.runs(function () {
            this.expect(true).toEqual(true);
          });
        });
        env.it('should be a third test', function() {
          this.runs(function () {
            this.expect(true).toEqual(true);
          });
        });
      });

      expect(suite.specs().length).toEqual(3);
    });

    it('specCount should be correct even with runs/waits blocks', function() {
      var suite = env.describe('one suite description', function () {
        env.it('should be a test', function() {
          this.runs(function () {
            this.expect(true).toEqual(true);
          });
        });
        env.it('should be another test', function() {
          this.runs(function () {
            this.expect(true).toEqual(true);
          });
          this.waits(10);
          this.runs(function () {
            this.expect(true).toEqual(true);
          });
        });
        env.it('should be a third test', function() {
          this.runs(function () {
            this.expect(true).toEqual(true);
          });
        });
      });

      expect(suite.specs().length).toEqual(3);
    });
  });
});