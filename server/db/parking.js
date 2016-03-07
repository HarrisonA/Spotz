'use strict';
var bookShelf = require('./db.js'); //database and schema definitions and configurations
var fs = require('fs');
var helper = require('./dbHelpers.js');  //helper functions

var db = {};
module.exports = db;

//create model from worldGrid table/schema (in db.js)
var WorldGrid = bookShelf.Model.extend({
  tableName: 'worldGrid',
  zones: function () {   // creates the association (relationship): worldGrid belongs to many zones
    return this.belongsToMany(Zones);
  },
});

//create model from permitRules table/schema (in db.js)
var Rules = bookShelf.Model.extend({
  tableName: 'rules',
  zones: function () {  // creates the association (relationship): rules belongs to many zones
    return this.belongsToMany(Zones);
  },
});

//create model from permitZone table/schema (in db.js)
var Zones = bookShelf.Model.extend({
  tableName: 'zones',
  worldGrid: function () {  // creates the association (relationship): zones belongs to many WorldGrid
    return this.belongsToMany(WorldGrid);
  },

  rules: function () {  // creates the association (relationship): zones belongs to many rules
    return this.belongsToMany(Rules);
  },
});

db.saveRule = function (zoneId, ruleAttrs) {
  var ruleObj = {
    table: Rules,
    attrs: ruleAttrs,
  };
  return Zones.where({ id: zoneId }).fetch().then(function (zoneAttrs) {
    var zoneObj = {
      table: Zones,
      attrs: zoneAttrs.attributes,
    };
    console.log('attaching rule ', ruleAttrs.permitCode, 'to zone', zoneAttrs.attributes.id);
    return helper.saveAndJoin(zoneObj, ruleObj, 'zones', true);
  });
};

db.unlinkRulefromZone = function (zoneId, ruleId) {

  console.log('detaching zone:', zoneId, 'from rule:', ruleId);

  return new Zones({ id:zoneId }).fetch({ withRelated:['rules'] })
  .then(function (item) {
    return item.related('rules').detach(ruleId).then(function (data) {
      return data;
    });

  });
};

// Based on the google coordinates, find the corresponding WorldGrid square
// then find the permit zones that are part of that WorldGrid Square
db.findPermitZones = function (coordinates) {

  var worldGridVals = helper.computeGridNumbers(coordinates);  // helper function to compute the world grid square coordinate

  return helper.grabRelatedPolygons({  //helper function to grab the permit zones based on a world grid square
    table: WorldGrid,
    attrs:{
      xIndex: worldGridVals[0],
      yIndex: worldGridVals[1],
    },
  }).then(function (permitZonesData) {
    return permitZonesData;
  });
};

// Save all permit zones into the database
// This should be done on database load only because the zone data should never change
// If new zone data exists, an admin will add it to the permit zone data file
db.savePermitZones = function (zoneArray) {
  /*
  zoneArray = [{
    coordinates:[[x,y],[x,y],[x,y],[x,y],[x,y],[x,y],[x,y],[x,y]],
    permitCode:"R-1H"
  },
  {
    coordinates:[[x,y],[x,y],[x,y],[x,y],[x,y]],
    permitCode:"R-1H"
  }]
  */
  var worldGridVals;
  var tuplesArray = [];
  var singleTuple = {};
  var tupleStoreObj = {};

  //create tuples
  //go through each permit zone object
  console.log(zoneArray);
  zoneArray.forEach(function (zone) {

    //iterate over the shapes (array of the (x,y) coordiantes/points that make up that pologyon/shape)
    zone.coordinates.forEach(function (shapes) {

      //iterate over each set of coordinates/points in the array
      shapes.forEach(function (coordinate) {

        //figure out the world grid corrdinates of each point on the polygon/shape
        worldGridVals = helper.computeGridNumbers(coordinate);

        //create a tuple that links the worldGrid coordinates to the permit zone object
        singleTuple = [
          {
            table: WorldGrid,
            attrs: {
              xIndex:worldGridVals[0],
              yIndex:worldGridVals[1],
            },
          },
          {
            table: Zones,
            attrs: {
              boundary:JSON.stringify(shapes),
            },
          },
        ];

        //store as key in object to prevent duplicates
        tupleStoreObj[JSON.stringify(singleTuple)] = singleTuple;

      });
    });
  });

  //store values of tupleStoreObj in an array
  for (var objStr in tupleStoreObj) {
    tuplesArray.push(tupleStoreObj[objStr]);
  }

  //save tuples into database
  //console.log('adding this to db >>>>>', JSON.stringify(tuplesToJoin));
  return helper.saveAndJoinTuples(tuplesArray, 'worldGrid');
};

db.destroyParkingZone = function (zoneId) {
  // console.log('attempting to destroy id', zoneId);
  // return new Zones({ id:zoneId }).related('worldGrid').destroy().then(function (model) {
  //   console.log('destoyed?', model);
  //   return model;
  // })

  return new Zones({ id:zoneId }).fetch({ withRelated:['worldGrid'] })
  .then(function (item) {
    console.log('fetch succeeded');

    return item.related('worldGrid').detach().then(function () {
      console.log('world grid detached');

      return item.related('rules').detach().then(function () {
        console.log('rules detached');

        return item.destroy().then(function () {
          console.log('polygon destroyed!');
        })
        .catch(function (error) {
          console.log('zone destory failed', error);
          return error;
        });
      })
      .catch(function (error) {
        console.log('rule detach failed', error);
        return error;
      });
    })
    .catch(function (error) {
      console.log('worldGrid detach failed', error);
      return error;
    });
  })
  .catch(function (error) {
    console.log('fetch failed', error);
    return error;
  });

};

// read all of the permitzone data from the file and save the data to the permitzone schema/table
db.importParkingZone = function (path, callback) {
  console.log('loading data from', path, '...');
  fs.readFile(__dirname + path, 'utf8', function (err, data) {
    if (err) {throw err; }

    var obj = JSON.parse(data);  //put all of the permitzone data into a JSON parsed object
    db.savePermitZones(obj).then(function (promise) {  // savePermitZones function is defined above
      callback(promise);
    });
  });
};
