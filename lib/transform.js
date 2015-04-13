var PassThrough = require('stream').PassThrough;
var util = require('util');

function Transform(options) {
  if (!(this instanceof Transform)) {
	  return new Transform(options);
  }
  options = util._extend({objectMode: true}, options);
  PassThrough.call(this, options);
  this.once('ending', function() {
	  var self = this;
	  self._transform(null, null, function(err, chunk) {
		  self._transform = passThrough;
		  if (err) {
			  self.emit('error', err);
		  } else {
			  self.end(chunk);
		  }
	  });
  });
}

util.inherits(Transform, PassThrough);

Transform.prototype._isObjectTransform = true;

function passThrough(chunk, encoding, callback) {
	callback(null, chunk);
}

module.exports = Transform;
