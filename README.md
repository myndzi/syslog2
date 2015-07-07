# Syslog2

This module presents as a Node (streams2) writable stream, and outputs to Syslog. It supports structured data and minor interruption recovery (it will try a couple times to reconnect if your connection is dumped). It is written in pure Javascript, no native bindings (as far as I can tell, the native bindings syslog module on NPM just open a unix domain socket to /dev/log anyway). I wrote it because the available modules that I could find are basic, with poor tests, or otherwise lacking, and it didn't seem that there was anything available written to the full RFC 5424 specification.

# Usage

    var Syslog = require('syslog2');
	var log = Syslog.create();

	log.write('message');

`Syslog.create(options, callback)` is a shortcut for `new Syslog(options)`
followed by `.connect(callback)`.

# Options

Various options are supported in the constructor/`.create` method:

	new Syslog({
		decodeBuffers: <boolean>,
		decodeStrings: <boolean>,
	    useStructuredData: <boolean>,
	    defaultSeverity: <string>,
	    PEN: <integer>,
	    
	    type: <string>,
	    facility: <string>,
	    {host|hostname}: <string>,
	    {name|appName}: <string>,
	    {msgId|msgID}: <string>,
    	pid: <integer>,

        connection: {
	        type: {tcp|udp|unix|stream},
	        host: <adress>,
	        port: <port>,
	        path: <unix domain socket>,
	        stream: <node stream>
		},
		reconnect: {
			enabled: {true|false},
			maxTries: <integer>,
			initialDelay: <milliseconds>,
			delayFactor: <number>,
			maxDelay: <milliseconds>
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

- type: `udp`
- host: `127.0.0.1`
- port: `514`
- path: `/dev/log`

### Reconnect
Controls the reconnect behavior. All keys are optional. 

- enabled: Whether to enable auto reconnect. Default: false
- maxTries: How many times to attempt to reconnect. Default: Infinity
- initialDelay: How long to wait before attempting to reconnect, first try. Default: 100
- delayFactor: How much to increase the retry delay after each attempt; this value is *multiplied* against the current delay. Default: 1.2
- maxDelay: The maximum value the retry delay can have. Default: 30000 

### Syslog-specific keys
All keys other than `connection` and `reconnect` are passed along to [syslog-streams2](https://www.npmjs.com/package/syslog-streams2). That documentation is included here for convenience, but be aware that changes there supersede anything written here.

The first set of options apply to the stream itself and how it handles incoming data. The second set of options are curried into the glossy instance that performs the translation.

### decodeBuffers
True to decode buffers written to the stream; false to do nothing. You should be writing objects to the stream, but it could be handy when piping from other locations. Defaults to false.

### decodeJSON
True to attempt to decode strings as JSON; false to do nothing. May be used in conjunction with decodeBuffers. Defaults to false.

### useStructuredData
True to attempt to encode structured data; false to do nothing. Defaults to true unless 'type' is set (more on that below).

### defaultSeverity
The default severity of a log message, if not specified. This is used for all messages interpreted as strings or invalid bunyan/glossy records, and bunyan or glossy records that do not specify a level/severity.

### PEN
If you have a Private Enterprise Number, specify it here. Non-standardized structured data is tagged with your PEN. To strictly conform to the spec, you should not use this unless you have registered a PEN with IANA.

### type
This is passed along to glossy to specify what type of output to create. Right now, 'BSD' is the only valid option, to be used if you want to output 'old style' RFC3164-compatible messages. Leave empty for RFC5424-style messages. Glossy's documentation mentions RFC 5848, but no references currently exist in the code, so these are the only two options.

### facility
The facility to log to. Case insensitive. Defaults to `local0`. Can be overridden in `.write()`.

Valid facilities are:
	
	KERN - Kernel messages
	USER - User-level messages
	MAIL - Mail system
	DAEMON - System daemons
	AUTH - Security/authorization messages
	SYSLOG - Messages generated internally by syslogd
	LPR - Line printer subsystem
	NEWS - Network news subsystem
	UUCP - UUCP subsystem
	CLOCK - Clock daemon
	SEC - Security/authorization messages
	FTP - FTP daemon
	NTP - NTP subsystem
	AUDIT - Log audit
	ALERT - Log alert
	LOCAL0 - Local use 0
	LOCAL1 - Local use 1
	LOCAL2 - Local use 2
	LOCAL3 - Local use 3
	LOCAL4 - Local use 4
	LOCAL5 - Local use 5
	LOCAL6 - Local use 6
	LOCAL7 - Local use 7

### host / hostname
The hostname of the system generating the log message. Defaults to `os.hostname()`, falls back on the nil value(`-`). Can be overriden in `.write()`.

From RFC5424:

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

### pid
The process id of the process generating the log message. Defaults to `process.pid`, falls back on the nil value(`-`). Can be overridden in `.write()`. 

### name / appName
The app name to use when logging messages. Defaults to `process.title`, falls back on `process.argv[0]` followed by the nil value(`-`). Can be overriden in `.write()`.

	The APP-NAME field SHOULD identify the device or application that
	originated the message.  It is a string without further semantics.
	It is intended for filtering messages on a relay or collector.

### msgId / msgID
The message id to use when logging messages. Defaults to the nil value. Can be overriden in `.write()`.

	The MSGID SHOULD identify the type of message.  For example, a
	firewall might use the MSGID "TCPIN" for incoming TCP traffic and the
	MSGID "TCPOUT" for outgoing TCP traffic.  Messages with the same
	MSGID should reflect events of the same semantics.  The MSGID itself
	is a string without further semantics.  It is intended for filtering
	messages on a relay or collector.

# syslog.connect()

If you've created an instance with the constructor, you'll need to connect it. Do that with `syslog.connect()`. If you supply a callback, it will be called on connection, or with an error if there was an error. **The callback may be called multiple times** since Syslog performs auto-reconnect. It's recommended that you use events instead. In fact, it's recommended that you just use `Syslog.create()` rather than `new Syslog()`.

# Event: 'connect'

Emitted each time Syslog2 establishes a connection.

# Event: 'error'

Emitted when Syslog2 is unable to establish an initial connection, or when a connection is lost and Syslog2 is unable to reconnect.

# Event: 'warn'

Emitted each time Syslog2 loses connection, before retrying. If retries are disabled or fail, an `error` event will also be emitted.

# syslog.write()

Data is handled slightly differently based on the input. Bunyan-style records are identified by the presence of a `msg` key and validated against Bunyan's record format. Glossy-style records are identified by the presence of a `message` key and validated against Glossy's record format.

Records that fail validation, or that return `false` when run through Glossy will be converted to JSON and written as a plain string.

### Plain string
`syslog.write('foo')`

This will generate the header field according to the options created on instantiation and append the specified message. Example:

`<149>1 2014-12-05T22:44:25.863Z myndzi node 20308 - foo` 

### Plain object

This module make use of [syslog-streams2](https://www.npmjs.com/package/syslog-streams2) to process messages from objects into the RFC5424 Syslog format. You can write a [Bunyan](https://www.npmjs.com/package/bunyan) record, a [Glossy](https://www.npmjs.com/package/glossy) record, or an arbitrary object, with the Bunyan format being preferred.

#### Bunyan record

Typically, you would use the bunyan module to write data to the stream, but if you write data that validates against a Bunyan record, it will be interpreted as such. Bunyan records look like this:
 
    {
        v: <version>,
        level: <log level>,
        name: <originating application name>,
        hostname: <originating hostname>,
        pid: <originating process id>,
        time: <timestamp>,
        msg: <log message>
    }

- v: Supplied by Bunyan. The version number of the record schema
- level: the log level to use. You may specify a numerical value from 0-100 or a Bunyan log level string ('fatal', 'error', 'warn', 'info', 'debug', 'trace'). Case insensitive. Left empty, it will default to the syslog 'notice' level.
- name: A string; defaults to the instantiated value
- hostname: A string; defaults to the instantiated value
- pid: The originating proccess ID. Left empty, will use the value of `process.pid` or the nil value if unavailable.
- time: the timestamp to use. You may specify a Javascript Date object or any string that can be converted to one. (*Note: Javascript will convert strings in local system time if they do not contain timestamp information*) Left empty, it will default to the current timestamp.
- msg: the message you want to log. Any extra keys not processed into structured data will be appended to this message as JSON.

Extra keys are added directly to the Bunyan object.

#### Glossy record

Glossy records look like this:

    {
        facility: <facility>,
        severity: <severity>,
        host: <originating hostname>,
        appName: <originating application name>,
        pid: <originating process id>,
        date: <timestamp>,
        message: <log message>,
        structuredData: <structured data>
    }

- facility: a syslog *facility* identifier, as above; Defaults to the instantiated value.
- severity: a syslog *severity* identifier
- level: the log level to use. You may specify a numerical value from 0-100 or a Bunyan log level string ('fatal', 'error', 'warn', 'info', 'debug', 'trace'). Case insensitive. Left empty, it will default to the syslog 'notice' level.
- name: A string; defaults to the instantiated value
- hostname: A string; defaults to the instantiated value
- pid: The originating proccess ID. Left empty, will use the value of `process.pid` or the nil value if unavailable.
- time: the timestamp to use. You may specify a Javascript Date object or any string that can be converted to one. (*Note: Javascript will convert strings in local system time if they do not contain timestamp information*) Left empty, it will default to the current timestamp.
- msg: the message you want to log. Any extra keys not processed into structured data will be appended to this message as JSON.
- appName: A string; defaults to the instantiated value
- msgId: A string; defaults to the instantiated value
 

### Misc. unlikelihoods

Undefined and null are ignored completely. Dates are converted to a string using the `.toISOString()` method. Arrays are processed into JSON strings.

### Extra keys

Any extra keys passed on an object will first be converted to structured data if possible; any keys remaining after conversion will be processed into JSON strings and appended to the log message (if any). Example:

`log.write({ foo: 'bar' });`

Outputs:
 
`<149>1 2014-12-05T22:58:07.725Z myndzi node 20428 - hello {"foo":"bar"}`

# Structured data

### From Bunyan records
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

### From Glossy records
In general, the same as above, with the exception that glossy's format makes structured data explicit in the `structuredData` key, so no "implying" is done by exclusion in the way that it is done for Bunyan.

# Using with Bunyan

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
