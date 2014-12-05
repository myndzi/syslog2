'use strict';

var SyslogStream = require('../../lib/syslog'),
    Stream = require('stream');

var Promise = require('bluebird');

require('should-eventually');

describe('Node stream transport', function () {
    var stream;
    
    beforeEach(function () {
        stream = new Stream.PassThrough();
    });
    
    // dunno why this stalls, meanwhile gonna leak some memory in these tests
    /*
    afterEach(function (done) {
        stream.end(done);
    });
    */
    
    it('should call the callback on connect', function (done) {
        var syslog = new SyslogStream({
            type: 'stream',
            stream: stream
        }, function () {
            syslog.end(done);
        });
    });
    
    it('should return a promise when calling .end()', function () {
        var syslog = new SyslogStream({
            type: 'stream',
            stream: stream
        });
        return syslog.end();
    });
    
    it('should support a callback when calling .end()', function (done) {
        var syslog = new SyslogStream({
            type: 'stream',
            stream: stream
        });
        syslog.end(done);
    });
    
    it('should connect and pass messages', function (done) {
        var syslog = new SyslogStream({
            type: 'stream',
            stream: stream
        });
        stream.once('data', function (chunk) {
            syslog.end(done);
        });
        
        syslog.write('foo');
    });
    
    it('should emit an error event on socket errors', function (done) {
        var syslog = new SyslogStream({
            type: 'stream',
            stream: stream
        });
        
        syslog.transport.then(function (stream) {
            stream.emit('error', 'foo');
            stream.end();
        });
        
        syslog.once('error', function (err) {
            err.should.equal('foo');
            done();
        });
    });

    it('should NOT attempt to reconnect on a write error', function (done) {
        var syslog = new SyslogStream({
            type: 'stream',
            stream: stream
        });

        syslog.once('error', function (err) {
            // intentionally disabled
            //console.log('error:', err);
        });

        var count = 0;
        syslog._writeToStream = function () {
            if (count++) {
                done(new Error('Should not re-call _writeToStream'));
            }
            return Promise.reject('retry');
        };
        
        stream.once('data', function () {
            done('Should not receive message');
        });
  
        syslog.end('foo', function () {
            delete syslog._writeToStream;
            done();
        });
    });
    
    it('should give up trying to write after too many retries', function (done) {
        var syslog = new SyslogStream({
            type: 'stream',
            stream: stream
        });

        syslog.on('error', function (err) {
            // intentionally disabled
            //console.log('error:', err);
        });

        syslog._writeToStream = function () {
            return Promise.reject('retry');
        };
        
        stream.once('data', function () {
            done('Should not receive message');
        });
        
        syslog.end('foo', function () {
            delete syslog._writeToStream;
            done();
        });
    });
    
    it('should reject when destroyed', function () {
        var syslog = new SyslogStream({
            type: 'stream',
            stream: stream
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