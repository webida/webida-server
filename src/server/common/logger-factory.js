'use strict';

var path = require('path');
var util = require ('util');
var _ = require('lodash');

var winston = require('winston');
var Syslog = require('winston-syslog').Syslog;

// app_name option for winston-syslog will be overrided by server internal code
var defaultLoggerConfigs = {
    // in most case, top-levels _rootLoggers
    server: {
        level:'info',   // should be one of syslog level - debug, info, notice, warning, error, ... fatal
        facility:'local7',
        protocol:'unix',
        path:'/dev/log',
        humanReadableUnhandledException : true,
        handleExceptions : true
    },
    access : {
        level:'debug',   // every access log will be logged as 'info' level. do not set higher level than info
        facility:'local6',
        protocol:'unix',
        path:'/dev/log',
        json:true
    },

    // there can be many 'server/_request/$reqid'
    // without this config, all of them has parent of 'server' and will be named as 'request/$reqId'
    // to controll the log levels of all request logger can be handled here
    'server/_request' : {
        tags : { reqId : 'unknown' }, // tags will be overrided by children
        level : 'debug'
    }
};

// module variable
var loggerConfigs = defaultLoggerConfigs;

class WebidaTransport extends winston.Transport {
    constructor(parentTransport, options) {
        let tags = options.tags;
        delete options.tags;
        super(options);
        options.tags = tags;

        this.name = 'WebidaTransport';
        this._parentTransport= parentTransport;
        this._tags = tags;
    }

    log(level, msg, meta, callback) {

        // TODO : we have to add tags to metadata everytime
        //  set all tags inherited from ancestors in leaf transport
        if (this._tags) {
            meta = meta || {};
            _.defaults(meta, this._tags);
        }
        this._parentTransport.log(level, msg, meta, callback);
        // we don't need to invoke callback here. parent will do.
    }
}

// WebidaLogger may not
class WebidaLogger extends winston.Logger {

    constructor(name, rawOptions, parentLogger) {
        function _prepare (name, rawOptions, parentLogger) {
            let fullName = (parentLogger ? parentLogger.fullName + '/' : '') + name;
            let options = _.defaults({}, rawOptions || {}, loggerConfigs[fullName]);
            let level = options.level || (parentLogger ? parentLogger.level : 'debug') || 'debug' ;

            delete options.level;
            /* jshint -W106 */
            options.app_name = (global.app ? global.app.name : process.argv[1]) || 'webida';

            let transport = parentLogger ?
                new WebidaTransport(parentLogger._transport, options) :
                new Syslog(options);

            return { fullName, level, transport };
        }
        let prepared = _prepare(name, rawOptions, parentLogger);

        super({
            transports: [prepared.transport],
            levels: winston.config.syslog.levels,
            level: prepared.level
        });

        // 'this' is not available until super() is called. (maybe V8 bug or language spec)
        this.name = name;
        this.fullName = prepared.fullName;
        this.childLoggers = {};
        this.level = prepared.level;
        this._parentLogger = parentLogger;
        this._transport = prepared.transport;
        if (parentLogger) {
            parentLogger.childLoggers[name] = this;
        }
    }

    // for compatibilty with 'default log methods' from default log levels
    warn() {
        this.warning.apply(this, arguments);
    }

    trace() {
        // TODO : add stacktrace to arguments.
        //  - should find a way to distingush metadata from format argeument
        this.debug.apply(this, arguments);
    }

    close() {
        if (this._parentLogger) {
            // FIXME : use event, not a direct reference
            delete this._parentLogger.childLoggers[this.name];
        }
        _.forOwn(this.childLoggers, (logger => logger.close()));
        // we don't need to delete this.childLoggers[child-name] for logger.close() will do it.
        super.close();
    }
}

class LoggerFactory {
    constructor() {
        this._rootLoggers = {};
        this.defaultLogger = null;
    }

    _loadLogConfig(logConfigPath) {
        try {
            loggerConfigs =  require(logConfigPath);
        } catch (e) {
            // do nothing. use default config object as initialized
        }
    	return loggerConfigs;
    }

    _findRootLogger(loggerName) {
        let rootLoggerName = loggerName;
        const pos = loggerName.indexOf('/');
        if (pos > 0) {
            rootLoggerName = loggerName.substring(0, pos);
        }
        return this._rootLoggers[rootLoggerName];
    }

    // this method returns 'leaf' logger in hierachy
    // if a logger is missed, then creates. given options object is applied to leaf logger only
    // (all other loggers are controlled by configuration)
    _walkWithHierachy(loggerName, options) {
        const names = loggerName.split('/');
        let logger = null;
        for (var i=0; i < names.length; i++) {
            const isLeaf = (i === names.length-1);
            const opt = isLeaf ? options : undefined;
            const name = names[i];
            if (i === 0) {
                logger = this._findRootLogger(name);
                if (!logger) {
		    logger = new WebidaLogger(name, opt); 
                    this._rootLoggers[name] = logger; 
                }
            } else {
                let parent = logger;
                // constructor assigns new logger to parent.childLoggers
                logger = parent.childLoggers[name] || new WebidaLogger(name, opt, parent);
            }
        }
        return logger;
    }

    init(defaultLoggerName, configPath) {
        let confPath = configPath || path.normalize('../conf/log.js');
        let loggerConfig = this._loadLogConfig(confPath);

        // we don't want to parent loggers to be created after child.
        // simple sorting will prevent that accident.
        let loggerNames = Object.keys(loggerConfig).sort();
        loggerNames.forEach( (loggerName) => {
            this._walkWithHierachy(loggerName);
        });

        defaultLoggerName = defaultLoggerName || 'server';
        this.defaultLogger = this._rootLoggers[defaultLoggerName];
        if (!this.defaultLogger) {
            let err = new Error('log configuration has no default logger, ' + defaultLoggerName);
            console.error(err);
            throw err;
        }
    }

    // modules usually requires a logger without default logger name prefix
    //  for example, auth.js may require 'auth' instead of 'server/auth'
    // loggerName should not start with '/' and length should be longer than 1
    getLogger(loggerName, options) {
    	if (!loggerName) {
            return this.defaultLogger;
        }
        this._validateLoggerName(loggerName);
        let logger = this._rootLoggers[loggerName];
        if (!logger)  {
            let rootLogger = this._findRootLogger(loggerName);
            if (!rootLogger) {
                loggerName = this.defaultLogger.name + '/' + loggerName;
            }
            logger = this._walkWithHierachy(loggerName, options);
        }
        return logger;
    }

    ungetLogger(loggerName) {
        var logger = this.getLogger(loggerName);
        if (logger) {
            logger.close();
        }
    }

    _validateLoggerName(loggerName) {
        if(!loggerName || loggerName[0] === 'undefined'||
            loggerName.length < 2 ||
            loggerName[0] === '/' ||
            loggerName[loggerName.length-1] === '/') {
            throw new Error('Invalid Logger Name ' + loggerName);
        }
    }
}

var factory = new LoggerFactory();
factory.init('server');
factory.init = function() {
    throw Error ('do not initialize singleton class, LoggerFactory, again');
};

function rewriteConsoleMethods() {
     function formatArgs(args){
        return [util.format.apply(util.format, Array.prototype.slice.call(args))];
    }
    let logger = factory.defaultLogger;

    console.log = function(){
        logger.debug.apply(logger, formatArgs(arguments));
    };
    console.info = function(){
        logger.info.apply(logger, formatArgs(arguments));
    };
    console.warn = function(){
        logger.warn.apply(logger, formatArgs(arguments));
    };
    console.error = function(){
        logger.error.apply(logger, formatArgs(arguments));
    };
    console.debug = function(){
        logger.debug.apply(logger, formatArgs(arguments));
    };
}

if (process.env.NODE_ENV === 'production') {
    rewriteConsoleMethods();
}

module.exports = factory;
