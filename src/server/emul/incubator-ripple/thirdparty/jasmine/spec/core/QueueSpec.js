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

describe("jasmine.Queue", function() {
  it("should not call itself recursively, so we don't get stack overflow errors", function() {
    var queue = new jasmine.Queue(new jasmine.Env());
    queue.add(new jasmine.Block(null, function() {}));
    queue.add(new jasmine.Block(null, function() {}));
    queue.add(new jasmine.Block(null, function() {}));
    queue.add(new jasmine.Block(null, function() {}));

    var nestCount = 0;
    var maxNestCount = 0;
    var nextCallCount = 0;
    queue.next_ = function() {
      nestCount++;
      if (nestCount > maxNestCount) maxNestCount = nestCount;

      jasmine.Queue.prototype.next_.apply(queue, arguments);
      nestCount--;
    };

    queue.start();
    expect(maxNestCount).toEqual(1);
  });
});