# pipestream
pipestream用于管理stream拼接串，无需按顺序依次pipe stream，且可以通过回调的方式动态插入stream，通过pipestream拼接的stream串可以作为一个对象传递。

#Example

- `pipeStream.xxx(dest, pipeOpts)` 如果设置了`pipeOpts = {end: false}`，上一个流执行结束后不会触发当前dest的end事件，但会触发dest的ending事件
- `pipeStream.pipe`一定要在最后调用，因为执行完pipeStream.pipe，再执行 `prepend, addHead`, `add`, `addTail`, `append` 对当前的stream串不起作用。
	
		var PipeStream = require('pipestream');
		var Transform = require('stream').Transform;
		
		/**测试prepend, addHead, add, addTail, append方法**/
		
		var pipeStream = new PipeStream();
		
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
		
		process.stdin.pipe(pipeStream).pipe(process.stdout);


#API Reference

1. `PipeStream(options)` 跟正常的stream的options参数唯一区别是PipeStream多了一个pipeError的属性，用来标示是否整个pipeStream里面的stream串出现异常时把异常都传递给pipeStream.pipe(dest)里面的dest对象处理。
2. `pipeStreamObj.src(src, pipeOpts)` 相当于`src.pipe(pipeStreamObj, pipeOpts)`，且如果pipeStreamObj设置了pipeError为true，则src出错时将把错误传递给最后的dest处理。
3. `pipeStreamObj.prepend(dest, pipeOpts)` 把dest放到stream串头部第一个位置，dest可以为一个回调方法，pipeStream会自动执行该回调方法，其上一个stream及执行下一步的回调，具体使用见Example
4. `pipeStreamObj.addHead(dest, pipeOpts)` 把dest放到stream串头部最后一个位置，dest同prepend方法
5. `pipeStreamObj.add(dest, pipeOpts)` 把dest放到stream串中间最后一个位置，dest同prepend方法
6. `pipeStreamObj.addTail(dest, pipeOpts)` 把dest放到stream串尾部第一个位置，dest同prepend方法
7. `pipeStreamObj.append(dest, pipeOpts)` 把dest放到stream串尾部最后一个位置，dest同prepend方法
8. `PipeStream.Transform`  pipeStreamObj.add(`new PipeStream.Transform()`)相当于pipeStreamObj.add(`new require('stream').PassThrough({objectMode: 1}), {end: false}`)，且在执行PipeStream.Transform.prototype._transform(chunk, encoding, cb)方法时，如果传过来的chunk为null，则表示这是最后一个回调，执行该回调后流将结束，无需再监听end事件。

		


