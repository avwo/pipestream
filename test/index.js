var PipeStream = require('../');
var Transform = require('stream').Transform;

/**测试prepend, addHead, add, addTail, append方法**/

var pipeStream = new PipeStream();

//1. //pipeStream.wrapStream(process.stdin); //PipeStream.wrap(process.stdin);
pipeStream.wrapStream(process.stdout, true); //PipeStream.wrap(process.stdout, true);
//2. //process.stdin.pipe(pipeStream);
//3. //pipeStream.dest(process.stdout);

var prepend = new Transform();
prepend._transform = function(chunk, encoding, cb) {
	console.log('---------prepend-------');
	cb(null, chunk);
};

var addHead = new Transform();
addHead._transform = function(chunk, encoding, cb) {
	console.log('---------addHead-------');
	cb(null, chunk);
};

var add = new Transform();
add._transform = function(chunk, encoding, cb) {
	console.log('---------add-------');
	cb(null, chunk);
};

var addTail = new Transform();
addTail._transform = function(chunk, encoding, cb) {
	console.log('---------addTail-------');
	cb(null, chunk);
};

var append = new Transform();
append._transform = function(chunk, encoding, cb) {
	console.log('---------append-------');
	cb(null, chunk);
};

pipeStream.add(add/*, pipeOpts*/);
pipeStream.addTail(addTail/*, pipeOpts*/);
pipeStream.addHead(addHead/*, pipeOpts*/);
pipeStream.prepend(prepend/*, pipeOpts*/);
pipeStream.append(append/*, pipeOpts*/);

//动态往stream串前面插入stream对象，放在头部最后一个
pipeStream.addHead(function(src, next) {
	var dest = new Transform();
	dest._transform = function(chunk, encoding, cb) {
		console.log('---------async addHead-------');
		cb(null, chunk);
	};
	
	setTimeout(function() {
		next(src.pipe(dest));
	}, 1000);
});

//动态往stream串插入stream对象
pipeStream.add(function(src, next) {
	var dest = new Transform();
	dest._transform = function(chunk, encoding, cb) {
		console.log('---------async add-------');
		cb(null, chunk);
	};
	
	setTimeout(function() {
		next(src.pipe(dest));
	}, 2000);
});

//动态往stream串尾部插入stream对象，放在尾部第一个
pipeStream.addTail(function(src, next) {
	var dest = new Transform();
	dest._transform = function(chunk, encoding, cb) {
		console.log('---------async addTail-------');
		cb(null, chunk);
	};
	
	setTimeout(function() {
		next(src.pipe(dest));
	}, 3000);
});

//动态往stream串尾部插入stream对象，放在尾部最后一个
pipeStream.append(function(src, next) {
	var dest = new Transform();
	dest._transform = function(chunk, encoding, cb) {
		console.log('---------async append-------');
		cb(null, chunk);
	};
	
	setTimeout(function() {
		next(src.pipe(dest));
	}, 4000);
});

//动态往stream串前面插入stream对象，放在头部第一个
pipeStream.prepend(function(src, next) {
	var dest = new Transform();
	dest._transform = function(chunk, encoding, cb) {
		console.log('---------async prepend-------');
		cb(null, chunk);
	};
	
	setTimeout(function() {
		next(src.pipe(dest));
	}, 5000);
});

//1. //process.stdin.pipe(process.stdout);
process.stdout.src(process.stdin);
//2. //pipeStream.pipe(process.stdout);
//3. //pipeStream.src(process.stdin);

//process.stdin.pipe(pipeStream).pipe(process.stdout);