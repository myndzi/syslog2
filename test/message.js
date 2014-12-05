'use strict';

var SyslogStream = require('../lib/syslog'),
    SYSLOG = require('../lib/syslog-constants'),
    PassThrough = require('stream').PassThrough,
    format = require('util').format;

require('should-eventually');

var TEST = {
    NAME: 'Test',
    MSG_ID: 'FOOMSG',
    PEN: 12343,
    FACILITY: 'LOCAL3',
    HOSTNAME: '127.0.1.1'
};

var syslogRegex = new RegExp(format(
    '^<\\d+>\\d [\\d\\-.T:Z]+ %s %s \\d+ %s \\S',
    TEST.HOSTNAME,
    TEST.NAME,
    TEST.MSG_ID
));
var ISOStringRegex = /[\d\-.T:Z]+$/;

var BUNYAN = {
    FATAL: 60,
    ERROR: 50,
    WARN: 40,
    INFO: 30,
    DEBUG: 20,
    TRACE: 10
};

describe('Message parsing', function () {
    var syslog, stream;
    
    beforeEach(function () {
        stream = new PassThrough();
        syslog = new SyslogStream({
            stream: stream,
            name: TEST.NAME,
            msgId: TEST.MSG_ID,
            PEN: TEST.PEN,
            facility: TEST.FACILITY,
            hostname: TEST.HOSTNAME
        });
    });
    
    afterEach(function (done) {
        syslog.end(done);
    });

    describe('message', function () {
        it('should accept plain text strings', function () {
            var msg = syslog.buildMessage('foo');
            
            msg.should.match(syslogRegex);
        });
        it('should return undefined for null or undefined', function () {
            (syslog.buildMessage() === void 0).should.be.ok;
            (syslog.buildMessage(null) === void 0).should.be.ok;
        });
        it('should return JSON encoded messages for arrays', function () {
            syslog.buildMessage([null, 'foo']).should.match(/\[null,"foo"\]$/);
        });
        it('should return an ISO Date string for Date objects', function () {
            syslog.buildMessage(new Date()).should.match(ISOStringRegex);
        });
        it('should interpret other primitives as strings', function () {
            syslog.buildMessage(true).should.match(/true$/);
            syslog.buildMessage(123).should.match(/123$/);
        });
        it('should use the \'msg\' field of a record as the message if it exists', function () {
            syslog.buildMessage({
                msg: 'msgKey'
            }).should.match(/msgKey$/);
        });
    });
    
    describe('header', function () {
        describe('formatLevel', function () {
            it('should return the correct syslog mapping for the given bunyan level', function () {
                [ [ BUNYAN.FATAL, SYSLOG.LEVEL.EMERG ],
                  [ BUNYAN.ERROR, SYSLOG.LEVEL.ERR ],
                  [ BUNYAN.WARN, SYSLOG.LEVEL.WARNING ],
                  [ BUNYAN.INFO, SYSLOG.LEVEL.NOTICE ],
                  [ BUNYAN.DEBUG, SYSLOG.LEVEL.INFO ],
                  [ BUNYAN.TRACE, SYSLOG.LEVEL.DEBUG ] ]
                .forEach(function (pair) {
                    syslog.formatLevel(pair[0]).should.equal(pair[1]);
                });
            });
            it('should return a valid syslog mapping for other log values not mapped directly to bunyan log names', function () {
                [ [ 99, SYSLOG.LEVEL.EMERG ],
                  [ 53, SYSLOG.LEVEL.ERR ],
                  [ 42, SYSLOG.LEVEL.WARNING ],
                  [ 31, SYSLOG.LEVEL.NOTICE ],
                  [ 28, SYSLOG.LEVEL.INFO ],
                  [ 11, SYSLOG.LEVEL.DEBUG ],
                  [ 7,  SYSLOG.LEVEL.DEBUG ],
                  [ 'foo', SYSLOG.LEVEL.NOTICE ] ]
                .forEach(function (pair) {
                    syslog.formatLevel(pair[0]).should.equal(pair[1]);
                });
            });
            it('should accept (case-insensitive) strings', function () {
                [ [ 'Fatal', SYSLOG.LEVEL.EMERG ],
                  [ 'Error', SYSLOG.LEVEL.ERR ],
                  [ 'Warn', SYSLOG.LEVEL.WARNING ],
                  [ 'infO', SYSLOG.LEVEL.NOTICE ],
                  [ 'debuG', SYSLOG.LEVEL.INFO ],
                  [ 'tracE', SYSLOG.LEVEL.DEBUG ] ]
                .forEach(function (pair) {
                    syslog.formatLevel(pair[0]).should.equal(pair[1]);
                });
            });
            it('should return the syslog notice level for invalid values', function () {
                [null, new Date(), 'foo', [ ]]
                .forEach(function (val) {
                    syslog.formatLevel(val).should.equal(SYSLOG.LEVEL.NOTICE);
                });
            });
        });
        
        function priority(level, facility) {
            level = syslog.formatLevel(level);
            return new RegExp(format('^<%d>1$', facility * 8 + level));
        }
        function header(rec, token) {
            if (arguments.length === 1) {
                return syslog.buildHeader().split(' ')[rec];
            }
            return syslog.buildHeader(rec).split(' ')[token];
        }

        describe('priority', function () {
            var DEF_FACILITY = SYSLOG.FACILITY[TEST.FACILITY];
            it('should default the level to BUNYAN.INFO', function () {
                header(0).should.match(priority(BUNYAN.INFO, DEF_FACILITY));
            });
            it('should reflect explicitly specified levels', function () {
                header({ level: 'fatal' }, 0).should.match(priority(BUNYAN.FATAL, DEF_FACILITY));
            });
        });
        
        describe('formatTime', function () {
            it('should return undefined if passed an invalid JS Date object or string', function () {
                (syslog.formatTime('foo') === void 0).should.be.ok;
            });
            it('should return an ISO time string if passed a valid JS Date object or string', function () {
                syslog.formatTime(new Date()).should.match(ISOStringRegex);
                syslog.formatTime('June 10 1981').should.match(ISOStringRegex);
            });
        });
        describe('time', function () {
            it('should default the timestamp to the current time', function () {
                var now = (new Date()).toISOString();
                header(1).slice(0, -2).should.equal(now.slice(0, -2));
            });
            it('should use the provided timestamp if given', function () {
                var then = new Date();
                then.setFullYear(then.getFullYear() - 1);
                
                header({ time: then }, 1).should.equal(then.toISOString());
            });
            it('should use the NILVALUE if given an invalid timestamp', function () {
                header({ time: 'foo' }, 1).should.equal(SYSLOG.NILVALUE);
            });
        });
        describe('hostname', function () {
            it('should default to the specified hostname', function () {
                header(2).should.equal(TEST.HOSTNAME);
            });
            it('should reflect explicitly specified hostname', function () {
                header({ hostname: 'foo.bar' }, 2).should.equal('foo.bar');
            });
            it('should fall back on NILVALUE', function () {
                var _hostname = syslog.hostname;
                delete syslog.hostname;
                header(2).should.equal(SYSLOG.NILVALUE);
                syslog.hostname = _hostname;
            });
        });
        describe('appName', function () {
            it('should default to the specified appName', function () {
                header(3).should.equal(TEST.NAME);
            });
            it('should reflect explicitly specified appName', function () {
                header({ appName: 'keke' }, 3).should.equal('keke');
            });
            it('should fall back on NILVALUE', function () {
                var _appName = syslog.name;
                delete syslog.name;
                header(3).should.equal(SYSLOG.NILVALUE);
                syslog.name = _appName;
            });
        });
        describe('procId', function () {
            it('should default to process.pid', function () {
                header(4).should.eql(String(process.pid));
            });
            it('should reflect explicitly specified procId', function () {
                header({ pid: 123 }, 4).should.equal('123');
            });
            it('should use process.pid if not given a valid integer', function () {
                header({ pid: 'foo' }, 4).should.eql(String(process.pid));
                header({ pid: -2 }, 4).should.eql(String(process.pid));
            });
            it('should fall back on NILVALUE', function () {
                var _pid = process.pid;
                delete process.pid;
                header(4).should.equal(SYSLOG.NILVALUE);
                process.pid = _pid;
            });
        });
        describe('msgId', function () {
            it('should default to the specified msgId', function () {
                header(5).should.equal(TEST.MSG_ID);
            });
            it('should reflect explicitly specified msgId', function () {
                header({ msgId: 'unf' }, 5).should.equal('unf');
            });
            it('should fall back on NILVALUE', function () {
                var _msgId = syslog.msgId;
                delete syslog.msgId;
                header(5).should.equal(SYSLOG.NILVALUE);
                syslog.msgId = _msgId;
            });
        });
        it('should delete any processed keys from the object', function () {
            var record = {
                level: 'info',
                time: new Date(),
                hostname: 'fob',
                appName: 'fib',
                msgId: 'hoo',
                pid: 3343
            };
            syslog.buildHeader(record);
            Object.keys(record).length.should.equal(0);
        });
    });
    describe('structured data', function () {
        function SD(rec) { return syslog.formatStructuredData(rec); };
        
        describe('standard SDIDs', function () {
            describe('timeQuality', function () {
                it('should validate with no arguments', function () {
                    SD({
                        timeQuality: { }
                    }).should.equal('[timeQuality]');
                });
                it('should accept tzKnown', function () {
                    SD({
                        timeQuality: { tzKnown: 1 }
                    }).should.equal('[timeQuality tzKnown="1"]');
                });
                it('should error if tzKnown is invalid', function () {
                    [null, 1.2, 3, -1, Infinity, { }].forEach(function (val) {
                        SD({ timeQuality: { tzKnown: val} }).should.equal('');
                    });
                });
                it('should accept isSynced', function () {
                    SD({
                        timeQuality: { isSynced: 0 }
                    }).should.equal('[timeQuality isSynced="0"]');
                });
                it('should error if isSynced is invalid', function () {
                    [null, 1.2, 3, -1, Infinity, { }].forEach(function (val) {
                        SD({ timeQuality: { isSynced: val} }).should.equal('');
                    });
                });
                it('should accept syncAccuracy', function () {
                    // Joi counts isSynced being undefined as being defined as 0,
                    // so must specify 'isSynced' here even though it's not required by the RFC
                    SD({
                        timeQuality: { isSynced: 1, syncAccuracy: 123 }
                    }).should.equal('[timeQuality isSynced="1" syncAccuracy="123"]');
                });
                it('should error if syncAccuracy is supplied when isSynced is 0', function () {
                    var rec = {
                        timeQuality: { isSynced: 0, syncAccuracy: 123 }
                    };
                    SD(rec).should.equal('');
                    rec.SD_VALIDATION_ERROR.should.match(/syncAccuracy is not allowed/);
                });
            });
            describe('origin', function () {
                it('should validate with no arguments', function () {
                    SD({ origin: { } }).should.equal('[origin]');
                });
                it('should accept a single ip', function () {
                    SD({ origin: { ip: '127.0.0.1' } }).should.equal('[origin ip="127.0.0.1"]');
                });
                it('should accept a single hostname', function () {
                    SD({ origin: { ip: 'foo' } }).should.equal('[origin ip="foo"]');
                    SD({ origin: { ip: 'foo.bar' } }).should.equal('[origin ip="foo.bar"]');
                });
                it('should error on an invalid parameter for \'ip\'', function () {
                    var rec = { origin: { ip: '.' } };
                    SD(rec).should.equal('');
                    rec.SD_VALIDATION_ERROR.should.match(/ip must be a valid hostname/);
                });
                it('should accept an array', function () {
                    SD({ origin: { ip: ['127.0.0.1', '127.0.0.2'] } }).should.equal('[origin ip="127.0.0.1" ip="127.0.0.2"]');
                });
                it('should accept an enterpriseId', function () {
                    SD({ origin: { enterpriseId: '1234' } }).should.equal('[origin enterpriseId="1234"]');
                });
                it('should accept a software name', function () {
                    SD({ origin: { software: 'poop' } }).should.equal('[origin software="poop"]');
                });
                it('should accept a software version', function () {
                    SD({ origin: { swVersion: '4242' } }).should.equal('[origin swVersion="4242"]');
                });
            });
            describe('meta', function () {
                it('should validate with no arguments', function () {
                    SD({ meta: { } }).should.equal('[meta]');
                });
                // probably could/should implement this into the code
                it('should accept a sequence id', function () {
                    SD({ meta: { sequenceId: 1 } }).should.equal('[meta sequenceId="1"]');
                });
                it('should accept system uptime', function () {
                    SD({ meta: { sysUpTime: 1234 } }).should.equal('[meta sysUpTime="1234"]');
                });
                it('should accept a language', function () {
                    SD({ meta: { language: 'en-us' } }).should.equal('[meta language="en-us"]');
                });
                it('should error on an invalid BCP_47 language tag', function () {
                    ['en_US', 1234, 'jabberwocky', null].forEach(function(val) {
                        SD({ meta: { language: val } }).should.equal('');
                    });
                });
            });
            it('should accept everything', function () {
                SD({
                    timeQuality: {
                        tzKnown: 1,
                        isSynced: 1,
                        syncAccuracy: 123
                    },
                    origin: {
                        ip: ['127.0.0.1', 'foo.bar'],
                        enterpriseId: '3434.34355',
                        software: 'keke',
                        swVersion: '1.2.3'
                    },
                    meta: {
                        sequenceId: 55,
                        sysUpTime: 21355,
                        language: 'fr'
                    }
                }).should.equal(
                    '[timeQuality tzKnown="1" isSynced="1" syncAccuracy="123"]'+
                    '[origin ip="127.0.0.1" ip="foo.bar" enterpriseId="3434.34355" software="keke" swVersion="1.2.3"]'+
                    '[meta sequenceId="55" sysUpTime="21355" language="fr"]'
                );
            });
        });
        describe('custom SDIDs', function () {
            var PEN = TEST.PEN;
            it('should format any extra keys as structured data; SDID should contain the PEN', function () {
                SD({ foo: { bar: 123 } }).should.equal('[foo@'+PEN+' bar="123"]');
            });
            it('should not create any structured data if there is no PEN', function () {
                var _PEN = syslog.PEN;
                delete syslog.PEN;
                SD({ foo: { bar: 123 } }).should.equal('');
                syslog.PEN = _PEN;
            });
            it('should not format keys that are not maps', function () {
                ['bar', new Date(), true].forEach(function (val) {
                    var rec = { foo: val };
                    SD(rec).should.equal('');
                    rec.foo.should.equal(val);
                    rec.should.not.have.property('SD_VALIDATION_ERROR');
                });
            });
            it('should not format keys that are illegal SDID values', function () {
                var rec = { '@': { invalid: 'true' } };
                SD(rec).should.equal('');
                rec['@'].invalid.should.equal('true');
                rec.should.not.have.property('SD_VALIDATION_ERROR');
            });
            it('should accept arrays', function () {
                SD({ foo: { bar: [ 1, 2, 3 ] } }).should.equal('[foo@'+PEN+' bar="1" bar="2" bar="3"]');
            });
        });
    });
    describe('buildMessage', function () {
        it('should provide any data not converted to structured data as JSON', function () {
            syslog.buildMessage({
                '@': 'foo'
            }).should.match(/{"@":"foo"}$/);
        });
    });
    describe('formatObject', function () {
        it('should flag circular references', function () {
            var obj = { };
            obj.foo = obj;
            syslog.formatObject(obj).should.equal('{"foo":"[Circular]"}');
        });
    });
});