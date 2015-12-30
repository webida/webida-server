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
 * @file Normal file system
 * @since 1.4.0
 * @author hyunseok.kil@samsung.com
 * @extends Container
 * @todo It's not tested yet.
 */

'use strict';

var util = require('util');
var Container = require('./Container');

function NoneContainer() {}
util.inherits(NoneContainer, Container);
NoneContainer.create = NoneContainer.super_.create;
NoneContainer.destroy = NoneContainer.super_.destroy;
module.exports = NoneContainer;