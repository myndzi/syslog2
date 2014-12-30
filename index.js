'use strict';

var PassThrough = require('stream').PassThrough,
    inherits = require('util').inherits;

var SyslogStream = require('syslog-streams2'),
    UnixStream = require('unix-socket-streams2'),
    UdpStream = require('udp-streams2'),
    TcpStream = require('net').Socket;

var clone = require('clone');

function Syslog(opts) {
    PassThrough.call(this, { objectMode: true });
    
    this.retrying = false;
    this.shuttingDown = false;
    this.pause();
    
    Syslog.parseArgs.call(this, opts);
};
inherits(Syslog, PassThrough);

Syslog.create = function (opts, cb) {
    if (typeof opts === 'function') {
        cb = opts;
        opts = null;
    }

    var stream = new Syslog(opts);
    stream.connect(cb);
    return stream;
};

Syslog.parseArgs = function (opts) {
    opts = clone(opts || { });
    
    var conn = opts.connection || { };
    delete opts.connection;
    
    // for unix domain sockets
    this.path = conn.path || '/dev/log';
    
    // for tcp/udp sockets
    this.host = conn.host || '127.0.0.1';
    this.port = conn.port || 514;
    
    this.type = conn.type || (conn.path ? 'unix' : 'udp');
    
    this.syslog = new SyslogStream(opts);
    this.stream = null;
    this.pipe(this.syslog);
    
    var recon = (opts.reconnect && typeof opts.reconnect === 'object') ? opts.reconnect : { };
    delete opts.reconnect;
    
    var num;
    if (!recon.hasOwnProperty('enabled')) { recon.enabled = false; }
    
    num = parseInt(recon.maxTries, 10);
    recon.maxTries = !isNaN(num) ? num : Infinity;
    
    num = parseInt(recon.initialDelay, 10);
    recon.initialDelay = !isNaN(num) ? num : 100;
    
    num = parseInt(recon.delayFactor, 10);
    recon.delayFactor = !isNaN(num) ? num : 1.2;
    
    num = parseInt(recon.maxDelay, 10);
    recon.maxDelay = !isNaN(num) ? num : 30*1000;
    
    this.reconnect = recon; 
};

Syslog.prototype.end = function () {
    this.shuttingDown = true;
    Syslog.super_.prototype.end.apply(this, arguments);
};
Syslog.prototype.connect = function (cb) {
    var self = this;
    
    switch (self.type) {
        case 'unix':
            self.stream = new UnixStream();
            self.stream.connect(self.path);
        break;
        
        case 'tcp':
            self.stream = new TcpStream();
            self.stream.connect(self.port, self.host);
        break;
        
        case 'udp':
            self.stream = new UdpStream();
            self.stream.connect(self.port, self.host);
        break;
        
        default:
            cb(new Error('Unsupported transport type: ' + self.type));
        break;
    }
    
    var onConnect, onClose, onError, cleanup;
    
    var connected = false;
    
    onConnect = function () {
        connected = true;
        
        self.syslog.pipe(self.stream);
        self.resume();
        
        if (typeof cb === 'function') { cb(); }
        else { self.emit('connect'); }
    };
    onClose = function () {
        cleanup();
    };
    onError = function (err) {
        // if it was a connection error, trigger the callback
        if (!connected && typeof cb === 'function') {
            cb(err);
        }

        self.emit('warn', err);
        cleanup();
    };
    cleanup = function () {
        self.pause();
        self.unpipe(self.stream);
        
        self.stream.removeListener('error', onError);
        self.stream.removeListener('connect', onConnect);
        self.stream.removeListener('close', onClose);
        
        self.stream = null;
        
        self.maybeReconnect();
    };
    
    // each stream only errors once, so we use '.once' instead of '.on' here
    // even though we ourselves may emit multiple errors
    self.stream.once('error', onError);
    self.stream.once('connect', onConnect);
    self.stream.once('close', onClose);
    
    return self;
};
Syslog.prototype.maybeReconnect = function () {
    var self = this;
    
    if (self.stream) { return; }
    
    if (self.retrying || self.shuttingDown) { return; }
    
    var recon = self.reconnect;
    if (!recon.enabled) {
        self.emit('error', new Error('Disconnected, reconnect disabled'));
        return;
    }
    
    (function retry(n, dly) {
        self.retrying = true;

        if (self.shuttingDown) { return; }
        
        if (n >= recon.maxTries) {
            self.emit('error', new Error('Unable to reconnect, reached max retries'));
            return;
        }
        
        setTimeout(function () {
            self.connect(function (err) {
                if (err) {
                    return retry(n+1, Math.min(recon.maxDelay, dly * recon.delayFactor));
                }
                self.retrying = false;
            });
        }, dly);
    })(0, recon.initialDelay);
};

module.exports = Syslog;
