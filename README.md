# Syslog2

This module presents as a Node (streams2) writable stream, and outputs to Syslog. It supports structured data and minor interruption recovery (it will try a couple times to reconnect if your connection is dumped). It is written in pure Javascript, no native bindings (as far as I can tell, the native bindings just open a unix domain socket to /dev/log anyway). I wrote it because the available modules that I could find are basic, with poor tests, or otherwise lacking, and it didn't seem that there was anything available written to the full RFC 5424 specification.

# Usage

    var Syslog = require('syslog2');
	var log = Syslog.create();

	log.write('message');

`Syslog.create(options, callback)` is a shortcut for `new Syslog(options)`
followed by `.connect(callback)`.

# Options

Various options are supported in the constructor/`.create` method:

	new Syslog({
		name: <app name>,
		msgId: <message id>,
		PEN: <private enterprise number>,
		facility: <facility>,
		hostname: <hostname>,
        connection: {
	        type: {tcp|udp|unix|stream},
	        host: <adress>,
	        port: <port>,
	        path: <unix domain socket>,
	        stream: <node stream>
		}
	})

### Connection
This is an object specifying connection details. All keys are optional. If you do not specify 'type', it will be inferred from other keys provided (If `path` exists, it assumes a unix domain socket; if `stream` exists, it assumes a stream; otherwise it assumes UDP).

 
    new Syslog({
        connection: {
	        type: {tcp|udp|unix|stream},
	        host: <adress>,
	        port: <port>,
	        path: <unix domain socket>,
	        stream: <node stream>
		}
    });

Defaults are:

- Type: `udp`
- Host: `127.0.0.1`
- Port: `514`
- Path: `/dev/log`

### Name

	The APP-NAME field SHOULD identify the device or application that
	originated the message.  It is a string without further semantics.
	It is intended for filtering messages on a relay or collector.

The default app name to use when logging messages. Can be overridden with `.write()` Defaults to `process.title` and falls back to `process.argv[0]` then `-`, the "nil value"

### msgId

	The MSGID SHOULD identify the type of message.  For example, a
	firewall might use the MSGID "TCPIN" for incoming TCP traffic and the
	MSGID "TCPOUT" for outgoing TCP traffic.  Messages with the same
	MSGID should reflect events of the same semantics.  The MSGID itself
	is a string without further semantics.  It is intended for filtering
	messages on a relay or collector.  

The default message id to use when logging messages. Can be overridden with `.write()`. Defaults to the nil value if not specified.

### PEN

If you have a Private Enterprise Number, you may specify it. If so, JSON objects written to the stream will be converted to structured data entries conforming to the RFC. Please note that to conform with the RFC, you *must* register your PEN with IANA, and you cannot use custom structured data entries without having a PEN.

### Facility

The syslog Facility to log to. Valid facilities are:

- KERN - Kernel messages
- USER - User-level messages
- MAIL - Mail system
- DAEMON - System daemons
- AUTH - Security/authorization messages
- SYSLOG - Messages generated internally by syslogd
- LPR - Line printer subsystem
- NEWS - Network news subsystem
- UUCP - UUCP subsystem
- CLOCK - Clock daemon
- AUTHPRIV - Security/authorization messages
- FTP - FTP daemon
- NTP - NTP subsystem
- LOG_AUDIT - Log audit
- LOG_ALERT - Log alert
- CRON - Clock daemon
- LOCAL0 - Local use 0
- LOCAL1 - Local use 1
- LOCAL2 - Local use 2
- LOCAL3 - Local use 3
- LOCAL4 - Local use 4
- LOCAL5 - Local use 5
- LOCAL6 - Local use 6
- LOCAL7 - Local use 7

Case insensitive. Defaults to `LOCAL0`. Can be overridden with `.write()`.

### Hostname

The hostname of the system logging the message.

	The HOSTNAME field SHOULD contain the hostname and the domain name of
	the originator in the format specified in STD 13 [RFC1034].  This
	format is called a Fully Qualified Domain Name (FQDN) in this
	document.
	
	In practice, not all syslog applications are able to provide an FQDN.
	As such, other values MAY also be present in HOSTNAME.  This document
	makes provisions for using other values in such situations.  A syslog
	application SHOULD provide the most specific available value first.
	The order of preference for the contents of the HOSTNAME field is as
	follows:
		
	1. FQDN
	2. Static IP address
	3. hostname
	4. Dynamic IP address
	5. the NILVALUE

Defaults to `os.hostname()`. Can be overridden with `.write()`.


# syslog.connect()

If you've created an instance with the constructor, you'll need to connect it. Do that with `syslog.connect()`. If you supply a callback, it will be called on connection, or with an error if there was an error. **The callback may be called multiple times** since Syslog performs auto-reconnect. It's recommended that you use events instead. In fact, it's recommended that you just use `Syslog.create()` rather than `new Syslog()`.

# Event: 'connect'

Emitted each time Syslog2 establishes a connection.

# Event: 'error'

Emitted when Syslog2 is unable to establish an initial connection, or when a connection is lost and Syslog2 is unable to reconnect.

# Event: 'warn'

Emitted each time Syslog2 loses connection, before retrying. If retries are disabled or fail, an `error` event will also be emitted.

# syslog.write()

This module accepts messages in a few formats. They are described here. The stream is an *object mode* stream, so you needn't write Buffer objects to it. If it receives a Buffer, it will decode it to a string. If it receives a string, it will attempt to parse it as JSON.

### Plain string
`syslog.write('foo')`

This will generate the header field according to the options created on instantiation and append the specified message. Example:

`<149>1 2014-12-05T22:44:25.863Z myndzi node 20308 - foo` 

### Plain object

You may write any object to the stream, but the following keys have special meaning:

    {
		message: <message>,
		level: <log level>,
		time: <timestamp>,
		hostname: <originating hostname>,
		appName: <originating app name>,
		msgId: <originating message id>,
		pid: <originating process id>
    }

- message: the message you want to log. Any extra keys not processed into structured data will be appended to this message as JSON. 
- level: the log level to use. You may specify a numerical value from 0-100 or a Bunyan log level string ('fatal', 'error', 'warn', 'info', 'debug', 'trace'). Case insensitive. Left empty, it will default to the syslog 'notice' level.
- time: the timestamp to use. You may specify a Javascript Date object or any string that can be converted to one. Left empty, it will default to the current timestamp.
- hostname: A string; defaults to the instantiated value
- appName: A string; defaults to the instantiated value
- msgId: A string; defaults to the instantiated value
- pid: The originating proccess ID. Left empty, will use the value of `process.pid` or the nil value if unavailable.

### Misc. unlikelihoods

Undefined and null are ignored completely. Dates are converted to a string using the `.toISOString()` method. Arrays are processed into JSON strings.

### Extra keys

Any extra keys passed on an object will first be converted to structured data if possible; any keys remaining after conversion will be processed into JSON strings and appended to the log message (if any). Example:

`log.write({ foo: 'bar' });`

Outputs:
 
`<149>1 2014-12-05T22:58:07.725Z myndzi node 20428 - hello {"foo":"bar"}`

# Structured Data

When possible, extra object keys will be processed into structured data. There are two cases where this will happen.

- When you provide a key matching a defined SDID in the RFC, such as 'timeQuality', 'origin', or 'meta'
- When you provide a PEN

**Note:** Object properties that do not contain objects cannot be converted to structured data (e.g. `{ custom: 'foo', msg: 'hello' }`; neither can properties with keys that violate the acceptable characters for an SDID, e.g. `{ 'foo@bar': 'baz', msg: 'hello' }`.

Standardized SDIDs will be validated and converted. Any remaining keys will be treated as custom structured data and formatted with your PEN.

Example:

`log.write({ meta: { ip: '127.1.1.1' }, msg: 'hello' })`

outputs:

`<149>1 2014-12-05T23:01:36.170Z myndzi node 20465 - [meta ip="127.1.1.1"] hello` 

while

`log.write({ custom: { key: 'val' }, msg: 'hello' })`

outputs:

`<149>1 2014-12-05T23:03:58.957Z myndzi node 20492 - [custom@32473 key="val"] hello`

# Bunyan

Syslog2 was designed for use with [bunyan](https://npmjs.com/package/bunyan). It can be used like so:

    var log = bunyan.createLogger({
		name: 'myapp',
		stream: {
			type: 'raw',
			level: 'debug',
			stream: Syslog.create(/* opts */)
		}
	})


# Testing

Clone the repository and run `npm test`
