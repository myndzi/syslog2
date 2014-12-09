'use strict';

var os = require('os'),
    net = require('net'),
    util = require('util'),
    dgram = require('dgram'),
    assert = require('assert'),
    Stream = require('stream'),
    Promise = require('bluebird');

Promise.promisifyAll(net.Socket.prototype, { suffix: '$' });
Promise.promisifyAll(dgram.Socket.prototype, { suffix: '$' });

var Joi = require('joi'),
    tags = require('language-tags');

var clone = require('clone');

var SYSLOG = require('./syslog-constants');

var BUNYAN = {
    FATAL: 60,
    ERROR: 50,
    WARN: 40,
    INFO: 30,
    DEBUG: 20,
    TRACE: 10
};

var TRANSPORTS = ['tcp', 'udp', 'unix', 'stream'];

function SyslogStream() {
    Stream.Writable.call(this, { objectMode: true });
    SyslogStream._parseOpts.apply(this, arguments);
    
    this._ending = null;
    this._destroyed = false;
    this.transport = null;
    this._getConnection().then(this.onConnect); // eager connect
}
util.inherits(SyslogStream, Stream.Writable);

SyslogStream._parseOpts = function(/*opts, cb*/) { // jshint maxcomplexity: 30, maxstatements: 30
    var i = arguments.length, args = new Array(i);
    while (i--) { args[i] = arguments[i]; }
    
    var opts = { };
    
    if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        opts = args[0];
    }

    if (typeof opts.onConnect !== 'function') {
        if (typeof args[args.length-1] === 'function') {
            opts.onConnect = args.pop();
        } else {
            opts.onConnect = function () { };
        }
    }
    
    // support flatter options when it's not confusing
    var connection = opts.connection || {
        type: opts.type,
        host: opts.host,
        port: opts.port,
        path: opts.path,
        stream: opts.stream
    };
    if (typeof connection.type !== 'string' || TRANSPORTS.indexOf(connection.type) === -1) {
        connection.type = (
            typeof connection.path === 'string' ? 'unix' :
            connection.stream && typeof connection.stream.write === 'function' ? 'stream' : 'udp'
        );
    }
    
    if (connection.type === 'stream') {
        if (!connection.stream || typeof connection.stream.write !== 'function') {
            throw new Error("Type 'stream' requires a writable stream");
        }
    } else if (connection.type === 'unix') {
        connection.path = (typeof connection.path === 'string' ? connection.path : '/dev/log');
    } else {
        connection.host = net.isIP(connection.host) ? connection.host :
            typeof connection.host === 'string' ? connection.host : '127.0.0.1';
        
        var port = parseInt(connection.port, 10);
        connection.port = (!isNaN(port) && port >= 0 && port < 65535) ? port : 514;
    }

    opts.connection = connection;

    opts.name = String(opts.name || process.title || (process.argv && process.argv[0]) || SYSLOG.NILVALUE);
    opts.msgId = String(opts.msgId || SYSLOG.NILVALUE);
    var PEN = parseInt(opts.PEN, 10);
    opts.PEN = isNaN(PEN) ? null : PEN;
    
    opts.facility = SYSLOG.FACILITY[typeof opts.facility === 'string' ? opts.facility.toUpperCase() : ''] || SYSLOG.FACILITY.LOCAL0;
    
    opts.hostname = opts.hostname || os.hostname() || SYSLOG.NILVALUE;
    
    var stream = this;
    Object.keys(opts).forEach(function (key) {
        stream[key] = opts[key];
    });
};

SyslogStream.prototype._getConnection = Promise.method(function () {
    if (this._destroyed) { throw new Error('Stream is destroyed'); }
    
    if (this._ending) {
        return this._ending.then(this._getConnection.bind(this));
    }
    
    if (this.transport === null) {
        this.transport = this._connect();
    }
    
    return this.transport;
});
SyslogStream.prototype._disconnect = Promise.method(function () {
    if (this._destroyed) { throw new Error('Stream is destroyed'); }

    var self = this;
    
    if (self.transport === null) {
        self._ending = null;
        return Promise.resolve();
    }
    
    if (self._ending !== null) { return self._ending; }
    
    self._ending = self.transport.then(function (stream) {
        switch (self.connection.type) {
            case 'stream':
                return Promise.promisify(stream.end, stream)();
            case 'udp':
                return stream.close();
            case 'tcp':
            case 'unix':
                return stream.end$();
        }
    }).then(function () {
        self._ending = null;
        self.transport = null;
    });
    
    return self._ending;
});

SyslogStream.prototype._connect = Promise.method(function () { // jshint maxcomplexity: 10
    if (this._destroyed) { throw new Error('Stream is destroyed'); }

    var self = this, stream,
        deferred = Promise.defer();

    switch (self.connection.type) {
        case 'stream':
            stream = self.connection.stream;
            deferred.resolve();
        break;
        
        case 'tcp':
            stream = net.createConnection({
                host: self.connection.host,
                port: self.connection.port
            }, deferred.callback);
        break;
        
        case 'unix':
            stream = net.createConnection({
                path: self.connection.path
            }, deferred.callback);
        break;
        
        case 'udp':
            stream = dgram.createSocket('udp4');
            deferred.resolve();
        break;
    }
    
    var disconnect = function () {
        if (!self._destroyed) { return self._disconnect(); }
    };
    
    stream.once('error', function (err) {
        self.emit('error', err);
        // tcp and unix streams will emit 'close' on their own
        if (self.connection.type === 'udp') { disconnect(); }
    });
    
    switch (self.connection.type) {
        case 'stream':
            stream.once('finish', disconnect);
        break;
        
        case 'udp':
        case 'tcp':
        case 'unix':
            stream.once('close', disconnect);
    }
    
    return deferred.promise.return(stream);
});

SyslogStream.prototype._writeToStream = Promise.method(function (buf, stream) {
    if (this._destroyed) { throw new Error('Stream is destroyed'); }

    switch (this.connection.type) {
        case 'stream':
            return stream.write(buf);
        case 'udp':
            return stream.send$(buf, 0, buf.length, this.connection.port, this.connection.host);
        case 'tcp':
        case 'unix':
            return stream.write$(buf);
    }
});

SyslogStream.prototype._write = function (_record, IGNORED, cb) {
    var record = clone(_record);
    
    var self = this,
        msg = self.buildMessage(record);
    
    var buf = new Buffer(msg+'\n');
    
    return (function retry(n) {
        if (n > 1) { return; }
        
        return self._getConnection()
        .then(function (stream) {
            // facilitate testing
            return self._writeToStream(buf, stream);
        })
        .catch(function (err) {
            self.emit('error', err);
            
            return self._disconnect().then(function () {
                // can't reconnect a provided stream
                if (self.connection.type === 'stream') { return; }
                
                return Promise.delay(100)
                    .then(retry.bind(null, n+1));
            });
        });
    })(0)
    .nodeify(cb);
};

SyslogStream.prototype.end = Promise.method(function () {
    if (this._destroyed) { throw new Error('Stream is destroyed'); }
        
    var self = this;
    
    var i = arguments.length, args = new Array(i);
    while (i--) { args[i] = arguments[i]; }
    
    var record, cb;
    if (typeof args[0] !== 'function') { record = args.shift(); }
    if (args.length && typeof args[args.length - 1] === 'function') { cb = args.pop(); }
    
    var promise = Promise.try(function () {
        if (!record) { return self._disconnect(); }
        
        return Promise.promisify(self.write, self)(record)
            .then(function () { return self._disconnect(); });
    });
    
    if (typeof cb === 'function') {
        promise.nodeify(cb);
    } else {
        return promise;
    }
});

SyslogStream.prototype.destroy = Promise.method(function () {
    if (this._destroyed) { throw new Error('Stream is destroyed'); }
    
    var self = this;
    
    self._destroyed = true;
    
    self.transport.then(function (stream) {
        switch (self.connection.type) {
            case 'udp':
                stream.close();
            break;
            
            case 'stream':
            case 'tcp':
            case 'unix':
                stream.end();
            break;
        }
    });
});

SyslogStream.prototype.formatTime = function (time) {
    var timestamp = new Date(time);
    if (isNaN(timestamp.getSeconds())) { return; }
    return timestamp.toISOString();
};

SyslogStream.prototype.formatLevel = function (level) { // jshint maxcomplexity: 10, maxstatements: 20
    if (typeof level === 'string') { level = BUNYAN[level.toUpperCase()]; }
    level = parseInt(level, 10);
    
    if (isNaN(level)) { level = BUNYAN.INFO; }
    
    if (level >= BUNYAN.FATAL) { return SYSLOG.LEVEL.EMERG; }
    if (level >= BUNYAN.ERROR) { return SYSLOG.LEVEL.ERR; }
    if (level >= BUNYAN.WARN)  { return SYSLOG.LEVEL.WARNING; }
    if (level >= BUNYAN.INFO)  { return SYSLOG.LEVEL.NOTICE; }
    if (level >= BUNYAN.DEBUG) { return SYSLOG.LEVEL.INFO; }
    /*if (level >= 0) /*TRACE*/  return SYSLOG.LEVEL.DEBUG;
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
// this function is destructive to the passed object ('record')
SyslogStream.prototype.buildHeader = function (record) { // jshint maxcomplexity: 20
    if (!record || Array.isArray(record) || typeof record !== 'object') {
        record = { };
    }
    
    var level = this.formatLevel(record.level),
        facility = this.facility;
    
    var priority = parseInt(facility * 8 + level, 10),
        version = parseInt(SYSLOG.VERSION, 10),
        timestamp = this.formatTime(record.time || new Date()) || SYSLOG.NILVALUE,
        hostname = record.hostname || this.hostname || SYSLOG.NILVALUE,
        appName = record.appName || this.name || SYSLOG.NILVALUE,
        msgId = record.msgId || this.msgId || SYSLOG.NILVALUE;
    
    var procId = parseInt(record.pid, 10);
    if (isNaN(procId) || procId < 0) { procId = process.pid || SYSLOG.NILVALUE; }
    
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

function _escape(str) { return String(str).replace(/["\]\\]/g, '\\$1'); }
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
    
    if (vals.length) {
        return util.format('[%s %s]', SDID, vals.join(' '));
    } else {
        return util.format('[%s]', SDID);
    }
}
var INVALID_SDID = /[^\u0020-\u007e]|[@=\]"\s]/;
// this function is destructive to the passed object ('record')
SyslogStream.prototype.formatStructuredData = function (record) { // jshint maxcomplexity: 10
    var structured = [ ], extra = { };
    
    var result = Joi.validate(record, SYSLOG.SDID, { convert: true, stripUnknown: true });
    if (!result.error && record.meta && record.meta.language) {
        if (!tags.check(record.meta.language)) {
            result.error = new Error('Invalid value for meta.language: ' + record.meta.language);
        }
    }
    
    if (!result.error) {
        // any structured data keys validated, remove it from the record
        Object.keys(result.value).forEach(function (SDID) {
            structured.push(_formatParams(SDID, record[SDID]));
            delete record[SDID];
        });
    }
    
    var PEN = parseInt(this.PEN, 10);
    if (!isNaN(PEN)) {
        Object.keys(record).forEach(function (SDID) {
            // don't encode [erroneous] defined structured data
            if (SYSLOG.SDID.hasOwnProperty(SDID)) { return; }
            
            // don't encode structured data with invalid SDID
            if (INVALID_SDID.test(SDID)) { return; }
            
            // don't encode things that aren't plain objects
            if (!record[SDID] ||
                record[SDID] instanceof Date ||
                typeof record[SDID] !== 'object') { return; }
            
            var val = record[SDID];
            delete record[SDID];
            
            SDID = util.format("%s@%d", SDID, PEN);
            
            structured.push(_formatParams(SDID, val));
        });    
    }
    
    if (result.error) {
        record.SD_VALIDATION_ERROR = result.error.toString();
    }
    Object.keys(record).forEach(function (key) {
        extra[key] = record[key];
    });
    
    return structured.join('');
};
// this function is destructive to the passed object ('record')
SyslogStream.prototype.buildMessage = function (record) { // jshint maxcomplexity: 15, maxstatements: 25
    var msg = '', header, structuredData = '';
    
    if (Buffer.isBuffer(record)) {
        record = record.toString();
    }
    if (typeof record === 'string') {
        try { record = JSON.parse(record); }
        catch (e) { }
    }
    
    if (record === void 0 || record === null) {
        return;
    } else if (record instanceof Date) {
        msg = record.toISOString();
    } else if (Array.isArray(record)) {
        msg = this.formatObject(record);
    } else if (typeof record === 'object') {
        if (record.msg) {
            msg = record.msg;
            delete record.msg;
        }
        
        header = this.buildHeader(record);
        structuredData = this.formatStructuredData(record);
        
        if (Object.keys(record).length) {
            msg += ' ' + this.formatObject(record);
        }
    } else {
        msg = record.toString();
    }
    
    if (!header) { header = this.buildHeader(); }

    msg = [header, structuredData, msg].filter(function (str) { return str.trim().length; }).join(' ');
    return msg;
};

module.exports = SyslogStream;
