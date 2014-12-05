'use strict';

var SyslogStream = require('../../lib/syslog'),
    fs = require('fs'),
    net = require('net'),
    dgram = require('dgram'),
    Stream = require('stream');

describe('Transports', function () {
    describe('TCP', function () {
        var server, bindPort = 14243;
        
        beforeEach(function (done) {
            server = net.createServer();
            server.listen(bindPort, done);
        });
        
        afterEach(function (done) {
            server.close(done);
        });
        
        it('should call the callback on connect', function (done) {
            var syslog = new SyslogStream({
                type: 'tcp',
                port: bindPort
            }, function () {
                syslog.end(done);
            });
        });
        it('should connect and pass messages', function (done) {
            var syslog = new SyslogStream({
                type: 'tcp',
                port: bindPort
            });
            server.once('connection', function (socket) {
                socket.once('data', function (chunk) {
                    syslog.end(done);
                });
            });
            syslog.write('foo');
        });
    });
    
    describe('UDP', function () {
        var server, bindPort = 14243;
        
        before(function (done) {
            server = dgram.createSocket('udp4');
            server.bind(bindPort, done);
        });
        
        after(function () {
            server.close();
        });
        
        it('should connect and pass messages', function (done) {
            var syslog = new SyslogStream({
                type: 'udp',
                port: bindPort
            });
            server.once('message', function () {
                syslog.end(done);
            });
            syslog.write('foo');
        });
    });
    
    describe('Unix socket', function () {
        var server, path = '/tmp/syslog-test.log';
        
        before(function (done) {
            try { fs.unlinkSync(path); }
            catch (e) { }
            
            server = net.createServer();
            server.listen(path, done);
        });
        
        after(function (done) {
            try { fs.unlinkSync(path); }
            catch (e) { }
            
            server.close(done);
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

    });

    describe('Node stream', function () {
        it('should connect and pass messages', function (done) {
            var stream = new Stream.PassThrough();
            var syslog = new SyslogStream({
                type: 'stream',
                stream: stream
            });
            stream.once('data', function (chunk) {
                syslog.end(done);
            });
            syslog.write('foo');
        });

    });
});