var PassThrough = require('stream').PassThrough;
var util = require('util');

function Transform(options) {
  if (!(this instanceof Transform)) {
    return new Transform(options);
  }
  options = util._extend({
    objectMode: true,
    highWaterMark: 0
  }, options);
  PassThrough.call(this, options);
}

util.inherits(Transform, PassThrough);

var proto = Transform.prototype;

proto.push_ = proto.push;
proto.push = function(chunk, encoding) {
  if (chunk != null) {
    return this.push_(chunk, encoding);
  }
};

proto.end_ = proto.end;
proto.end = function() {
  var self = this;
  self.once('finish', function() {
    self._transform(null, null, function(err, chunk) {
      if (err) {
        self.emit('error', err);
      } else {
        self.push(chunk);
        self.push_(null);
      }
    });
  });
  return self.end_();
};

module.exports = Transform;

