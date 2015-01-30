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

describe("MockClock", function () {

  beforeEach(function() {
    jasmine.Clock.useMock();    
  });

  describe("setTimeout", function () {
    it("should mock the clock when useMock is in a beforeEach", function() {
      var expected = false;
      setTimeout(function() {
        expected = true;
      }, 30000);
      expect(expected).toBe(false);
      jasmine.Clock.tick(30001);
      expect(expected).toBe(true);
    });
  });

  describe("setInterval", function () {
    it("should mock the clock when useMock is in a beforeEach", function() {
      var interval = 0;
      setInterval(function() {
        interval++;
      }, 30000);
      expect(interval).toEqual(0);
      jasmine.Clock.tick(30001);
      expect(interval).toEqual(1);
      jasmine.Clock.tick(30001);
      expect(interval).toEqual(2);
      jasmine.Clock.tick(1);
      expect(interval).toEqual(2);
    });
  });

  it("shouldn't complain if you call jasmine.Clock.useMock() more than once", function() {
    jasmine.Clock.useMock();
  });
});
