'use strict';

var SyslogStream = require('../../lib/syslog'),
    dgram = require('dgram');

describe('UDP transport', function () {
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
