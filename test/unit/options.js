'use strict';

var os = require('os');

var SyslogStream = require('../../lib/syslog');
require('should');

var SYSLOG = require('../../lib/syslog-constants'),
    NILVALUE = SYSLOG.NILVALUE;

var mockStream = { write: function () { } };

describe('Options', function () {
    var parseOpts = function () {
        var opts = { };
        SyslogStream._parseOpts.apply(opts, arguments);
        return opts;
    };
    
    describe('name', function () {
        it('should use an explicitly specified name first', function () {
            parseOpts({name: 'whaargarbl'}).name.should.equal('whaargarbl');
        });
        it('should fall back on process.title', function () {
            parseOpts().name.should.equal(process.title);
        });
        it('should fall back on process.argv[0]', function () {
            var title = process.title;
            delete process.title;
            parseOpts().name.should.equal(process.argv[0]);
            process.title = title;
        });
        it('should fall back on NILVALUE', function () {
            var title = process.title,
                argv = process.argv;
            
            delete process.title;
            delete process.argv;
            
            parseOpts().name.should.equal(NILVALUE);
            
            process.title = title;
            process.argv = argv;
        });
        it('should be a string', function () {
            parseOpts({name: 123}).name.should.be.a.String;
        });
    });
    
    describe('msgId', function () {
        it('should use an explicitly specified value first', function () {
            parseOpts({msgId: 'whaargarbl'}).msgId.should.equal('whaargarbl');
        });
        it('should fall back on NILVALUE', function () {
            parseOpts().msgId.should.equal(NILVALUE);
        });
        it('should always be a string', function () {
            parseOpts({msgId: 123}).msgId.should.be.a.String;
        });
    });
    
    describe('PEN', function () {
        it('should use an explicitly specified value first', function () {
            parseOpts({PEN: 123}).PEN.should.equal(123);
        });
        it('should be null for invalid or unspecified values', function () {
            (parseOpts().PEN === null).should.be.ok;
            (parseOpts({PEN: 'lol'}).PEN === null).should.be.ok;
        });
        it('should always be a number', function () {
            parseOpts({PEN: '123'}).PEN.should.equal(123);
        });
    });
    
    describe('facility', function () {
        it('should use a (valid) explicitly specified value first', function () {
            parseOpts({facility: 'LOCAL2'}).facility.should.equal(SYSLOG.FACILITY.LOCAL2);
        });
        it('should be case insensitive', function () {
            parseOpts({facility: 'loCal2'}).facility.should.equal(SYSLOG.FACILITY.LOCAL2);
        });
        it('should use LOCAL0 for invalid or unspecified values', function () {
            parseOpts().facility.should.equal(SYSLOG.FACILITY.LOCAL0);
            parseOpts({facility: 'lolol'}).facility.should.equal(SYSLOG.FACILITY.LOCAL0);
        });
    });
    
    // hostname is the hostname of the system doing the logging
    describe('hostname', function () {
        it('should use an explicitly specified value first', function () {
            parseOpts({hostname: 'kekelar'}).hostname.should.equal('kekelar');
        });
        it('should fall back on os.hostname()', function () {
            parseOpts().hostname.should.equal(os.hostname());
        });
        it('should fall back on NILVALUE', function () {
            var _hostname = os.hostname;
            os.hostname = function () { };
            parseOpts().hostname.should.equal(NILVALUE);
            os.hostname = _hostname;
        });
    });
    
    describe('connection', function () {
        describe('type', function () {
            it('should use an explicitly specified value first', function () {
                ['tcp', 'udp', 'unix', 'stream']
                .forEach(function (type) {
                    parseOpts({type: type, stream: mockStream}).connection.type.should.equal(type);
                    parseOpts({connection: {type: type, stream: mockStream}}).connection.type.should.equal(type);
                });
            });
            it('should imply type from other options', function () {
                parseOpts({path: ''}).connection.type.should.equal('unix');
                parseOpts({connection: {path: ''}}).connection.type.should.equal('unix');
                
                parseOpts({stream: mockStream}).connection.type.should.equal('stream');
                parseOpts({connection: {stream: mockStream}}).connection.type.should.equal('stream');
            });
            it('should default to UDP', function () {
                parseOpts().connection.type.should.equal('udp');
            });
        });
        describe('host', function () {
            it('should use a (valid) explicitly specified value first', function () {
                parseOpts({host: '1.2.3.4'}).connection.host.should.equal('1.2.3.4');
                parseOpts({host: '::1'}).connection.host.should.equal('::1');
                parseOpts({host: 'somewhere.com'}).connection.host.should.equal('somewhere.com');
                parseOpts({host: 1243}).connection.host.should.not.equal(1243);
                parseOpts({connection: {host: '1.2.3.4'}}).connection.host.should.equal('1.2.3.4');
                parseOpts({connection: {host: '::1'}}).connection.host.should.equal('::1');
                parseOpts({connection: {host: 'somewhere.com'}}).connection.host.should.equal('somewhere.com');
                parseOpts({connection: {host: 1243}}).connection.host.should.not.equal(1243);
            });
            it('should fall back on 127.0.0.1', function () {
                parseOpts().connection.host.should.equal('127.0.0.1');
            });
        });
        describe('port', function () {
            it('should use a (valid) explicitly specified value first', function () {
                parseOpts({port: 1234}).connection.port.should.equal(1234);
                parseOpts({connection: {port: 1234}}).connection.port.should.equal(1234);
                parseOpts({port: 'foo'}).connection.port.should.not.equal('foo');
                parseOpts({connection: {port: 'foo'}}).connection.port.should.not.equal('foo');
            });
            it('should fall back on 514', function () {
                parseOpts().connection.port.should.equal(514);
            });
        });
        describe('path', function () {
            it('should use an explicitly specified value first', function () {
                parseOpts({path: '/tmp/foo'}).connection.path.should.equal('/tmp/foo');
                parseOpts({connection: {path: '/tmp/foo'}}).connection.path.should.equal('/tmp/foo');
            });
            it('should fall back on /dev/log', function () {
                parseOpts({type: 'unix'}).connection.path.should.equal('/dev/log');
            });
        });
        describe('stream', function () {
            it('should use a (valid) explicitly specified value first', function () {
                parseOpts({stream: mockStream}).connection.stream.should.equal(mockStream);
                parseOpts({connection: {stream: mockStream}}).connection.stream.should.equal(mockStream);
            });
            it('should throw if no valid stream is provided', function () {
                (function () {
                    parseOpts({type: 'stream'});
                }).should.throw(/requires a writable stream/);
            });
        });
    });
    describe('onConnect', function () {
        it('should take a callback from the arguments', function () {
            var fn = function () { };
            parseOpts(fn).onConnect.should.equal(fn);
            parseOpts({ }, fn).onConnect.should.equal(fn);
        });
        it('should take a callback from the onConnect option', function () {
            var fn = function () { };
            parseOpts({onConnect: fn}).onConnect.should.equal(fn);
        });
    });
});