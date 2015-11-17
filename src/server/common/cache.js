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

'use strict';

var clone = require('clone');
var Redis = require('ioredis');
var Promise = Promise || Redis.Promise; // ioredis exports bluebird promise
var conf = require('./conf-manager').conf;
var logger = require('./log-manager');

//Redis.Promise.onPossiblyUnhandledRejection(function(err) {
//    logger.warn('unhandled redis error : ', err);
//});

function Cache(typeName) {
    var cacheConf = conf.cache.types[typeName];
    var redisConf;
    if (!cacheConf) {
        throw new Error ('Invalid cache type : ' + typeName);
    }
    redisConf = clone(conf.cache.redis);
    redisConf.keyPrefix = cacheConf.prefix + ':';

    this.name = 'Cache( ' + typeName + ')';
    this._ttl = cacheConf.ttl;
    this._ttlGenerator = cacheConf.ttlGenerator;
    this._autoExtendTtl = cacheConf.autoExtendTtl;

    this.redis = new Redis(redisConf);
    this.redis.on('connect', this.createLoggingFunction('connect', logger.debug) );
    this.redis.on('reconnecting', this.createLoggingFunction('reconnecting', logger.info));
    this.redis.on('error', this.createLoggingFunction('error', logger.error));
    this.redis.on('end', this.createLoggingFunction('end', logger.error));
}

Cache.prototype = {
    createLoggingFunction : function(eventName, logFunc) {
        var that = this;
        return function(event) {
            var msg = that.name + ' event : '  + eventName;
            var args = [msg];
            if (event) {
                args.push(event);
            }
            logFunc.apply(null, args);
        };
    },

    // when callback is not specified
    //  then redis.set will return a promise
    write : function (key, value, callback) {
        var self = this;
        var ret = new Promise(function(resolve, reject) {
            var serialized = JSON.stringify(value);
            var ttl = self._getTtl(value);
            var detail = {
                key:key, value : serialized, ttl : ttl
            };
            logger.debug('saving to ' + self.name, detail);
            var promise = null;
            if ( typeof(ttl) === 'number') {
                if (ttl <= 0 ) {
                    return reject(new Error(self.name + ' cannot write value with negative TTL ' + ttl));
                }
                promise =  self.redis.set(key, serialized, 'EX', ttl);
            } else {
                promise = self.redis.set(key, serialized);
            }
            promise.then( function(value) {
                resolve(value);
            }).catch( function(err) {
                reject(err);
            });
        });
        if (typeof(callback) === 'function') {
            ret.then( function(value) {
                callback(null, value);
            }).catch( function(err) {
                callback(err);
            });
            ret = undefined;
        }
        return ret;
    },

    read : function (key, callback) {
        var self = this; 
        var ret = new Promise(function(resolve, reject) {
            self.redis.get(key).then( function(value) {
                var deserialized = value;
                if(typeof(value) === 'object') {
                    deserialized = JSON.parse(value);
                }
                logger.debug(self.name + ' read', { key : key, value : value});
                if (deserialized, self._autoExtendTtl) {
                    var ttl = self._getTtl(deserialized);
                    self.redis.expire(key, ttl, function(err) {
                        if (err) {
                            logger(self.name + ' could not extend ttl of ' + key);
                        } else {
                            logger.debug(self.name + ' has extended ttl ' + key + ' , ' + ttl);
                        }
                    });
                }
                resolve(deserialized);
            }).catch(function(err) {
                logger.error(self.name + ' read fail - ' + key, err);
                reject(err);
            });
        });
        if (typeof(callback) === 'function') {
           ret.then( function(value) {
               callback(null, value);
           }).catch( function(err) {
               callback(err);
           });
           ret = undefined;
        }
        return ret;
    },

    remove : function(key, callback) {
        var self = this;
        var ret = new Promise( function(resolve, reject) {
            self.redis.del(key).then(function(value) {
                logger.debug(self.name + ' deleted', { key : key, value : value });
                resolve(value);
            }).catch(function(err) {
                logger.error(self.name + ' remove fail - ' + key, err);
                reject(err);
            });
        });
        if (typeof(callback) === 'function') {
            ret.then( function(value) {
                callback(null, value);
            }).catch( function(err) {
                callback(err);
            });
            ret = undefined;
        }
        return ret;
    },

    _getTtl: function(value) {
        if (this._ttlGenerator) {
            return this._ttlGenerator(value);
        }
        if (this._ttl) {
            return this._ttl;
        }
        return -1;
    }
};

// we may enable monitor connection to redis server
// But it's silly to activate monitoring in every process.
// so, monitoring function should be manually caleld by some dedicated unit service
module.exports = {
    createCache: function(type) {
        return new Cache(type);
    },
    enableMonitor : function() {
        var redis = new Redis();
        redis.monitor(function(err, monitor) {
            if (err) {
                logger.error('cannot create monitor');
            } else {
                monitor.on('monitor', function (time, args) {
                    logger.debug("cache monitor : " + time, args );
                });
            }
        });
    }
};
