define(function(require,exports,module){
	var $ = require('jquery');
	//心跳机制
	//定时向服务器发送心跳消息，无论服务器返回任何成功状态的消息（可以是其他订阅消息的成功回调），都判断连接正常，此时将修改最后一次心跳的时间为当前时间
	//每次订阅前都检查一次，距离上一次订阅成功间隔时间是否超过规定的心跳响应时间，如果超过了，进行报警或提示。
	var messagePush=function(options){
		//配置
		options=$.extend(
			true,
			{
				url:'',
				heartbeatInterval:1000*60*5,
				heartbeatTimeout:1000*60*5*2,
				heartbeatError:null,
				onopen:null,
				onerror:null,
				onclose:null,
				onmessage:null
			},
			options
		);
		this.options=options;
		//定义公用方法
		var that=this,
			onopen=options.onopen,
			onjoin=options.onjoin;	
		if(window.WebSocket && 0){
			var onmessage=options.onmessage,
				onerror=options.onerror,
				onclose=options.onclose,
				url=options.url,
				socket = new WebSocket("ws://"+this.getRelativeUrl()+"/"+url);
			//响应连接
			socket.onopen = function(){
				that.connected=true;//设置状态
				onopen && onopen.call(that);//连接正常
				onjoin && onjoin.call(that);//握手
			};
			//响应消息
			socket.onmessage = function(msg){
				var d=new Date();
				that.heartLastTime=d.getTime();
				onmessage && onmessage.call(that,msg.data);
			};
			//响应异常
			socket.onerror = function(msg){
				onerror && onerror.call(that,msg);
			}; 
			//响应断开
			socket.onclose = function(msg){
				onclose && onclose.call(that,msg);
				that.connected=false;
			};
			
			this._socket=socket;//私有
			this.send=this.wsSend;
			this.book=this.wsSend;
			this.close=this.wsClose;
		}else{
			this.send=this.cmSend;
			this.book=this.cmBook;
			this.close=this.cmClose;
			
			this.connected=true;//设置状态
			onopen && onopen.call(this);//连接正常
			onjoin && onjoin.call(this);//握手
		}
	}
	//websocket send
	messagePush.prototype.wsSend=function(msg){
		this.connected && this._socket.send(msg);	
	};
	//comet send
	messagePush.prototype.cmSend=function(msg){
		var that=this,
			options=this.options;
		if(this.connected){
			$.ajax({
				type :'post',
				url : options.url,
				data :"push="+msg,
				timeout :60000,
				success : function(jsonStr){
					var onmessage=options.onmessage;
					onmessage && onmessage.call(that,jsonStr);	
				},
				error:function(){
					var onerror=options.onerror;
					onerror && onerror.call(that);
				}
			});	
		}
	};
	//comet book
	messagePush.prototype.cmBook=function(msg){
		var that=this,
			options=this.options;
		if(this.connected){
			$.ajax({
				type :'post',
				url : options.url,
				data :"push="+msg,
				success : function(jsonStr){
					var onmessage=options.onmessage;
					onmessage && onmessage.call(that,jsonStr);
					//继续订阅
					window.setTimeout(
						function(){
							that.cmBook(msg)
						},
						1000
					);
				},
				error:function(){
					//发现异常
					var onerror=options.onerror;
					onerror && onerror.call(that);
					//异常情况下依然订阅，保持联通，除非通道关闭
					window.setTimeout(
						function(){
							that.cmBook(msg)
						},
						1000
					);
				}
			});	
		}
	};
	//comet close
	messagePush.prototype.cmClose=function(){
		if(this.connected){
			//断开连接
			this.connected = false;
			
			//关闭事件
			var onclose=this.options.onclose;
			onclose && onclose.call(this);
			
			//关闭心跳连接
			if(this.heartStatus){
				this.heartStatus=0;
				
				var heartbeatTimer=this.heartbeatTimer;
				heartbeatTimer && clearInterval(heartbeatTimer);
			}
		} 
	};
	//websocket close
	messagePush.prototype.wsClose=function(){
		if(this.connected){
			//断开连接
			this.connected = false;
			
			//关闭事件
			var onclose=this.options.onclose;
			onclose && onclose.call(this);
			
			//关闭心跳连接
			var heartStatus=this.heartStatus,
				heartbeatTimer=this.heartbeatTimer;
			if(heartStatus){
				heartStatus=0;
				heartbeatTimer && clearInterval(heartbeatTimer);
			}
			
			//释放引用
			var socket=this._socket;
			if(socket){
				socket.close();
				if(socket.close() != null){  
					this._socket = null;
				}  	
			}
		} 
	};
	//开启心跳
	messagePush.prototype.heart=function(msg){
		var that=this,
			d=new Date(),
			options=this.options,
			interval=options.heartbeatInterval;//心跳间隔
		if(this.connected){	
			//心跳属性
			this.heartStatus=1;//心跳状态 0 未开启 1 正常 -1 异常
			this.heartLastTime=d.getTime();//更新最后一次心跳时间
			
			//开启定时器
			this.heartTimer=window.setInterval(
				function(){
					that._heartOne(msg);
				},
				interval
			); 
		}
	};
	//单次心跳
	messagePush.prototype._heartOne=function(msg){
		var d=new Date(),
			t=d.getTime(),
			lastTime=this.heartLastTime,
			status=this.heartStatus,
			options=this.options,
			timeout=options.heartbeatTimeout;
		
		if(t-lastTime>=timeout){
			//发现异常
			if(status!=-1){
				var error=options.heartbeatError;
				//判断是否一直存于异常状态
				status=-1;//状态 异常
				error && error();
			}
		}else{
			//正常
			lastTime=t;
			if(status!=1){
				var succuss=options.heartbeatSuccuss;
				//网络之前处于非正常状态，现在已经恢复正常
				status=1;//状态 异常
				succuss && succuss();
			}
		} 
		this.send(msg);
	};
	//获取相对路径 不包含协议
	messagePush.prototype.getRelativeUrl=function(){
		var location=window.document.location,
			pathName=location.pathname;
		return location.host+pathName.substring(0,pathName.substr(1).indexOf('/')+1)
	};
	
	//接口
	return messagePush;
});