'use strict';

var SyslogStream = require('../../lib/syslog'),
    fs = require('fs'),
    net = require('net');

var Promise = require('bluebird');

require('should-eventually');

describe('Unix socket transport', function () {
    var server, path = '/tmp/syslog-test.log';
    
    beforeEach(function (done) {
        try { fs.unlinkSync(path); }
        catch (e) { }
        
        server = net.createServer();
        server.listen(path, done);
    });
    
    afterEach(function (done) {
        try { fs.unlinkSync(path); }
        catch (e) { }
        
        server.close(done);
    });
    
    it('should call the callback on connect', function (done) {
        var syslog = new SyslogStream({
            type: 'unix',
            path: path
        }, function () {
            syslog.end(done);
        });
    });
    
    it('should return a promise when calling .end()', function () {
        var syslog = new SyslogStream({
            type: 'unix',
            path: path
        });
        return syslog.end();
    });
    
    it('should support a callback when calling .end()', function (done) {
        var syslog = new SyslogStream({
            type: 'unix',
            path: path
        });
        syslog.end(done);
    });
    
    it('should connect and pass messages', function (done) {
        var syslog = new SyslogStream({
            type: 'unix',
            path: path
        });
        server.once('connection', function (socket) {
            socket.once('data', function (chunk) {
                syslog.end(done);
            });
        });
        syslog.write('foo');
    });
    
    it('should emit an error event on socket errors', function (done) {
        var syslog = new SyslogStream({
            type: 'unix',
            path: path
        });
        server.once('connection', function (socket) {
            syslog.transport.then(function (stream) {
                stream.emit('error', 'foo');
                socket.end();
            });
        });
        syslog.once('error', function (err) {
            err.should.equal('foo');
            done();
        });
    });

    it('should attempt to reconnect on a write error', function (done) {
        var syslog = new SyslogStream({
            type: 'unix',
            path: path
        });

        syslog.once('error', function (err) {
            // intentionally disabled
            //console.log('error:', err);
        });

        syslog._writeToStream = function () {
            delete syslog._writeToStream;
            return Promise.reject('retry');
        };
        
        server.on('connection', function (socket) {
            socket.once('data', done.bind(null, null));
            syslog.end('foo');
        });
    });
    
    it('should give up trying to write after too many retries', function (done) {
        var syslog = new SyslogStream({
            type: 'unix',
            path: path
        });

        syslog.on('error', function (err) {
            // intentionally disabled
            //console.log('error:', err);
        });

        syslog._writeToStream = function () {
            return Promise.reject('retry');
        };
        
        server.on('connection', function (socket) {
            server.once('data', function () {
                done('Should not receive message');
            });
            
            delete syslog._writeToStream;
            syslog.end(done);
        });
    });
    
    it('should allow reopening the connection while it\'s closing', function (done) {
        var syslog = new SyslogStream({
            type: 'unix',
            path: path
        });
        
        syslog.end();
        syslog.write('foo');
        
        var count = 0;
        server.on('connection', function (socket) {
            count++;
            socket.once('data', function () {
                count.should.equal(2);
                syslog.end();
                done();
            });
        });
    });
    
    it('should reject when destroyed', function () {
        var syslog = new SyslogStream({
            type: 'unix',
            path: path
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
