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

function pipeError(src, target) {
  src && src.on('error', function(err) {
    target.emit('error', err);
  });
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
  if (this._preparedSrcStream) {
    return cb(this._preparedSrcStream, this._preparedSrcDecoder);
  }
  getDecoder(this._originalStream, function(decoder) {
    pipeError(decoder, src);
    var promise;
    if (decoder) {
      promise = decoder._originalPipePromise;
      src = src.pipe(decoder, decoder.pipeOpts);
    }
    this._preparedSrcStream = src;
    if (!promise) {
      return cb(src);
    }
    promise.then(function(stream) {
      this._preparedSrcDecoder = stream;
      cb(src, stream);
    });
  });
};

proto.src = function(src, pipeOpts, buffer) {
  var self = this;
  var stream = self._originalStream;
  stream && stream.emit('src', src);
  this.prepareSrc(src, function(_src) {
    getEncoder(stream, function(encoder) {
      pipeError(encoder, src);
      var dest = self._dest;
      if (encoder) {
        encoder.pipe(dest, dest.pipeOpts);
        dest = encoder;
      }
      buffer && self.write(buffer);
      _src.pipe(self, pipeOpts).pipe(dest, dest.pipeOpts);
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
  stream && stream.emit('dest', dest);
  var pipes = self._heads.concat(self._pipes, self._tails);
  init(self);
  getEncoder(stream, function(encoder) {
    var passThrough = new PassThrough(this._options);
    originPipe.call(self, passThrough);
    pipes.unshift(passThrough);
    dest.pipeOpts = pipeOpts;
    if (encoder) {
      encoder.on('error', emitDestError);
      encoder._noPipeError = false;
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
    var pipe = stream.pipe;
    var payloadSize = getPayloadSize(pipeOpts);
    var callbacks = [];
    var payload, done, err, decodeStream, srcStream;
    var end = function(e) {
      done = true;
      err = e;
      stream.pause();
      srcStream = srcStream || decodeStream;
      srcStream.removeListener('data', handleData);
      srcStream.removeListener('error', end);
      srcStream.removeListener('end', end);
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
      if (decodeStream) {
        return callback(decodeStream);
      }
      getDecoder(stream, function(decoder) {
        decodeStream = decoder || stream;
        if (decoder) {
          pipeError(decoder, stream);
          pipe.call(stream, decoder, decoder.pipeOpts);
          pipe = decoder.pipe;
        }
        callback(decodeStream);
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
          var receiveData = function(s) {
            srcStream = s;
            srcStream.on('data', handleData);
            srcStream.on('error', end);
            srcStream.on('end', end);
          };
          var promise = decodeStream._originalPipePromise;
          if (promise) {
            promise.then(receiveData);
          } else {
            receiveData(decodeStream);
          }
        });
      }
      callbacks.push(cb);
    };
    stream.on('dest', function() {
      getReqDecoder(stream, function() {
        end();
        payload && self.write(payload);
        pipe.call(decodeStream, self, pipeOpts);
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
