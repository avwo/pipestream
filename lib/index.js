var PassThrough = require('stream').PassThrough;
var Transform = require('./transform');
var util = require('util');

var PAYLOAD_SIZE = 1024 * 16;

function getDecoder(stream, callback) {
  if (!stream || stream._hasGotDecoder || typeof stream.onDecode !== 'function') {
    return callback();
  }
  stream._hasGotDecoder = true;
  stream.onDecode(callback);
}

function getEncoder(stream, callback) {
  if (!stream || stream._hasGotEncoder || typeof stream.onEncode !== 'function') {
    return callback();
  }
  stream._hasGotEncoder = true;
  stream.onEncode(callback);
}

function PipeStream(options) {
  if (!(this instanceof PipeStream)) {
    return new PipeStream(options);
  }

  init(this);
  this._pipeError = (options && options.pipeError) !== false;
  this._options = util._extend({
    objectMode: true,
    highWaterMark: 0
  }, options);
  PassThrough.call(this, this._options);
}

util.inherits(PipeStream, PassThrough);

var proto = PipeStream.prototype;
var originPipe = proto.pipe;

proto.prepareSrc = function(src, cb) {
  var self = this;
  if (self._preparedSrcStream) {
    return cb(self._preparedSrcStream);
  }
  getDecoder(self._originalStream, function(decoder, socket) {
    if (decoder) {
      src = src.pipe(decoder, decoder.pipeOpts);
    }
    src = socket || src;
    self._preparedSrcStream = src;
    return cb(src);
  });
};

proto.src = function(src, pipeOpts, buffer) {
  var self = this;
  var stream = self._originalStream;
  if (stream && !stream.__hasEmitedSrcEvent) {
    stream.__hasEmitedSrcEvent = true;
    stream.emit('src', src);
  }
  self.prepareSrc(src, function(_src) {
    getEncoder(stream, function(encoder) {
      var dest = self._dest;
      if (encoder) {
        encoder.pipe(dest, dest.pipeOpts);
        dest = encoder;
      }
      buffer && self.write(buffer);
      _src.pipe(self, pipeOpts).pipe(dest, dest.pipeOpts);
      _src.resume();
    });
  });
  return this;
};

proto.pipe = function(dest, pipeOpts) {
  var self = this;
  var stream = self._originalStream;
  var emitDestError = function(err) {
    dest.emit('error', err);
  };
  if (stream && !stream.__hasEmitedDestEvent) {
    stream.__hasEmitedDestEvent = true;
    stream.emit('dest', dest);
  }
  var pipes = self._heads.concat(self._pipes, self._tails);
  init(self);
  getEncoder(stream, function(encoder) {
    var passThrough = new PassThrough(self._options);
    originPipe.call(self, passThrough);
    pipes.unshift(passThrough);
    dest.pipeOpts = pipeOpts;
    if (encoder) {
      pipes.push(encoder);
    }
    pipes.push(dest);
    var pipeErrorToDest = function(src, pipeError) {
      var needPipeError = self._pipeError && !src._noPipeError && src != dest
        && (pipeError || (src.pipeOpts && src.pipeOpts.pipeError)) !== false;
      return needPipeError ? src.on('error', emitDestError) : src;
    };
    pipeErrorToDest(self, true);
    self._pipeStream(pipes, 1, function(dest) {
      self.emit('_pipeEnd', dest);
    }, pipeErrorToDest);
  });
  return dest;
};

proto._pipeStream = function pipeStream(pipes, i, callback, pipeErrorToDest) {
  var self = this;
  var pipe = pipes[i];
  var src = pipes[i - 1]; 
  if (typeof pipe == 'function') {
    pipe(src, function(dest) {
      pipes[i] = pipeErrorToDest(dest);
      next();
    });
  } else if (src instanceof PipeStream) {
    src.once('_pipeEnd', next);
    src.pipe(pipeErrorToDest(pipe), pipe.pipeOpts);
  } else {
    src.pipe(pipeErrorToDest(pipe), pipe.pipeOpts);
    next();
  }

  function next() {
    if (i + 1 == pipes.length) {
      callback(pipe);
    } else {
      self._pipeStream(pipes, ++i, callback, pipeErrorToDest);
    }
  }
};

proto.add = function(pipe, pipeOpts) {
  pipe.pipeOpts = pipeOpts;
  this._pipes.push(pipe);
  return this;
};

proto.insert = function(pipe, pipeOpts, index) {
  if (typeof pipeOpts == 'number') {
    var tmp = pipeOpts;
    pipeOpts = index;
    index = tmp;
  }
  pipe.pipeOpts = pipeOpts;
  typeof index == 'number' ? this._pipes.splice(index, 0, pipe) : this._pipes.push(pipe);
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

PipeStream.Transform = Transform;
PipeStream.wrap = function(stream, dest, options) {
  return new PipeStream(options).wrapStream(stream, dest, options);
};

PipeStream.wrapSrc = function(stream, options) {

  return PipeStream.wrap(stream, false, options);
};

PipeStream.wrapDest = function(stream, options) {

  return PipeStream.wrap(stream, true, options);
};

var keys = Object.keys(proto);
var getPayloadSize = function(opts) {
  var payloadSize = opts && opts.getPayloadSize;
  return payloadSize > 0 ? payloadSize : PAYLOAD_SIZE;
};

proto.wrapStream = function(stream, dest, pipeOpts) {
  if (typeof pipeOpts == 'boolean' && typeof dest != 'boolean') {
    var tmp = pipeOpts;
    pipeOpts = dest;
    dest = tmp;
  }

  this._originalStream = stream;
  if (dest) {
    this.dest(stream, pipeOpts);
  } else {
    var self = this;
    var streamPipe = stream.pipe;
    var payloadSize = getPayloadSize(pipeOpts);
    var callbacks = [];
    var payload, done, err, deStream;
    var end = function(e) {
      done = true;
      err = e;
      stream.pause();
      deStream.pause();
      deStream.removeListener('data', handleData);
      deStream.removeListener('error', end);
      deStream.removeListener('end', end);
      callbacks.forEach(function(cb) {
        cb(err, payload);
      });
      callbacks = [];
    };
    var handleData = function(data) {
      payload = payload ? Buffer.concat([payload, data]) : data;
      if (payload.length >= payloadSize) {
        end();
      }
    };
    var getReqDecoder = function(stream, callback) {
      if (deStream) {
        return callback(deStream);
      }
      getDecoder(stream, function(decoder, socket) {
        deStream = socket || decoder || stream;
        if (decoder = decoder || socket) {
          streamPipe.call(stream, decoder);
        }
        callback(deStream);
      });
    };
    stream.getPayload = function(cb, size) {
      if (done) {
        return cb(err, payload);
      }
      if (size > 0) {
        payloadSize = size;
      }
      if (!callbacks.length) {
        getReqDecoder(stream, function() {
          deStream.on('data', handleData);
          deStream.on('error', end);
          deStream.on('end', end);
        });
      }
      callbacks.push(cb);
    };
    stream.once('dest', function() {
      getReqDecoder(stream, function() {
        end();
        payload && self.write(payload);
        if (stream === deStream) {
          streamPipe.call(deStream, self, pipeOpts);
        } else {
          deStream.pipe(self, pipeOpts);
          deStream.resume();
        }
        stream.resume();
      });
    });
  }

  for (var i = 0, key; key = keys[i]; i++) {
    if (dest ? i != 'pipe' : i != 'src') {
      stream[key] = this[key].bind(this);
    }
  }

  return stream;
};

module.exports = PipeStream;
