'use strict';

var Syslog = require('./index'),
    fs = require('fs'),
    net = require('net'),
    dgram = require('dgram');

var BIND_PORT = 1234,
    SOCKET_FILE = '/tmp/syslog2-test';

require('should');

function unlink(done) {
    fs.unlink(SOCKET_FILE, done.bind(null, null));
}
before(unlink);
after(unlink);

// these are more thoroughly tested in their respective modules; just making sure
// that the logic to hook them up works correctly
describe('Transports', function () {
    describe('tcp', function () {
        var server;
        
        before(function (done) {
            server = net.createServer();
            server.listen(BIND_PORT, done);
        });
        after(function (done) {
            server.close(done);
        });
        it('should connect and pass messages', function (done) {
            var log = new Syslog({
                connection: {
                    type: 'tcp',
                    host: '127.0.0.1',
                    port: BIND_PORT
                }
            });
            
            server.once('connection', function (socket) {
                socket.once('data', function (chunk) {
                    log.end(done);
                });
            });
            
            log.connect(function () {
                log.write({msg: 'hello'});
            });
        });
    });
    describe('unix socket', function () {
        var server;
        
        before(function (done) {
            server = net.createServer();
            server.listen(SOCKET_FILE, done);
        });
        after(function (done) {
            server.close(done);
        });
        it('should connect and pass messages', function (done) {
            var log = new Syslog({
                connection: {
                    type: 'unix',
                    path: SOCKET_FILE
                }
            });
            
            server.once('connection', function (socket) {
                socket.once('data', function (chunk) {
                    log.end(done);
                });
            });
            
            log.connect(function () {
                log.write({msg: 'hello'});
            });
        });
    });
    describe('udp', function () {
        var server;
        
        before(function (done) {
            server = dgram.createSocket('udp4');
            server.bind(BIND_PORT, done);
        });
        after(function () {
            server.close();
        });
        it('should pass messages', function (done) {
            var log = new Syslog({
                connection: {
                    type: 'udp',
                    host: '127.0.0.1',
                    port: BIND_PORT
                }
            });
            
            server.once('message', function (chunk) {
                log.end(done);
            });
            
            log.connect(function () {
                log.write({msg: 'hello'});
            });
        });
    });
});

describe('Syslog2', function () {
    var server;
    
    beforeEach(function (done) {
        server = net.createServer();
        server.listen(BIND_PORT, done);
    });
    afterEach(function (done) {
        server.close(done);
    });

    it('should default to not reconnecting', function (done) {
        var log = new Syslog({
            connection: {
                type: 'tcp',
                port: BIND_PORT
            }
        });
        
        server.once('connection', function (socket) {
            socket.destroy();
        });
        
        log.connect(function () {
            log.once('error', function (err) {
                err.message.should.match(/Disconnected, reconnect disabled/);
                log.end(done);
            });
        });
    });

    it('should emit a \'warn\' event for socket errors while reconnecting', function (done) {
        var log = new Syslog({
            connection: {
                type: 'tcp',
                port: BIND_PORT
            }, reconnect: {
                enabled: true,
                maxTries: 1,
                initalDelay: 0,
                delayFactor: 0,
                maxDelay: 0
            }
        });
        
        server.once('connection', function (socket) {
            log.stream.emit('error', 'foo');
            socket.destroy();
        });
        
        log.connect(function () {
            log.once('warn', function (err) {
                err.should.equal('foo');
                log.end(done);
            });
        });
    });
    
    it('should give up after the specified number of reconnection attempts', function (done) {
        var log = new Syslog({
            connection: {
                type: 'tcp',
                ip: '127.0.0.1',
                port: 64993
            }, reconnect: {
                enabled: true,
                maxTries: 1,
                initalDelay: 0,
                delayFactor: 0,
                maxDelay: 0
            }
        });
        
        server.once('connection', function (socket) {
            socket.destroy();
        });
        
        log.connect(function () {
            log.once('error', function (err) {
                err.should.match(/Unable to reconnect, reach max retries/);
                log.end(done);
            });
        });
    });
    
    it('should not try to reconnect multiple times', function (done) {
        var log = new Syslog({
            connection: {
                type: 'tcp',
                ip: '127.0.0.1',
                port: 64993
            }, reconnect: {
                enabled: true,
                maxTries: 100,
                initalDelay: 0,
                delayFactor: 0,
                maxDelay: 0
            }
        });
        
        server.once('connection', function (socket) {
            socket.destroy();
        });
        
        log.connect(function () {
            var warnings = 0;
            
            log.on('warn', function () {
                warnings++;
            });
            
            log.once('error', function (err) {
                warnings.should.equal(100);
                
                err.should.match(/Unable to reconnect, reached max retries/);
                log.end(done);
            });
        });
    });
    
    it('should buffer messages for delivery when connected', function (done) {
        var log = new Syslog({
            connection: {
                type: 'tcp',
                ip: '127.0.0.1',
                port: BIND_PORT
            }
        });
        
        server.once('connection', function (socket) {
            socket.once('data', function (chunk) {
                log.end(done);
            });
        });
        
        log.on('warn', function (err) {
            console.log(err.stack);
        });
        log.write({ msg: 'hello' });
        log.connect();
    });
    
    xit('should not lose messages on write errors', function (done) {
        // implement the ring buffer thing and a protection layer rather than a direct pipe
    });
});