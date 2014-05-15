/**
 * giPush - web push
 * @version 1.0
 * @author ken
 */
define(function(require) {
	$ = require("jquery");

	//获取相对路径 不包含协议
	function getRelativeUrl() {
		var location = window.document.location,
			pathName = location.pathname;
		return location.host + pathName.substring(0, pathName.substr(1).indexOf('/') + 1)
	}
	//成功连接
	function onOpen() {
		this.connected = true; //设置连接状态
		//连接成功时回调
		var onopen = this.options.onopen;
		typeof onopen === "function" && onopen.call(this);
	}
	//异常处理
	function onError(msg) {
		var onerror = this.options.onerror;
		this.errorTimes || (this.errorTimes = 0);
		typeof onerror === "function" && onerror.call(this, ++this.errorTimes);
	}
	//关闭处理
	function onClose(msg) {
		this.connected = false; //断开连接
		this.stopHeart(); //关闭心跳连接
		//关闭通道后回调
		var onclose = this.options.onclose;
		typeof onclose === "function" && onclose.call(this, msg);
	}
	//消息处理
	function onMessage(msg) {
		//更新最新一次心跳时间
		var d = new Date();
		this.heartLastTime = d.getTime();
		//重置异常次数
		this.errorTimes = 0;
		//获取推送信息后回调
		var onmessage = this.options.onmessage;
		typeof onmessage === "function" && onmessage.call(this, msg);
	}
	//heartbeat-心跳机制
	//定时向服务器发送心跳消息，无论服务器返回任何成功状态的消息（可以是其他订阅消息的成功回调），都判断连接正常，此时将修改最后一次心跳的时间为当前时间
	//每次订阅前都检查一次，距离上一次订阅成功间隔时间是否超过规定的心跳响应时间，如果超过了，进行报警或提示。
	//开启心跳
	function startHeart(msg) {
		var that = this;
		this.heartTimer = window.setInterval(
			function() {
				beatHeart.call(that, msg)
			},
			this.options.heartInterval
		);
	}
	//暂停心跳
	function stopHeart() {
		this.heartTimer && clearInterval(this.heartTimer)
	}
	//心跳
	function beatHeart(msg) {
		var d = new Date(),
			t = d.getTime(),
			options = this.options;
		t - this.heartLastTime >= options.heartTimeout && onClose.call(this);
		this.send(msg); //发送心跳消息
	}
	//websocket 构造器
	//http协议还需要配置
	function Socket(options) {
		var that = this;
		var socket = new WebSocket("ws://" + getRelativeUrl() + "/" + options.url);

		this.options = options;
		this.socket = socket;

		socket.onopen = function() {
			onOpen.call(that)
		};
		socket.onmessage = function(msg) {
			onMessage.call(that, msg.data)
		};
		socket.onerror = function(msg) {
			onError.call(that, msg.data)
		};
		socket.onclose = function(msg) {
			onClose.call(that, msg.data)
		};
	}
	Socket.prototype.send = function(msg) {
		this.connected && this.socket.send(msg);
	};
	Socket.prototype.join = function(msg) {
		this.send(msg);
	};
	Socket.prototype.close = function() {
		this.connected && this.socket.close();
	};
	Socket.prototype.startHeart = startHeart;
	Socket.prototype.stopHeart = stopHeart;
	//Comet 构造器
	function Comet(options) {
		this.options = options;
		onOpen.call(this);
	}
	Comet.prototype.send = function(msg) {
		var that = this;
		if (this.connected) {
			$.ajax({
				type: 'post',
				url: this.options.url,
				data: "push=" + msg,
				timeout: 60000,
				error: function() {
					onError.call(that)
				}
			});
		}
	};
	Comet.prototype.join = function(msg) {
		var that = this;
		if (this.connected) {
			//无论正常或异常，回调后依然订阅，除非通道关闭
			$.ajax({
				type: 'post',
				url: this.options.url,
				data: "push=" + msg,
				timeout: 0, //永远不超时
				success: function(jsonStr) {
					onMessage.call(that, jsonStr);
					that._joinTimer && window.clearTimeout(that._joinTimer);
					that._joinTimer = window.setTimeout(function() {
						that.join.call(that, msg)
					}, 500);
				},
				error: function() {
					onError.call(that);
					that._joinTimer && window.clearTimeout(that._joinTimer);
					that._joinTimer = window.setTimeout(function() {
						that.join.call(that, msg)
					}, 1000);
				}
			});
		}
	};
	Comet.prototype.close = function(msg) {
		if (this.connected) {
			//this.send(msg); //发送关闭通知
			onClose.call(this);
		}
	};
	Comet.prototype.startHeart = startHeart;
	Comet.prototype.stopHeart = stopHeart;
	//入口方法
	return function(options) {
		var o = {
			url: "",
			heartInterval: 1000 * 60 * 5,
			heartTimeout: 1000 * 60 * 5 * 2,
			onopen: null,
			onerror: null,
			onclose: null,
			onmessage: null
		};
		if (typeof options == "object") {
			for (var a in o) {
				var val = options[a];
				if (typeof val !== "undefined") {
					o[a] = val
				}
			}
		}
		if (window.WebSocket) {
			return new Socket(o);
		} else {
			return new Comet(o);
		}
	}
});