const util = require('util');
const localData = require('../src/input/local.js')
const fetch = require('node-fetch')
const fs = require('fs-extra');
const outputDir = './src/input/crawl/'
var coins = localData.coins

var baseUrl = process.argv[process.argv.length - 1]

if (baseUrl.indexOf('http') < 0) {
    console.log('missing http(s) url without /api/... as argument e.g. npm run crawl http://froso.de:3000')
    process.exit(1)
}

const settings = {
    parallelWorker: 2,
    days: 8,
    maxDepth: 2
}

console.log('lets crawl ' + baseUrl + ' with ' + settings.parallelWorker + ' workers, ' + settings.days + ' days and ' + settings.maxDepth + ' maximum depth')
var apiCrypto = baseUrl + '/api/ratios/crypto/'
var apiPairs = baseUrl + '/api/pairs'

console.log('data-api: ' + apiCrypto)
console.log('pairs-api: ' + apiPairs)
console.log('local-crypto-tokens: ' + coins.length)




var filterCoinList = function(coins) {


    console.log('reducing set of coins to available symbols')
    var url = apiPairs
    return fetch(url, {timeout: 120000}).then((res) => {
        if (res.status === 200) {
            //  console.log('fetching success ', res.status, coin.shortName)
            return res.json()
        } else {
            console.log('status != 200 for pairs', res.status, res.statusText, url)
            return {fail: true}
        }
    }).catch((res) => {
        console.log('network problem for pairs')
        return {fail: true}
    }).then((json) => {

        if (json.fail) {
            return coins
        }

        var uniqueSymbols = json.pairs.map(p => p.from.name).filter((v, i, a) => a.indexOf(v) === i);

        return coins.filter(c => uniqueSymbols.indexOf(c.shortName) > -1)
    })
}

var downloadCrawledData = function (coins) {


    var promises = coins.map((coin)=> {
        var url = apiCrypto + coin.shortName + '?days=' + settings.days + '&maxDepth='+ settings.maxDepth
        return fetch(url, {timeout: 120000})
            .then((res) => {
                if (res.status === 200) {
                    //  console.log('fetching success ', res.status, coin.shortName)
                    return res.json()
                } else {
                    console.log('status != 200', coin.shortName, res.status, res.statusText, url)
                    return {fail: true}
                }
            }).catch((res) => {
                console.log('network problem', coin.shortName, res.message)
                return {fail: true}
            }).then((json) => {
                var fileName = outputDir + coin.id + '.json'
                if (json.ratios && json.ratios.length < 1) {
                    console.log('no data', coin.shortName)
                }
                if (!fs.existsSync(fileName) || json.ratios && json.ratios.length > 0) {
                    fs.writeFileSync(fileName, JSON.stringify(json, null, 2), 'utf-8')
                }
                return json
            })
    })


    return Promise.all(promises)
}


if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir)
}

var doDownload = function (coins, currentStep, stepWidth) {
    var slice = coins.slice(currentStep, currentStep + stepWidth)
    var coinsText = slice.reduce((accumulator, currentValue) => accumulator + currentValue.shortName + ' ', '')
    var textToAdd = ' (' + currentStep + '-' + (currentStep + stepWidth < coins.length ? currentStep + stepWidth : coins.length) + '/' + coins.length + ')'
    console.log('fetching ' + coinsText + textToAdd)
    console.time(coinsText)
    return downloadCrawledData(slice).then((result) => {
        console.timeEnd(coinsText)
        if (currentStep + stepWidth < coins.length) {
            return doDownload(coins, currentStep + stepWidth, stepWidth)
        }
    })
}



filterCoinList(coins).then((coins) => {
    console.log('tokens with symbol on backend: ' + coins.length)
    doDownload(coins, 0, settings.parallelWorker)
})