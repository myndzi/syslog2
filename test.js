'use strict';

var SyslogStream = require('./index');

var stream = SyslogStream.createConnection({
    facility: 'local2',
    transport: 'udp',
    PEN: 1234
}, function (stream) {
    stream.write({
        hostname: 'foo',
        level: 'fatal',
        time: new Date(),
        msg: 'test',
        extra: {
            foo: 'bar'
        }
    });
    
});
