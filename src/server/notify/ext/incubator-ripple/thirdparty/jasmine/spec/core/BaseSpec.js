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

describe("base.js", function() {
  describe("jasmine.MessageResult", function() {
    it("#toString should pretty-print and concatenate each part of the message", function() {
      var values = ["log", "message", 123, {key: "value"}, "FTW!"];
      var messageResult = new jasmine.MessageResult(values);
      expect(messageResult.toString()).toEqual("log message 123 { key : 'value' } FTW!");
    });
  });

  describe("jasmine.log", function() {
    it("should accept n arguments", function() {
      spyOn(jasmine.getEnv().currentSpec, 'log');
      jasmine.log(1, 2, 3);
      expect(jasmine.getEnv().currentSpec.log).toHaveBeenCalledWith(1, 2, 3);
    });
  });

  describe("jasmine.getGlobal", function() {
    it("should return the global object", function() {
      var globalObject = (function() {
        return this;
      })();

      expect(jasmine.getGlobal()).toBe(globalObject);
    });
  });
});
