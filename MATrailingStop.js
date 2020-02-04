
var key = ''
var secret = '' //insert your keys here
const Derb = new Connection(key, secret)
const rest = require('restler')
const async = require('async')
const WebSocket = require('ws');
const EventEmitter = require('events');
const loopInterval = 1000000 //~>15 minutes in milliseconds, keeping this simple, we loop this often 
                            //if you start this algo not in alignment with the local hour, the 15-min interval should fix that

var myTrailingStopMAPeriod = 50 //this is your key customizable input to this script that sets your trailing stop where *you* think it should go
var myHourlyMAs = [myTrailingStopMAPeriod,400] //add more periods if you please
var myTrailingStopValue = 1 //dummy value, will be updated with MA logic and used to adjust stops
var positionSize = 0
var myInstrument = "BTC-27MAR20" //insert the code for whatever instrument you are trend-following with here
                                //if you don't update this/the code is for an expired contract, will create a problem

const wait = n => new Promise(r => setTimeout(r, n));

var WSData = {tape:0} //this is a good place to put data from websockets feeds, possibly in arrays
                      //but we're lazy so just record last perp trade price

const ws = new WebSocket('wss://www.deribit.com/ws/api/v2', {
  perMessageDeflate: false
});
//you might be using futures to reduce cost of capital for trend-following, but the data we'll use to construct the 
//moving averages for the stop is based on the perpetual because meh 
ws.onmessage = function (e) {
  //console.log(e)
    // do something with the response...
    if(e.data.params != undefined){
      if(e.data.params.channel == "trades.BTC-PERPETUAL.raw"){
          WSData.tape=e.params.data[0].price
      }
    }
    //sort data to allocate to different arrays of WSData
};

ws.onopen = function () {
  
  var msg1 = 
  {
    "jsonrpc": "2.0",
    "id": 2765,
    "method": "public/subscribe",
    "params": {
        "channels": [
            "book.BTC-PERPETUAL.2.10.100ms"
          ]
      }
  }
  var msg2 = {
          "jsonrpc": "2.0",
          "method": "public/subscribe",
          "id": 42,
          "params": {
            "channels": ["trades.BTC-PERPETUAL.raw"]
          }
      };

    ws.send(JSON.stringify(msg1))
    ws.send(JSON.stringify(msg2))
};


//global data
var highs = []
var lows = []
var opens = []
var orderids = []

var hourMAs = []
var candles = {}
var lastHourTimestamp = roundToHour()

function roundToHour(){
  var date = new Date().getTime() 
  p = 60 * 60 * 1000; // milliseconds in an hour
  return Math.floor(date / p ) * p;
}

function loadData(){
  var nearestHour = roundToHour()
  var starttime = 1540000000000 //this is a dummy value, it could be 100 or whatever, Deribit's call logic is wonky here, it just returns last 10k candles
  var endtime = nearestHour
  var instrumentname = 'BTC-PERPETUAL' 
  var string = 'https://www.deribit.com/api/v2/public/get_tradingview_chart_data'+'?instrument_name='+instrumentname+'&start_timestamp='+starttime+'&end_timestamp='+endtime+'&resolution=1'
      //console.log(string)
    rest.get(string).on('complete', function(data){
        candles = data.result
        lows = candles.low.reverse() //everything is in order from oldest to newest so we flip that script
        highs = candles.high.reverse()
        opens = candles.open.reverse()
        drawMAs(myHourlyMAs) //this whole waterfall function call business is old-school pre-Promises but hey
    }
}


function drawMAs(periods){
      var thisData = {}
      for(var i = 0; i<periods.length();i++){
        var period = periods[i]
        var sum = 0
        for(var p = 0; p<period;p++){
          var candle = thisTimeframe[p].result
          var hl3 = (highs[p]+lows[p]+opens[p])/3
          sum += hl3
        }
        if(period == periods[0]){thisData.hour.MA = sum/period}
        if(period == periods[1]){thisData.hour.MA2 = sum/period}
        if(period ==myTrailingStopMAPeriod){myTrailingStopValue = sum/period}   
      }
        hourMAs.unshift(thisData.hour)
        controller()
        //an earlier version of this had an update Boolean paremeter and would unshift just once for that, 
        //and compile a lot of historical MA values, but this keeps it simple, you still end up with a lot of MA prints in the
        //hourMAs array, which contains objects, the objects have properties MA, MA2 etc. as you wish to add them
        //yes you could make more complex indicators with these but we're going with a simple MA print level to move up the trailing stop
        //line 106 is the money shot, making the other object somewhat vestigial, this is a simplified version of a more elaborate system
}

var loops = 0
var state = 0

async function tradingLoop(state){
  loops+=1
  console.log("Loops: "+loops," State: " + state) //I know this is statist but it's also loopist
  /*
  State 0: Passive, no position
  State 1: Initially create MA-based trailing stop
  State 2: Scan for whether enough time has passed to update the stop
  State 3: Update the stop

  This is a Finite State Machine style approach to organizing the trading system logic, 
  you could really go places with this, adding more states
  */

  var hasPositions = checkConditions() //determines if you have a position open, you have to open your position manually with this
    if(hasPositions==false&&state!=0){state=0}else if((state==null||state==0)&&hasPositions!=false){
      state=1, console.log("Me and DB will peek out our heads")
    }

  switch(state){
    case 0: 
      positionSize = await reviewPositions()
      if(positionSize==0){
        return state
      }else{
        state =1 
        return state
      }

    break;
      
    case 1:
      var openReduceOrderSize = await reviewOrders()
      if(openReduceOrderSize==0){
          var sell =await Derb.request(
                    'private/sell',
                    {instrument_name:myInstrument,amount:size,type:"stop-market",price:myTrailingStopValue,reduce_only:true}
                    )
          state+=1
          return state
      }else if(openReduceOrderSize<positionSize){
        var adjust = positionSize - openReduceOrderSize
        //just in case things aren't congruent
        var edit = await Derb.request(
                    'private/edit',
                    {order_id:orderids[0],amount:adjust,type:"stop-market",price:myTrailingStopValue,reduce_only:true}
                    )
        //we're only grabbing the first order id in the array so could create a bug if you've got multiple trailing stops
        //poly trailing stops is cool for a future version, 
        //but you could copy/paste this script with multiple names/myTrailingStopMA values in sub-accounts for now
        state+=1
      }else{
          state+=1
          return state
      }

    break;
      
    case 2:
      positionSize = await reviewPositions()//check that we haven't gotten stopped out
      if(positionSize== 0){
        state = 0
        return state 
      }

      var time = roundToHour()
      if(time>lastHourTimestamp){
        lastHourTimestamp = time
        state+=1
        return state
      }else{
        return state
      }

    break;

    case 3:
    positionSize = await reviewPositions() //refresh this data in case something changed
    if(positionSize==0){
      state = 0
      return state
    }else{
      var edit = await Derb.request(
                'private/edit',
                {order_id:orderids[0],amount:positionSize,type:"stop-market",price:myTrailingStopValue,reduce_only:true}
                )
      state = 2
      return state     
    }
      break;
    }
}

async function reviewPositions(){
  var positions = await Derb.request('private/getpositions',{currency:'BTC'})
    return positions.result.amount
}

async function reviewOrders(){
  var size = 0
  var orders = await Derb.request("private/get_open_orders_by_instrument",
              {instrument_name:myInstrument}
              )

    for(var o =0; o<orders.result.length;o++){
      var order = orders.result[o]
      if(order.reduce_only==true){
          orderids.push(order.orderid)
          size += order.amount
      }
      
    }
  return size
}

async function controller(state){
    console.log('wait...')
    state = await tradingLoop(state)
    console.log("State of FMS is:"+state)
    
    setTimeout(function(){
        console.log('waited')
      
            //tradeGatlingGun(0,'buy')
        return new Promise(()=>controller(state))
    },loopInterval)
}

//Mike van Rossum's API connector begins:

class Connection extends EventEmitter {
  constructor({key, secret, domain='testapp.deribit.com'}) { //change domain=  to just 'deribit.com' for live use
    super();

    this.key = key;
    this.secret = secret;
    this.WSdomain = domain;

    this.connected = false;
    this.isReadyHook = false;
    this.isReady = new Promise((r => this.isReadyHook = r));
    this.authenticated = false;
    this.reconnecting = false;
    this.afterReconnect;

    this.inflightQueue = [];
    this.subscriptions = [];

    this.id = +new Date;
  }

  nextId() {
    return ++this.id;
  }

  handleError = (e) => {
    console.log(new Date, '[DERIBIT] DERI ERROR', e);
  }

  _connect() {
    if(this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`wss://${this.WSdomain}/ws/api/v2`);
      this.ws.onmessage = this.handleWSMessage;

      this.ws.onopen = () => {
        this.connected = true;

        this.pingInterval = setInterval(this.ping, 20 * 1000);

        this.isReadyHook();
        resolve();
      }
      this.ws.onerror = this.handleError;
      this.ws.on('error', this.handleError)

      this.ws.onclose = async e => {
        console.log(new Date, '[DERIBIT] CLOSED CON');
        this.inflightQueue.forEach((queueElement) => {
          queueElement.connectionAborted(new Error('Deribit connection closed.'));
        });
        this.inflightQueue = [];
        this.authenticated = false;
        this.connected = false;
        clearInterval(this.pingInterval);
        this.reconnect();
      }
    });
  }

  ping = async() => {
    let start = new Date;
    const timeout = setTimeout(() => {
      console.log(new Date, '[DERIBIT] NO PING RESPONSE');
      this.terminate();
    }, 10000)
    await this.request('public/test');
    clearInterval(timeout);
  }

  // terminate a connection and immediatly try to reconnect
  terminate = async() => {
    console.log(new Date, '[DERIBIT] TERMINATED WS CON');
    this.ws.terminate();
    this.authenticated = false;
    this.connected = false;
  }

  // end a connection
  end = () => {
    console.log(new Date, '[DERIBIT] ENDED WS CON');
    clearInterval(this.pingInterval);
    this.ws.onclose = undefined
    this.authenticated = false;
    this.connected = false;
    this.ws.terminate();
  }

  reconnect = async () => {
    this.reconnecting = true;

    let hook;
    this.afterReconnect = new Promise(r => hook = r);
    this.isReady = new Promise((r => this.isReadyHook = r));
    await wait(500);
    console.log(new Date, '[DERIBIT] RECONNECTING...');
    await this.connect();
    hook();
    this.isReadyHook();

    this.subscriptions.forEach(sub => {
      this.subscribe(sub.type, sub.channel);
    });
  }

  connect = async () => {
    await this._connect();
    if(this.key) {
      await this.authenticate();
    }
  }

  authenticate = async () => {
    if(!this.connected) {
      await this.connect();
    }

    const resp = await this.sendMessage({
      jsonrpc: '2.0',
      method: 'public/auth',
      id: this.nextId(),
      params: {
        grant_type: 'client_credentials',
        client_id: this.key,
        client_secret: this.secret
      }
    });

    if(resp.error) {
      throw new Error(resp.error.message);
    }

    this.token = resp.result.access_token;
    this.refreshToken = resp.result.refresh_token;
    this.authenticated = true;

    if(!resp.result.expires_in) {
      throw new Error('Deribit did not provide expiry details');
    }

    setTimeout(this.refreshTokenFn, resp.result.expires_in - 10 * 60 * 1000);
  }

  refreshTokenFn = async () => {
    const resp = await this.sendMessage({
      jsonrpc: '2.0',
      method: 'public/auth',
      id: this.nextId(),
      params: {
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken
      }
    });

    this.token = resp.result.access_token;
    this.refreshToken = resp.result.refresh_token;

    if(!resp.result.expires_in) {
      throw new Error('Deribit did not provide expiry details');
    }

    setTimeout(this.refreshTokenFn, resp.result.expires_in - 10 * 60 * 1000);
  }

  findRequest(id) {
    for(let i = 0; i < this.inflightQueue.length; i++) {
      const req = this.inflightQueue[i];
      if(id === req.id) {
        this.inflightQueue.splice(i, 1);
        return req;
      }
    }
  }

  handleWSMessage = e => {
    let payload;

    try {
      payload = JSON.parse(e.data);
    } catch(e) {
      console.error('deribit send bad json', e);
    }

    if(payload.method === 'subscription') {
      return this.emit(payload.params.channel, payload.params.data);
    }

    if(payload.method === 'heartbeat') {
      return this.sendMessage({
        jsonrpc: '2.0',
        method: 'public/test',
        id: this.nextId(),
        params: {}
      })
    }

    const request = this.findRequest(payload.id);

    if(!request) {
      return console.error('received response to request not send:', payload);
    }

    payload.requestedAt = request.requestedAt;
    payload.receivedAt = +new Date;
    request.onDone(payload);
  }

  sendMessage = async (payload, fireAndForget) => {
    if(!this.connected) {
      if(!this.reconnecting) {
        throw new Error('Not connected.')
      }

      await this.afterReconnect;
    }

    let p;
    if(!fireAndForget) {
      let onDone;
      let connectionAborted;
      p = new Promise((r, rj) => {onDone = r; connectionAborted = rj;});

      this.inflightQueue.push({
        requestedAt: +new Date,
        id: payload.id,
        onDone,
        connectionAborted
      });
    }

    this.ws.send(JSON.stringify(payload));

    return p;
  }


  request = async (path, params) => {

    if(!this.connected) {
      if(!this.reconnecting) {
        throw new Error('Not connected.');
      }

      await this.afterReconnect;
    }

    if (path.startsWith('private')) {
      if(!this.authenticated) {
        throw new Error('Not authenticated.');
      }
    }

    const message = {
      jsonrpc: '2.0',
      method: path,
      params,
      id: this.nextId()
    }

    return this.sendMessage(message);
  }

  subscribe = (type, channel) => {

    this.subscriptions.push({type, channel});

    if(!this.connected) {
      throw new Error('Not connected.');
    } else if(type === 'private' && !this.authenticated) {
      throw new Error('Not authenticated.');
    }

    const message = {
      jsonrpc: '2.0',
      method: `${type}/subscribe`,
      params: {
        channels: [ channel ]
      },
      id: this.nextId()
    }

    return this.sendMessage(message);
  }
}