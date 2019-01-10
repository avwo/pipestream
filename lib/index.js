var PassThrough = require('stream').PassThrough;
var Transform = require('./transform');
var util = require('util');

var PAYLOAD_SIZE = 1024 * 16;

function PipeStream(options) {
  if (!(this instanceof PipeStream)) {
    return new PipeStream(options);
  }

  init(this);
  this._pipeError = (options && options.pipeError) !== false;
  this._options = util._extend({objectMode: true}, options);
  PassThrough.call(this, this._options);
}

util.inherits(PipeStream, PassThrough);

var proto = PipeStream.prototype;
var pipe = proto.pipe;

proto.src = function(src, pipeOpts) {
  this._originalStream && this._originalStream.emit('src', src);
  src.pipe(this, pipeOpts).pipe(this._dest, this._dest.pipeOpts);
  return this;
};

proto.pipe = function(dest, pipeOpts) {
  var self = this;
  self._originalStream && self._originalStream.emit('dest', dest);
  var pipes = self._heads.concat(self._pipes, self._tails);
  init(self);
  var passThrough = new PassThrough(this._options);
  pipe.call(self, passThrough);
  pipes.unshift(passThrough);
  dest.pipeOpts = pipeOpts;
  pipes.push(dest);
  pipeErrorToDest(self, true);
  function pipeErrorToDest(src, first) {
    var needPipeError = self._pipeError && src != dest && (first || (src.pipeOpts && src.pipeOpts.pipeError)) !== false;
    return needPipeError ? src.on('error', emitDestError) : src;
  }

  function emitDestError(err) {
    dest.emit('error', err);
  }

  self._pipeStream(pipes, 1, function(dest) {
    self.emit('_pipeEnd', dest);
  }, pipeErrorToDest);

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
    var payload;
    var done;
    var err;
    var end = function(e) {
      done = true;
      err = e;
      stream.pause();
      stream.removeListener('data', handleData);
      stream.removeListener('error', end);
      stream.removeListener('end', end);
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
    stream.getPayload = function(cb, size) {
      if (done) {
        return cb(err, payload);
      }
      if (size > payloadSize) {
        payloadSize = size;
      }
      if (!callbacks.length) {
        stream.on('data', handleData);
        stream.on('error', end);
        stream.on('end', end);
      }
      callbacks.push(cb);
    };
    stream.on('dest', function() {
      end();
      payload && self.write(payload);
      pipe.call(stream, self, pipeOpts);
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