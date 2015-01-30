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

describe("jasmine.util", function() {
  describe("extend", function () {
    it("should add properies to a destination object ", function() {
      var destination = {baz: 'baz'};
      jasmine.util.extend(destination, {
        foo: 'foo', bar: 'bar'
      });
      expect(destination).toEqual({foo: 'foo', bar: 'bar', baz: 'baz'});
    });

    it("should replace properies that already exist on a destination object", function() {
      var destination = {foo: 'foo'};
      jasmine.util.extend(destination, {
        foo: 'bar'
      });
      expect(destination).toEqual({foo: 'bar'});
      jasmine.util.extend(destination, {
        foo: null
      });
      expect(destination).toEqual({foo: null});
    });
  });

  describe("isArray_", function() {
    it("should return true if the argument is an array", function() {
      expect(jasmine.isArray_([])).toBe(true);
      expect(jasmine.isArray_(['a'])).toBe(true);
    });

    it("should return false if the argument is not an array", function() {
      expect(jasmine.isArray_(undefined)).toBe(false);
      expect(jasmine.isArray_({})).toBe(false);
      expect(jasmine.isArray_(function() {})).toBe(false);
      expect(jasmine.isArray_('foo')).toBe(false);
      expect(jasmine.isArray_(5)).toBe(false);
      expect(jasmine.isArray_(null)).toBe(false);
    });
  });
});
