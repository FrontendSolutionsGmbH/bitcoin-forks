"use strict";

const HistoricalCourse = require('../common/db/historical');
const config = require('./config');
const RequestRepeater = require('../common/request_repeater');
const { request } = RequestRepeater(config);
const moment = require("moment");

const MIN_DATE = moment('2009-01-01'); //before BTC-Birthday
const PAGE_SIZE = 500;

const determineStartDate = function(symbol, defaultStartDate) {
  return new Promise((resolve, reject) => {
    HistoricalCourse.find({
      from: {
        symbol: symbol,
        type: 'crypto'
      },
      to: {
        symbol: "USDT",
        type: 'crypto'
      }
    })
    .limit(1)
    .sort({ date: 'desc' })
    .select({ date: 1})
    .exec((err, courses) => {
      if (err || courses.length === 0) {
        resolve(defaultStartDate);
        return;
      }

      resolve(moment(courses[0].date));
    })
  });
};

const processEachCourse = function(symbol, body){
  const data = JSON.parse(body);

  /*
    Array of Arrays:
    [
      [
        1499040000000,      // Open time
        "0.01634790",       // Open
        "0.80000000",       // High
        "0.01575800",       // Low
        "0.01577100",       // Close
        "148976.11427815",  // Volume
        1499644799999,      // Close time
        "2434.19055334",    // Quote asset volume
        308,                // Number of trades
        "1756.87402397",    // Taker buy base asset volume
        "28.46694368",      // Taker buy quote asset volume
        "17928899.62484339" // Ignore
      ],
      [...]
    ]
   */

  let bulk = HistoricalCourse.collection.initializeUnorderedBulkOp();
  let operationCount = 0;

  for(let curEntity of data){
    let entity = {
      from: {
        symbol: symbol,
        type: 'crypto'
      },
      to: {
        symbol: "USDT",
        type: 'crypto'
      },
      date: moment(curEntity[0]).toDate(),
      open: Number.parseFloat(curEntity[1]),
      high: Number.parseFloat(curEntity[2]),
      low: Number.parseFloat(curEntity[3]),
      close: Number.parseFloat(curEntity[4]),
      volume: Number.parseFloat(curEntity[5]),
    };

    let where = { from: entity.from, to: entity.to, date: entity.date };
    bulk.find(where).upsert().updateOne(entity);
    operationCount++;
  }

  if(operationCount !== 0){
    //return a promise of db-execute
    return bulk.execute();
  }

  return Promise.resolve();
};

const get = function(symbol, from) {
  const url = `https://api.binance.com/api/v1/klines?symbol=${symbol}USDT&interval=1d&startTime=${from.unix()}000&limit=${PAGE_SIZE}`;
  return request(url)
    .then(({body}) => processEachCourse(symbol, body))
};

const crawl = function(symbol, from = MIN_DATE){
  return determineStartDate(symbol, from)
    .then(startDate => {
      const p = [];
      const today = moment();
      let curDate = moment(startDate);

      while(curDate.isBefore(today)){
        p.push(get(symbol, curDate));

        //next page
        curDate = curDate.clone().add(PAGE_SIZE, "days")
      }

      return Promise.all(p);
    });
};

module.exports = {
  crawl
};