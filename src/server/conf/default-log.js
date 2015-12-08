
var loggerConfigs = {
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


module.exports = loggerConfigs; 

