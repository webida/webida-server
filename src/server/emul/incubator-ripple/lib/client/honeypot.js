/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */

var noop = function () {};

module.exports = {
    monitor: function (context, target) {

        var setup = function (get, set) {
            set = set || noop;

            context.__defineGetter__(target, noop);
            context.__defineSetter__(target, function (value) {
                context.__defineGetter__(target, get);
                set(value);
            });
        };

        return {
            andReturn: function (value) {
                setup(function () {
                    return value;
                });
            },
            andRun: function (get, set) {
                setup(get, set);
            }
        };
    }
};
