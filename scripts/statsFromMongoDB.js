var mongoose = require('mongoose')
  , lib = require('../lib/explorer')
  , db = require('../lib/database')
  , settings = require('../lib/settings')
  , LocationNodes = require('../models/locationnodes')
  , Nodes = require('../models/nodes')
  , Address = require('../models/address')
  , Stats = require('../models/stats')
  , Inf = require('../models/infnodes')
  , Tx = require('../models/tx')
  , request = require('request');

var COUNT = 5000; //number of blocks to index

var statsName = '';

function  usage(){
  console.log('Usage: node scripts/statsFromMongoDB.js [statsName]');
  console.log('');
  console.log('statsName: (required)');
  console.log('topAddress       calcul Top10 and Top50 and update coinstats');
  console.log('activeAddress    number of address has sup 10SIN in balance');
  console.log('totalAddress     total address used from block genesis');
  console.log('nodeBurnCoins    total coins burnt to create node');
  console.log('tx7days          number and amount of 7 previous days');
  console.log('');
  process.exit(0);
}

if (process.argv.length != 3) {
  usage();
} else {
  statsName = process.argv[2];
}

function exit() {
  mongoose.disconnect();
  process.exit(0);
}

var dbString = 'mongodb://' + settings.dbsettings.user;
dbString = dbString + ':' + settings.dbsettings.password;
dbString = dbString + '@' + settings.dbsettings.address;
dbString = dbString + ':' + settings.dbsettings.port;
dbString = dbString + '/' + settings.dbsettings.database;

mongoose.connect(dbString, function(err) {
  if (err) {
    console.log('Unable to connect to database: %s', dbString);
    console.log('Aborting');
    exit();
  } else {
    //BEGIN
    const data = {addresses: 0, active: 0, top10: 0, top50: 0};
    console.log('calcul stats: '+statsName);
    if (statsName == 'topAddress'){
      Address.find({}).sort({balance: 'desc'}).limit(50).exec(function(err, addresses){
        if (err) {
          console.log("ERROR: can not get address collection");
          exit();
        }else{
          var address;
          for (var i=0; i < addresses.length; i++ ){
            address = addresses[i];
            if (i >=1 && i <=9){
              data.top10 = data.top10 + address.balance / 100000000;
            }
            if (i >=10 && i <=49){
              data.top50 = data.top50 + address.balance / 100000000;
            }
          }
          Stats.updateOne({coin: settings.coin}, {
            top10: data.top10,
            top50: data.top50,
          }, function() {exit();});
          console.log("INFO: updated top10 and top50");
        }
      });
    } else if (statsName == 'activeAddress'){
      Address.find({balance: {$gt: 100000000}}).exec(function(err, addresses){
          data.active = addresses.length;
          Stats.updateOne({coin: settings.coin}, {
              active_addresses: addresses.length,
          }, function() {exit();});
        console.log("INFO: updated Active address");
      });
    } else if (statsName == 'totalAddress'){
      Address.countDocuments().exec(function(err, count){
        data.addresses = count;
        Stats.updateOne({coin: settings.coin}, {
            addresses: count,
        }, function() {exit();});
        console.log("INFO: updated Total Address");
      });
    } else if (statsName == 'nodeBurnCoins'){
      Inf.find({}).exec(function(err, infnodes){
        var nodeburn = 0;
        var node;
        for (var i=0; i < infnodes.length; i++ ){
          node = infnodes[i];
          nodeburn = nodeburn + node.burnvalue;
        }
        Stats.updateOne({coin: settings.coin}, {
            node_burn: nodeburn
        }, function() {exit();});
        console.log("INFO: updated Total coins burnt for node");
      })
    } else if (statsName == 'tx7days'){
      db.get_stats(settings.coin, function(stats){
        var deepth7 = stats.last - 7*720;
        var deepth6 = stats.last - 6*720;
        var deepth5 = stats.last - 5*720;
        var deepth4 = stats.last - 4*720;
        var deepth3 = stats.last - 3*720;
        var deepth2 = stats.last - 2*720;
        var deepth1 = stats.last - 1*720;
        var blockH = stats.last;
        const cursor = Tx.aggregate([
                                     {$match: {
                                       $and: [
                                         {blockindex: {$gt: deepth7}},
                                         {vin: {$elemMatch: {addresses : {$ne: "coinbase"}}}}
                                       ]
                                     }},
                                     {$group: {
                                       "_id" : {
                                         $concat: [
                                           { $cond: [{$and:[ {$gte:["$blockindex", deepth7 ]}, {$lt: ["$blockindex", deepth6]}]}, "H-6", ""] },
                                           { $cond: [{$and:[ {$gte:["$blockindex", deepth6 ]}, {$lt: ["$blockindex", deepth5]}]}, "H-5", ""] },
                                           { $cond: [{$and:[ {$gte:["$blockindex", deepth5 ]}, {$lt: ["$blockindex", deepth4]}]}, "H-4", ""] },
                                           { $cond: [{$and:[ {$gte:["$blockindex", deepth4 ]}, {$lt: ["$blockindex", deepth3]}]}, "H-3", ""] },
                                           { $cond: [{$and:[ {$gte:["$blockindex", deepth3 ]}, {$lt: ["$blockindex", deepth2]}]}, "H-2", ""] },
                                           { $cond: [{$and:[ {$gte:["$blockindex", deepth2 ]}, {$lt: ["$blockindex", deepth1]}]}, "H-1", ""] },
                                           { $cond: [{$gte:["$blockindex",deepth1]}, "H", ""]}
                                         ]
                                       },
                                       count: { $sum: 1 },
                                       total: { $sum: "$total" }
                                     }},
                                     {$sort : { _id : 1} }
                                  ]).cursor({ batchSize: 1000}).exec();
        const data = [];
        const result = async function () {
          var doc;
          var tx_d0_count = 0; tx_d0_value = 0;
          var tx_d1_count = 0; tx_d1_value = 0;
          var tx_d2_count = 0; tx_d2_value = 0;
          var tx_d3_count = 0; tx_d3_value = 0;
          var tx_d4_count = 0; tx_d4_value = 0;
          var tx_d5_count = 0; tx_d5_value = 0;
          var tx_d6_count = 0; tx_d6_value = 0;
          while ((doc = await cursor.next())) {
            if (doc) {
              var item = {range: doc['_id'], count: doc['count'], total: doc['total']};
              data.push(item);
              if (doc['_id'] == "H")   {tx_d0_count=doc['count']; tx_d0_value=doc['total']/100000000;}
              if (doc['_id'] == "H-1") {tx_d1_count=doc['count']; tx_d1_value=doc['total']/100000000;}
              if (doc['_id'] == "H-2") {tx_d2_count=doc['count']; tx_d2_value=doc['total']/100000000;}
              if (doc['_id'] == "H-3") {tx_d3_count=doc['count']; tx_d3_value=doc['total']/100000000;}
              if (doc['_id'] == "H-4") {tx_d4_count=doc['count']; tx_d4_value=doc['total']/100000000;}
              if (doc['_id'] == "H-5") {tx_d5_count=doc['count']; tx_d5_value=doc['total']/100000000;}
              if (doc['_id'] == "H-6") {tx_d6_count=doc['count']; tx_d6_value=doc['total']/100000000;}
              console.log("Range: " + doc['_id'] + " " + doc['count'] + " " + doc['total']);
            }
          }
          Stats.updateOne({coin: settings.coin}, {
            tx_d0_count: tx_d0_count, tx_d0_value: tx_d0_value,
            tx_d1_count: tx_d1_count, tx_d1_value: tx_d1_value,
            tx_d2_count: tx_d2_count, tx_d2_value: tx_d2_value,
            tx_d3_count: tx_d3_count, tx_d3_value: tx_d3_value,
            tx_d4_count: tx_d4_count, tx_d4_value: tx_d4_value,
            tx_d5_count: tx_d5_count, tx_d5_value: tx_d5_value,
            tx_d6_count: tx_d6_count, tx_d6_value: tx_d6_value
          }, function() {exit();});
          console.log("INFO: updated 7 days transaction statsnt for node");
        };
        result();
      });
    } else {
      exit();
    }
    //END
  }
});
