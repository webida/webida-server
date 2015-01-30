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

/**
 * A block which waits for some condition to become true, with timeout.
 *
 * @constructor
 * @extends jasmine.Block
 * @param {jasmine.Env} env The Jasmine environment.
 * @param {Number} timeout The maximum time in milliseconds to wait for the condition to become true.
 * @param {Function} latchFunction A function which returns true when the desired condition has been met.
 * @param {String} message The message to display if the desired condition hasn't been met within the given time period.
 * @param {jasmine.Spec} spec The Jasmine spec.
 */
jasmine.WaitsForBlock = function(env, timeout, latchFunction, message, spec) {
  this.timeout = timeout || env.defaultTimeoutInterval;
  this.latchFunction = latchFunction;
  this.message = message;
  this.totalTimeSpentWaitingForLatch = 0;
  jasmine.Block.call(this, env, null, spec);
};
jasmine.util.inherit(jasmine.WaitsForBlock, jasmine.Block);

jasmine.WaitsForBlock.TIMEOUT_INCREMENT = 10;

jasmine.WaitsForBlock.prototype.execute = function(onComplete) {
  if (jasmine.VERBOSE) {
    this.env.reporter.log('>> Jasmine waiting for ' + (this.message || 'something to happen'));
  }
  var latchFunctionResult;
  try {
    latchFunctionResult = this.latchFunction.apply(this.spec);
  } catch (e) {
    this.spec.fail(e);
    onComplete();
    return;
  }

  if (latchFunctionResult) {
    onComplete();
  } else if (this.totalTimeSpentWaitingForLatch >= this.timeout) {
    var message = 'timed out after ' + this.timeout + ' msec waiting for ' + (this.message || 'something to happen');
    this.spec.fail({
      name: 'timeout',
      message: message
    });

    this.abort = true;
    onComplete();
  } else {
    this.totalTimeSpentWaitingForLatch += jasmine.WaitsForBlock.TIMEOUT_INCREMENT;
    var self = this;
    this.env.setTimeout(function() {
      self.execute(onComplete);
    }, jasmine.WaitsForBlock.TIMEOUT_INCREMENT);
  }
};
