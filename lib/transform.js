var PassThrough = require('stream').PassThrough;
var util = require('util');

function Transform(options) {
  if (!(this instanceof Transform)) {
	  return new Transform(options);
  }
  options = util._extend({objectMode: true}, options);
  PassThrough.call(this, options);
  this.on('ending', function() {
	  var self = this;
	  self._transform(null, null, function(err, chunk) {
		  if (err) {
			  self.emit('error', err);
		  } else {
			  self.push(chunk);
			  chunk != null && self.push(null);
		  }
	  });
  });
}

util.inherits(Transform, PassThrough);

Transform.prototype._isObjectTransform = true;

module.exports = Transform;

