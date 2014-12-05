'use strict';

var SyslogStream = require('../../lib/syslog'),
    fs = require('fs'),
    net = require('net');

describe('Unix socket transport', function () {
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
