var PassThrough = require('stream').PassThrough;
var Transform = require('./transform');
var util = require('util');

function PipeStream(options) {
  if (!(this instanceof PipeStream)) {
	  return new PipeStream(options);
  }

  init(this);
  this._pipeError = (options && options.pipeError) !== false;
  PassThrough.call(this, options);
}

util.inherits(PipeStream, PassThrough);

var proto = PipeStream.prototype;
var pipe = proto.pipe;

proto.src = function(src, pipeOpts) {
	var self = this;
	if (pipeOpts && pipeOpts.pipeError) {
		src.on('error', function(err) {
			self.emit('error', err);
		});
	}
	src.pipe(self, pipeOpts).pipe(this._dest, this._dest.pipeOpts);
	return self;
};

proto.pipe = function(dest, pipeOpts) {
	var pipes = this._heads.concat(this._pipes, this._tails);
	init(this);
	var passThrough = new PassThrough();
	pipe.call(this, passThrough);
	pipes.unshift(passThrough);
	dest.pipeOpts = pipeOpts;
	pipes.push(dest);
	var pipeError = this._pipeError;
	pipeStream(pipes, 1, function(dest) {
		if (pipeError) {
			function emitError(err) {
				dest.emit('error', err);
			}
			pipes.forEach(function(pipe) {
				if (pipe != dest) {
					pipe.on('error', emitError);
				}
			});
		}
	});
	
	return dest;
};

function pipeStream(pipes, i, callback) {
	var pipe = pipes[i];
	var src = pipes[i - 1]; 
	if (typeof pipe == 'function') {
		pipe(src, function(dest) {
			pipes[i] = dest;
			next();
		});
	} else {
		pipeEndingStream(src, pipe, pipe.pipeOpts);
		next();
	}
	
	function next() {
		if (i + 1 == pipes.length) {
			callback(pipes[i]);
		} else {
			pipeStream(pipes, ++i, callback);
		}
	}
}

function pipeEndingStream(src, dest, pipeOpts) {
	if (dest._isObjectTransform) {
		pipeOpts = util._extend({end: false}, pipeOpts);
	}
	
	if (pipeOpts && (pipeOpts.end === false)) {
		src.once('end', function() {
			dest.emit('ending');
		});
	}
	return src.pipe(dest, pipeOpts);
}

proto.add = function(pipe, pipeOpts) {
	pipe.pipeOpts = pipeOpts;
	this._pipes.push(pipe);
	return this;
};

proto.addHead = function(pipe, pipeOpts) {
	pipe.pipeOpts = pipeOpts;
	this._heads.push(pipe);
	return this;
};

proto.prepend = function(pipe, pipeOpts) {
	pipe.pipeOpts = pipeOpts;
	this._heads.unshift(pipe);
	return this;
};

proto.addTail = function(pipe, pipeOpts) {
	pipe.pipeOpts = pipeOpts;
	this._tails.unshift(pipe);
	return this;
};

proto.append = function(pipe, pipeOpts) {
	pipe.pipeOpts = pipeOpts;
	this._tails.push(pipe);
	return this;
};

proto.dest = function(dest, pipeOpts) {
	dest.pipeOpts = pipeOpts;
	this._dest = dest;
	return dest;
};

function init(pipeStream) {
	pipeStream._heads = [];
	pipeStream._pipes = [];
	pipeStream._tails = [];
}

PipeStream.pipe = pipeEndingStream;
PipeStream.Transform = Transform;
PipeStream.wrap = function(stream, pipeOpts, dest) {
	return new PipeStream().wrapStream(stream, pipeOpts, dest);
};

var keys = Object.keys(proto);
proto.wrapStream = function(stream, pipeOpts, dest) {
	if (typeof pipeOpts == 'boolean') {
		var tmp = pipeOpts;
		pipeOpts = dest;
		dest = tmp;
	}
	var self = this;
	if (dest) {
		self.dest(stream, pipeOpts);
	} else {
		if (pipeOpts && pipeOpts.pipeError) {
			stream.on('error', function(err) {
				self.emit('error', err);
			});
		}
		stream.pipe(this, pipeOpts);
	}
	
	for (var i = 0, key; key = keys[i]; i++) {
		if (dest ? i != 'pipe' : i != 'src') {
			stream[key] = this[key].bind(this);
		}
	}
	
	return stream;
};

module.exports = PipeStream;