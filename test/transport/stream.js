'use strict';

var SyslogStream = require('../../lib/syslog'),
    Stream = require('stream');

describe('Node stream transport', function () {
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