var key = ''
var secret = '' //insert your keys here
const rest = require('restler')
const async = require('async')
const derb = require('deribit-v2-ws')
const loopInterval = 1000 //~>15 minutes in milliseconds, keeping this simple, we loop this often 
                            //if you start this algo not in alignment with the local hour, the 15-min interval should fix that

const Derb = new derb(key, secret)

var myTrailingStopMAPeriod = 50 //this is your key customizable input to this script that sets your trailing stop where *you* think it should go
var myHourlyMAs = [myTrailingStopMAPeriod,400] //add more periods if you please
var myTrailingStopValue = 1 //dummy value, will be updated with MA logic and used to adjust stops
var positionSize = 0
var myInstrument = "BTC-27MAR20" //insert the code for whatever instrument you are trend-following with here
                                //if you don't update this/the code is for an expired contract, will create a problem

const wait = n => new Promise(r => setTimeout(r, n)); //for those new to javascript, the language used to do stuff based on callbacks 
                                                      //and it looked terrible
                                                      //so instead function schweet(param, callback){
                                                      //    do stuff with param such as API.call(params).function(data){
                                                      //            return callback(data)}
                                                      // 
                                                      //and then calling it like: schweet(param, function(data)){ console.log('ooh data! '+data)}
                                                      //instead we use async functions to use the await keyword and .js waits for the Promise object
                                                      //to be filled with the data instead of returning a Pending Promise and rolling along

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
  //console.log(nearestHour)
  var starttime = 1540000000000 //this is a dummy value, it could be 100 or whatever, Deribit's call logic is wonky here, it just returns last 10k candles
  var endtime = nearestHour
  var instrumentname = 'BTC-PERPETUAL' 
  var string = 'https://www.deribit.com/api/v2/public/get_tradingview_chart_data'+'?instrument_name='+instrumentname+'&start_timestamp='+starttime+'&end_timestamp='+endtime+'&resolution=60'
      //console.log(string)
    rest.get(string).on('complete', function(data){

        candles = data.result
        lows = candles.low.reverse() //everything is in order from oldest to newest so we flip that script
        highs = candles.high.reverse()
        opens = candles.open.reverse()
        drawMAs() //this whole waterfall function call business is old-school pre-Promises but hey
    })
}

function drawMAs(i){
        if(i == undefined){i=0}
        var period = myHourlyMAs[i]
        var sum = 0
        var thisData ={}
        for(var p=0; p<period;p++){
          var hl3 = (highs[p]+lows[p]+opens[p])/3
          sum += hl3
        }
        var avg = sum/period
        if(period ==myTrailingStopMAPeriod){myTrailingStopValue = Math.round(avg)}//this is the only one we care about, can be appended to support more MAs
        console.log(myTrailingStopValue)
        hourMAs.push({period:period,avg})//this stores misc. MAs for future reference in object form
        
        if(i<myHourlyMAs.length){i+=1,drawMAs(i)}else{controller(state)}
} 

var loops = 0
var state = 0

async function tradingLoop(state){
  loops+=1
  if(Derb.connected==false&&loops>1){
                    console.log('connection down... waiting...')
                    //await timeout(interval)
                    return state 
    }else if(Derb.connected==false){
                    console.log('fresh connection attempt')
                    await Derb.connect(state)
                    return state
    }else if(loops>=2&&Derb.connected==true&&Derb.authenticated==true){console.log('connected '+Derb.connected+' authenticated '+Derb.authenticated)
  }/*else if(Derb.authenticated==false&&Derb.connected==true){
    console.log('authenticated'+Derb.authenticated) 
    return state}*/ //this is necessary to make sure the API connection is live

  console.log("Loops: "+loops," State: " + state) //I know this is statist but it's also loopist
  /*
  State 0: Passive, no position
  State 1: Initially create MA-based trailing stop
  State 2: Scan for whether enough time has passed to update the stop
  State 3: Update the stop

  This is a Finite State Machine style approach to organizing the trading system logic, 
  you could really go places with this, adding more states
  */
  if(state == null){state=0}
  var hasPositions = reviewPositions() //determines if you have a position open, you have to open your position manually with this
    if(hasPositions==0&&state!=0){state=0}else if(hasPositions>0){
      state=1, console.log("Me and DB will peek out our heads")
    }

  switch(state){
    case 0: 
      positionSize = await reviewPositions()
      console.log('positionsSize '+positionSize)
      if(positionSize==0||undefined){
        return state
      }else if(positionSize>0){
        state =1 
        return state
      }

    break;
      
    case 1:
      var openReduceOrderSize = await reviewOrders()
      if(openReduceOrderSize==0){
          try{
          var sell =await Derb.request(
                    'private/sell',
                    {instrument_name:myInstrument,amount:size,type:"stop-market",price:myTrailingStopValue,reduce_only:true}
                    )
        }catch{console.log('API err '+state)}
          state+=1
          return state
      }else if(openReduceOrderSize<positionSize){
        var adjust = positionSize - openReduceOrderSize
        //just in case things aren't congruent
        try{
        var edit = await Derb.request(
                    'private/edit',
                    {order_id:orderids[0],amount:adjust,type:"stop-market",price:myTrailingStopValue,reduce_only:true}
                    )
        }catch{console.log('API err '+state)}
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
      console.log(positionSize)
      if(positionSize==0){
        state = 0
        return state 
      }

      var time = roundToHour()
      if(time>lastHourTimestamp){
        lastHourTimestamp = time
        loadData()
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
      try{
      var edit = await Derb.request(
                'private/edit',
                {order_id:orderids[0],amount:positionSize,type:"stop-market",price:myTrailingStopValue,reduce_only:true}
                )
      }catch{console.log('API err '+state)}
      state = 2
      return state     
    }
      break;
    }
}

async function reviewPositions(){
try{
  var position = await Derb.request(
                                      'private/getposition',
                                      {instrument_name:myInstrument})
  console.log('Position data '+position)
    if(position==undefined){return 0}else{var size = positions.result.size}
  }catch{
    console.log('API err '+position)
    return 0
  }
  
  
    return size
}

async function reviewOrders(){
  var size = 0
  try{
  var orders = await Derb.request("private/get_open_orders_by_instrument",
              {instrument_name:myInstrument}
              )
  }catch{console.log('API err '+JSON.stringify(orders))}

  if(orders==undefined){return 0}else{
    for(var o =0; o<orders.result.length;o++){
      var order = orders.result[o]
      if(order.reduce_only==true){
          orderids.push(order.orderid)
          size += order.amount
      }
      
    }
  return size
  }
}

async function controller(state){
    state = await tradingLoop(state)
    console.log("State of FSM is:"+state)
    console.log("MA of period "+myTrailingStopMAPeriod+" = "+myTrailingStopValue)
    
    setTimeout(function(){
        console.log('waited')
            //tradeGatlingGun(0,'buy')
        return new Promise(()=>controller(state))
    },loopInterval)
}


loadData()