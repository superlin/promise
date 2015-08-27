var Promise = (function (undefined) {

  // promise 的状态
  var PENDING = 0,
    FULFILLED = 1,
    REJECTED = 2;

  // promise 编号计数，用于调试
  var counter = 0;

  function noop() { }

  // 规范里是将FulfillReactions和RejectReactions
  // 放入操作队列，这里简单调用timeout完成
  function asap(callback, arg) {
    setTimeout(function () {
      callback(arg);
    }, 0);
  }

  function handleOwnThenable(promise, thenable) {
    // 如果返回的promise已经完成
    // 直接用该promise的值resolve父promise
    if (thenable._state === FULFILLED) {
      resolve(promise, thenable._result);
    } else if (thenable._state === REJECTED) {
      reject(promise, thenable._result);
    }
    // 如果返回的promise未完成
    // 要等该promise完成再resolve父promise
    else {
      subscribe(thenable, undefined, function (value) {
        resolve(promise, value);
      }, function (reason) {
        reject(promise, reason);
      });
    }
  }

  function resolve(promise, value) {
    // 要resolve的为promise（then的callback返回的是promise）
    if (typeof value === 'object' && promise.constructor === value.constructor) {
      handleOwnThenable(promise, value);
    }
    // 要resolve的是值
    else {
      if (promise._state !== PENDING) {
        return;
      }

      promise._result = value;
      promise._state = FULFILLED;

      asap(publish, promise);
    }
  }

  function reject(promise, reason) {
    if (promise._state !== PENDING) {
      return;
    }
    promise._state = REJECTED;
    promise._result = reason;

    asap(publish, promise);
  }

  function publish(promise) {
    var subscribers = promise._subscribers;
    var settled = promise._state;

    if (subscribers.length === 0) {
      return;
    }

    var child, callback, detail = promise._result;

    for (var i = 0; i < subscribers.length; i += 3) {
      child = subscribers[i];
      callback = subscribers[i + settled];

      // promise订阅，需要解析（resolve或reject）
      if (child) {
        invokeCallback(settled, child, callback, detail);
      }
      // 回调函数订阅，执行即可
      else {
        callback(detail);
      }
    }

    promise._subscribers.length = 0;
  }

  function subscribe(parent, child, onFulfillment, onRejection) {
    var subscribers = parent._subscribers;
    var length = subscribers.length;

    subscribers[length] = child;
    subscribers[length + FULFILLED] = onFulfillment;
    subscribers[length + REJECTED] = onRejection;

    if (parent._state) {
      asap(publish, parent);
    }
  }

  function invokeCallback(settled, promise, callback, detail) {
    var hasCallback = (typeof callback === 'function'),
      value, error, succeeded, failed;

    if (hasCallback) {

      try {
        value = callback(detail);
      } catch (e) {
        value = {
          error: e
        };
      }

      if (value && !!value.error) {
        failed = true;
        error = value.error;
        value = null;
      } else {
        succeeded = true;
      }

    }
    // then的参数不是函数
    // 会被忽略，也就是promise穿透
    else {
      value = detail;
      succeeded = true;
    }

    if (promise._state === PENDING) {
      if (hasCallback && succeeded || settled === FULFILLED) {
        resolve(promise, value);
      } else if (failed || settled === REJECTED) {
        reject(promise, error);
      }
    }
  }

  function Promise(resolver) {
    this._id = counter++;
    this._state = PENDING;
    this._result = undefined;
    this._subscribers = [];

    var promise = this;

    if (noop !== resolver) {
      try {
        resolver(function (value) {
          resolve(promise, value);
        }, function (reason) {
          reject(promise, reason);
        });
      } catch (e) {
        reject(promise, e);
      }
    }
  }

  Promise.resolve = function (arg) {
    var child = new Promise(noop);
    resolve(child, arg);
    return child;
  };

  Promise.reject = function (reason) {
    var child = new Promise(noop);
    reject(child, reason);
    return child;
  };

  Promise.all = function (promises) {
    var child = new Promise(noop);
    var record = {
      remain: promises.length,
      values: []
    };
    promises.forEach(function (promise, i) {
      if (promise._state === PENDING) {
        subscribe(promise, undefined, onFulfilled(i), onRejected);
      } else if (promise._state === REJECTED) {
        reject(child, promise._result);
        return false;
      } else {
        --record.remain;
        record.values[i] = promise._result;
        if (record.remain == 0) {
          resolve(child, values);
        }
      }
    });
    return child;

    function onFulfilled(i) {
      return function (val) {
        --record.remain;
        record.values[i] = val;
        if (record.remain == 0) {
          resolve(child, record.values);
        }
      }
    }

    function onRejected(reason) {
      reject(child, reason);
    }
  };

  Promise.race = function (promises) {
    var child = new Promise(noop);

    promises.forEach(function (promise, i) {
      if (promise._state === PENDING) {
        subscribe(promise, undefined, onFulfilled, onRejected);
      } else if (promise._state === REJECTED) {
        reject(child, promise._result);
        return false;
      } else {
        resolve(child, promise._result);
        return false;
      }
    });
    return child;

    function onFulfilled(val) {
      resolve(child, val);
    }

    function onRejected(reason) {
      reject(child, reason);
    }
  };

  Promise.prototype = {
    constructor: Promise,

    then: function (onFulfillment, onRejection) {
      var parent = this;
      var state = parent._state;

      if (state === FULFILLED && !onFulfillment || state === REJECTED && !onRejection) {
        return this;
      }

      var child = new Promise(noop);
      var result = parent._result;

      if (state) {
        var callback = arguments[state - 1];
        asap(function () {
          invokeCallback(state, child, callback, result);
        });
      } else {
        subscribe(parent, child, onFulfillment, onRejection);
      }

      return child;
    },

    'catch': function (onRejection) {
      return this.then(null, onRejection);
    }
  };

  return Promise;
})();

var p1 = new Promise(function (resolve, reject) {
  setTimeout(function () {
    resolve(123);
  }, 100);
});

var p2 = new Promise(function (resolve, reject) {
  setTimeout(function () {
    resolve(223);
  }, 500);
});

var p3 = new Promise(function (resolve, reject) {
  setTimeout(function () {
    resolve(323);
  }, 300);
});


// Promise.race([p1, p2, p3]).then(function (vals) {
// 	console.log(vals);
// });

p3.then(function (val) {
  return new Promise(function (resl, rej) {
    setTimeout(function () {
      resl(val);
    }, 100);
  });
}).then(function (val) {
  console.log(val);
})

Promise.resolve('foo').then(Promise.resolve('bar')).then(function (result) {
  console.log(result);
});
