'use strict';

var os = require('os'),
    net = require('net'),
    util = require('util'),
    dgram = require('dgram'),
    assert = require('assert'),
    Stream = require('stream');

var Joi = require('joi'),
    tags = require('language-tags');

var SYSLOG = {
    VERSION: 1,
    NILVALUE: '-',
    LEVEL: {
        EMERG: 0,
        ALERT: 1,
        CRIT: 2,
        ERR: 3,
        WARNING: 4,
        NOTICE: 5,
        INFO: 6,
        DEBUG: 7
    },
    FACILITY: {
        KERN: 0,
        USER: 1,
        MAIL: 2,
        DAEMON: 3,
        AUTH: 4,
        SYSLOG: 5,
        LPR: 6,
        NEWS: 7,
        UUCP: 8,
        CLOCK: 9,
        AUTHPRIV: 10,
        FTP: 11,
        NTP: 12,
        LOG_AUDIT: 13,
        LOG_ALERT: 14,
        CRON: 15,
        LOCAL0: 16,
        LOCAL1: 17,
        LOCAL2: 18,
        LOCAL3: 19,
        LOCAL4: 20,
        LOCAL5: 21,
        LOCAL6: 22,
        LOCAL7: 23
    },
    SDID: {
        timeQuality: Joi.object().keys({
            tzKnown: Joi.number().integer().min(0).max(1),
            isSynced: Joi.number().integer().min(0).max(1),
            syncAccuracy: Joi.number().integer().min(0)
                .when('isSynced', { is: 0, then: Joi.any().forbidden() })
        }),
        origin: Joi.object().keys({
            ip: [
                Joi.string().hostname(),
                Joi.array().includes(
                    Joi.string().hostname()
                )
            ],
            enterpriseId: Joi.string().regex(/^\d+(\.\d+)*$/),
            software: Joi.string().min(1).max(48),
            swVersion: Joi.string().min(1).max(48)
        }),
        meta: Joi.object().keys({
            sequenceId: Joi.number().integer().min(1).max(2147483647),
            sysUpTime: Joi.number().integer().min(0),
            language: Joi.string() //fuckin Joi. no custom validators herp derp
        })
    }
};

var BUNYAN = {
    FATAL: 60,
    ERROR: 50,
    WARN: 40,
    INFO: 30,
    DEBUG: 20,
    TRACE: 10
};

var TRANSPORTS = ['tcp', 'udp'];

module.exports = SyslogStream;

function SyslogStream(opts) {
    opts = opts || { };
    
    Stream.Writable.call(this, { objectMode: true });
    
    this.name = opts.name || process.title || process.argv[0];
    this.msgId = opts.msgId || 'bunyan';
    this.PEN = opts.PEN || null;
    
    this.facility = (opts.facility || 'local1').toUpperCase();
    
    this.host = opts.host || '127.0.0.1';
    this.port = opts.port || 514;

    this.hostname = opts.hostname || os.hostname();

    this.transport = (
        opts.transport && TRANSPORTS.indexOf(opts.transport.toLowerCase()) > -1 ?
        opts.transport : 'udp'
    );
}
util.inherits(SyslogStream, Stream.Writable);

SyslogStream.createConnection = function (opts, cb) {
    if (typeof opts === 'function') {
        cb = opts;
        opts = { };
    }
    
    var stream = new SyslogStream(opts);
    
    if (typeof cb === 'function') {
        stream.on('connect', cb);
    }
    
    stream.connect();
};

SyslogStream.prototype.connect = function (cb) {
    var self = this,
        socket;

    self._onClose = self.end.bind(self);
    
    switch (self.transport) {
        case 'udp':
            self.socket = dgram.createSocket('udp4');
            self.emit('connect', self);
        break;
        case 'tcp':
            self.socket = net.createConnection(
                self.port,
                self.host,
                self.emit.bind(self, 'connect', self)
            );
        break;
    }
    
    self.socket.on('error', self.emit.bind(self, 'error'));
    self.socket.on('close', self._onClose);
};

SyslogStream.prototype._write = function (record, IGNORED, cb) {
    var buf = new Buffer(this.buildMessage(record)+'\n');
    
    console.log(this.port, this.host, buf.toString());
    switch (this.transport) {
        case 'udp': return this.socket.send(buf, 0, buf.length, this.port, this.host, cb);
        case 'tcp': return this.socket.write(buf, cb);
        default:
            throw new Error('No transport??');
    }
};

SyslogStream.prototype.end = function () {
    var self = this;
    
    var i = arguments.length, args = new Array(i);
    while (i--) { args[i] = arguments[i]; }
    
    var record, cb = function () { };
    if (typeof args[0] !== 'function') { record = args.shift(); }
    if (args.length && typeof args[args.length - 1] === 'function') { cb = args.pop(); }
    
    function _cb(err) {
        if (err) { return cb(err); }
        
        self.socket.removeListener('close', self._onClose);
        
        switch (self.transport) {
            case 'udp':
                self.socket.close();
                cb();
            break;
            case 'tcp':
                self.socket.end(cb);
            break;
        }
    }
    
    if (record) { this.write(record, _cb); }
    else { _cb(); }
};

SyslogStream.prototype.formatTime = function (time) {
    var timestamp = new Date(time);
    if (isNaN(timestamp.getSeconds())) { return; }
    return timestamp.toISOString();
};

SyslogStream.prototype.formatLevel = function (level) {
    if (level >= 60) { return SYSLOG.LEVEL.EMERG; }
    if (level >= 50) { return SYSLOG.LEVEL.ERROR; }
    if (level >= 40) { return SYSLOG.LEVEL.WARNING; }
    if (level >= 30) { return SYSLOG.LEVEL.NOTICE; }
    if (level >= 20) { return SYSLOG.LEVEL.INFO; }
    if (level >= 0)  { return SYSLOG.LEVEL.DEBUG; }
};

SyslogStream.prototype.formatObject = function (obj) {
    var seen = [ ];
    
    return JSON.stringify(obj, function (key, val) {
        if (!val || typeof val !== 'object') { return val; }
        if (seen.indexOf(val) > -1) { return '[Circular]'; }
        seen.push(val);
        return val;
    });
};

// HEADER = PRI VERSION SP TIMESTAMP SP HOSTNAME SP APP-NAME SP PROCID SP MSGID
SyslogStream.prototype.buildHeader = function (record) {
    if (!record || Array.isArray(record) || typeof record !== 'object') {
        record = { };
    }
    
    var level = this.formatLevel(BUNYAN[record.level] || BUNYAN.INFO),
        facility = SYSLOG.FACILITY[this.facility] || SYSLOG.FACILITY.LOCAL0;
    
    var priority = parseInt(facility * 8 + level, 10),
        version = parseInt(SYSLOG.VERSION, 10),
        timestamp = this.formatTime(record.time || new Date()) || SYSLOG.NILVALUE,
        hostname = record.hostname || this.hostname || SYSLOG.NILVALUE,
        appName = record.appName || this.name || SYSLOG.NILVALUE,
        procId = record.pid || process.pid || SYSLOG.NILVALUE,
        msgId = record.msgId || this.msgId || SYSLOG.NILVALUE;
    
    assert(!isNaN(priority));
    assert(priority >= 0);
    assert(priority <= 191);
    
    assert(!isNaN(version));
    assert(version >= 1);
    assert(version <= 999);
    
    // remove used fields
    
    ['time', 'hostname', 'appName', 'pid', 'msgId', 'level']
    .forEach(function (key) { if (record.hasOwnProperty(key)) { delete record[key]; } });
    
    return util.format('<%d>%d %s %s %s %s %s', priority, version, timestamp, hostname, appName, procId, msgId);
};

function _escape(str) { return str.replace(/["\]\\]/g, '\\$1'); }
function _formatParams(SDID, val) {
    var vals = Object.keys(val)
    .reduce(function (ret, SDPARAM) {
        var items = val[SDPARAM];
        if (!Array.isArray(items)) { items = [ val[SDPARAM] ]; }
        
        items.forEach(function (item) {
            ret.push(util.format('%s="%s"', _escape(SDPARAM), _escape(item)));
        });
        
        return ret;
    }, [ ]);
    
    
    return util.format('[%s %s]', SDID, vals.join(' '));
}
var INVALID_SDID = /[^\u0020-\u007e]|[@=\]"\s]/
SyslogStream.prototype.formatStructuredData = function (record) {
    var structured = [ ];
    
    Joi.validate(record, SYSLOG.SDID, { stripUnknown: true }, function (err, value) {
        if (err) { throw err; }

        Object.keys(value).forEach(function (SDID) {
            structured.push(_formatParams(SDID, record[SDID]));
            delete record[SDID];
        });
    });
    
    var PEN = parseInt(this.PEN, 10);
    if (PEN) {
        Object.keys(record).forEach(function (SDID) {
            assert(!INVALID_SDID.test(SDID));
            assert(!isNaN(PEN));
            
            var val = record[SDID];
            
            SDID = util.format("%s@%d", SDID, PEN);
            
            structured.push(_formatParams(SDID, val));
            delete record[SDID];
        });    
    }
    
    return structured.join('');
};
SyslogStream.prototype.buildMessage = function (record) {
    var msg = '', header, structuredData = '';
    
    if (record == null) {
        return;
    } else if (Array.isArray(record)) {
        msg = JSON.stringify(record);
    } else if (typeof record === 'object') {
        if (record.msg) {
            msg = record.msg;
            delete record.msg;
        }
        
        header = this.buildHeader(record);
        structuredData = this.formatStructuredData(record);
        
        if (Object.keys(record).length) {
            msg += ' '+this.formatObject(record);
        }
        
    } else {
        msg = record.toString();
    }
    
    if (!header) { header = this.buildHeader(); }

    msg = util.format('%s %s %s', header, structuredData, msg).trim();
    return msg;
};
SyslogStream.prototype.formatRecord = function (record) {
    if (!record || Array.isArray(record) || typeof record !== 'object') {
        record = { };
    }
    
    var header = this.buildHeader(record),
        message = this.buildMessage(record);
    
    var hostname, level, msg, time, facility, appname, procid;
    
    if (Buffer.isBuffer(record)) {
        // expensive, but not expected
        msg = record.toString('utf8');
    } else if (typeof record === 'object') {
        hostname = record.hostname;
        level = record.level.toUpperCase();
        time = record.time;
        msg = this.formatObject(record, ['hostname', 'level', 'time']);
    } else if (typeof record === 'string') {
        msg = record;
    } else {
        throw new TypeError('record (Object) required');
    }

    time = this.formatTime(time);
    hostname = hostname || this.HOSTNAME || SYSLOG.NILVALUE;
    level = this.formatLevel(level !== undefined ? BUNYAN[level] : BUNYAN.INFO);
    facility = SYSLOG.FACILITY[this.facility];
    appname = this.name || SYSLOG.NILVALUE;
    procid = process.pid || SYSLOG.NILVALUE;
    
    return util.format(
        '<%d>%d %s %s %s[%d]: %s',
        (facility * 8 + level),
        SYSLOG.VERSION,
        time,
        hostname,
        appname,
        procid,
        msg
    );
};
