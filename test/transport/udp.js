'use strict';

var SyslogStream = require('../../lib/syslog'),
    dgram = require('dgram');

var Promise = require('bluebird');

require('should-eventually');

describe('UDP transport', function () {
    var server, bindPort = 14243;
    
    beforeEach(function (done) {
        server = dgram.createSocket('udp4');
        server.bind(bindPort, done);
    });
    
    afterEach(function () {
        server.close();
    });
    
    it('should call the callback on connect', function (done) {
        var syslog = new SyslogStream({
            type: 'udp',
            port: bindPort
        }, function () {
            syslog.end(done);
        });
    });
    
    it('should return a promise when calling .end()', function () {
        var syslog = new SyslogStream({
            type: 'udp',
            port: bindPort
        });
        return syslog.end();
    });
    
    it('should support a callback when calling .end()', function (done) {
        var syslog = new SyslogStream({
            type: 'udp',
            port: bindPort
        });
        syslog.end(done);
    });
    
    it('should connect and pass messages', function (done) {
        var syslog = new SyslogStream({
            type: 'udp',
            port: bindPort
        });
        server.on('message', function (chunk) {
            syslog.end(done);
        });
        syslog.write('foo');
    });
    
    it('should emit an error event on socket errors', function (done) {
        var syslog = new SyslogStream({
            type: 'udp',
            port: bindPort
        });
        
        syslog.transport.then(function (stream) {
            stream.emit('error', 'foo');
        });
        syslog.once('error', function (err) {
            err.should.equal('foo');
            done();
        });
    });

    it('should attempt to reconnect on a write error', function (done) {
        var syslog = new SyslogStream({
            type: 'udp',
            port: bindPort
        });

        syslog.on('error', function (err) {
            // intentionally disabled
            //console.log('error:', err);
        });

        syslog._writeToStream = function () {
            delete syslog._writeToStream;
            return Promise.reject('retry');
        };
        
        server.once('message', done.bind(null, null));
        
        syslog.end('foo');
    });
    
    it('should give up trying to write after too many retries', function (done) {
        var syslog = new SyslogStream({
            type: 'udp',
            port: bindPort
        });

        syslog.on('error', function (err) {
            // intentionally disabled
            //console.log('error:', err);
        });

        syslog._writeToStream = function () {
            return Promise.reject('retry');
        };
        
        server.once('message', function () {
            done('Should not receive message');
        });
        
        syslog.end('foo', function () {
            delete syslog._writeToStream;
            done();
        });
    });
    
    it('should allow reopening the connection while it\'s closing', function (done) {
        var syslog = new SyslogStream({
            type: 'udp',
            port: bindPort
        });
        
        syslog.end();
        syslog.write('foo');
        
        server.once('message', function () {
            syslog.end();
            done();
        });
    });
    
    it('should reject when destroyed', function () {
        var syslog = new SyslogStream({
            type: 'udp',
            port: bindPort
        });
        
        return syslog.transport.then(function () {
            syslog.destroy();
            
            return Promise.each(
                ['_getConnection', '_connect', '_disconnect', '_writeToStream', 'destroy', 'end'],
                function (method) {
                    return syslog[method]().should.eventually.throw();
                }
            );
        });
    });
});
