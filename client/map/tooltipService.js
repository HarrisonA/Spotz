'use strict';

angular.module('MapServices')

.factory('TooltipFactory', [
  '$rootScope',
  'SelectedFeatureFactory',
  function ($rootScope, SelectedFeatureFactory) {

    var factory = {};
    var googleObj;
    var privileges = false;

    //=====================================================
    //broadcasted event listeners

    $rootScope.$on('admin', function () {
      privileges = true;
    });

    $rootScope.$on('logOut', function () {
      privileges = false;
    });

    $rootScope.$on('googleAvailable', function (event, newGoogleObj) {

      //save the googeleObj
      googleObj = newGoogleObj;

      //enable tooltip display on click
      googleObj.map.data.addListener('click', function (event) {
        SelectedFeatureFactory.set(event.feature);
        factory.create(event);
      });

    });

    //=====================================================
    //private functions

    var convertTime = function (inputTimeString) {
      return moment(inputTimeString, 'H:mm:ss').format('Hmm');
    };

    function deleteRuleHandlerForThis(feature) {

      return function (event) {
        if (confirm('Are you sure you want to delete this rule?')) {

          var ruleId = event.srcElement.dataset.ruleid;

          SelectedFeatureFactory.deleteRule(ruleId)
          .then(function (rules) {
            feature.setProperty('rules', rules);
            factory.create(feature, true);
          });
        }
      };
    }

    function deleteFeatureHandlerForThis(feature) {

      return function (event) {
        if (confirm('Are you sure you want to delete this polygon?')) {
          var polyId = event.srcElement.dataset.polyid;

          SelectedFeatureFactory.deleteFeature(polyId).then(function (succeeded) {
            if (succeeded) {
              $rootScope.$broadcast('removeFeatureFromMap', feature);

              //reset the selected feature
              SelectedFeatureFactory.clear();

              googleObj.tooltip.close();
            }
          });
        }
      };
    }

    //=====================================================
    //exposed functions

    factory.create = function (event) {

      var rulesToDisplay = factory.createTooltipText();
      var content = '<span class="tooltip-text">' + rulesToDisplay + '</span>';

      //tooltip points to a google map tooltip object
      //append the content and set the location, then display it
      googleObj.tooltip.setContent(content, event);
      googleObj.tooltip.open(googleObj.map);
      googleObj.tooltip.setPosition(event.latLng);
      factory.addDeleteButtonClickHandlers();
    };

    factory.addDeleteButtonClickHandlers = function () {

      if (!privileges) {
        return;
      }

      var feature = SelectedFeatureFactory.get().feature;

      //add listeners for the remove rule buttons
      var deleteButtons = document.getElementsByClassName('delete-rule');
      for (var i = 0; i < deleteButtons.length; i++) {
        deleteButtons[i].addEventListener('click', deleteRuleHandlerForThis(feature));
      }

      //add listeners for the remove polygon button
      var deletePolygon = document.getElementsByClassName('delete-polygon');
      deletePolygon[0].addEventListener('click', deleteFeatureHandlerForThis(feature));

    };

    factory.createTooltipText = function () {

      var feature = SelectedFeatureFactory.get().feature;
      var numOfRules;

      if (!event) {
        return;
      }

      if (feature.getProperty('rules')) {
        numOfRules = feature.getProperty('rules').length;
      }

      var rulesToDisplay = '';

      // Capture the user submitted time and date
      var constraints = {
        time: '',
        date: '',
      };

      if ($rootScope.constraints) {
        constraints = $rootScope.constraints;
      }

      var polygonRules = {};

      for (var i = 0; i < numOfRules; i++) {
        rulesToDisplay += '<div class="rule-box">';
        rulesToDisplay += '<span class="permit-code">' +
        feature.getProperty('rules')[i].permitCode + '</span><br>';

        polygonRules.days = feature.getProperty('rules')[i].days;
        rulesToDisplay += polygonRules.days + '<br>';

        polygonRules.startTime = feature.getProperty('rules')[i].startTime;
        rulesToDisplay +=  polygonRules.startTime + ' to ';

        polygonRules.endTime = feature.getProperty('rules')[i].endTime;
        rulesToDisplay += polygonRules.endTime + '<br>';

        polygonRules.timeLimit = feature.getProperty('rules')[i].timeLimit;
        rulesToDisplay += '<span class="time-limit">' + polygonRules.timeLimit + 'hrs max</span>';

        polygonRules.costPerHour = feature.getProperty('rules')[i].costPerHour;
        rulesToDisplay +=  '<span class="cost">$' + polygonRules.costPerHour + '/hr</span><br>';

        if (privileges) {
          rulesToDisplay +=  '<div class="delete-rule" data-polyId=' +
          feature.getProperty('id').toString() + ' data-ruleId=' +
          feature.getProperty('rules')[i].id + '>DELETE RULE</div><br>';
        }

        rulesToDisplay += '</div>';
      }

      if (!numOfRules) {
        rulesToDisplay = 'Parking info not available';

      } else if (constraints.time !== '') {
        //Sample Time submitted.  Display parking availability

        // NOTE update these to use removeLeadingZero function, works without it for now
        // and change them to real integers
        // Convert time format form 08:12:10 to 0812
        var convPreviewTime = convertTime(constraints.time);
        var convStartTime = convertTime(polygonRules.startTime);
        var convEndTime = convertTime(polygonRules.endTime);

        // check for Sat or Sunday  By grabbing the day from
        // the date (0 = Sunday, 1 = Monday... 6 = Saturday)

        var userDay = constraints.date.getDay();

        // All Street sweeping day possiblilities
        var streetSweepingObj = {
          '1st Mon': true, '2nd Mon': true, '3rd Mon': true, '4th Mon': true,
          '1st Tue': true, '2nd Tue': true, '3rd Tue': true, '4th Tue': true,
          '1st Wed': true, '2nd Wed': true, '3rd Wed': true, '4th Wed': true,
          '1st Thurs': true, '2nd Thurs': true, '3rd Thurs': true, '4th Thurs': true,
          '1st Fri': true, '2nd Fri': true, '3rd Fri': true, '4th Fri': true,
        };

        var parkingMessage = '';

        // User clicked a street Sweeping Segment
        // thus polygon rules will be a street sweeping day
        // that is listed in the streetSweepingObj (Example: 4th Fri, 2nd Weds, etc)
        if (streetSweepingObj[polygonRules.days]) {

          // Check for Sat or Sunday
          if (userDay === 0 || userDay === 6) {
            parkingMessage = 'No street sweeping Sat or Sunday!';
            rulesToDisplay += '<br><strong style="color:green">' + parkingMessage + '</strong>';

          } else {

            // This block of code will convert the user submitted date into
            // the weekday of the month it is (Example: 3rd Monday of the month)
            var ordinals = ['', '1st', '2nd', '3rd', '4th', '5th'];

            // Ex: Mon Feb 15 2016 00:00:00
            var date = constraints.date.toDateString(); // 'Mon Feb 15 2016 00:00:00'
            var tokens = date.split(' ');               // [Mon, Feb, 15, 2016, 00:00:00]

            // take the date, divide by 7 and round up
            // Dividing the day by 7 will give you its number of the month.  Ex: 2nd Mon
            var weekdayOfTheMonth = ordinals[Math.ceil(tokens[2] / 7)] + ' ' + tokens[0];

            // Check if the constraints date and time, matches the sweeping date and time
            if ((polygonRules.days === weekdayOfTheMonth) && (convPreviewTime > convStartTime) &&
              (convPreviewTime < convEndTime)) {

              parkingMessage = 'WARNING: Street sweeping is occuring here <br>';
              parkingMessage += 'on the date and time you entered.';
            }

            rulesToDisplay += '<br>' + '<strong style="color:red">' + parkingMessage + '</strong>';
          }

        } else {

          // User Clicked a Permit Zone polygon
          // thus polygonRules.days will be (M, T, W, Th, F and possibly Sat)
          // Grab the permit days and put them in an array
          var daysArray = polygonRules.days.split(',');

          parkingMessage = '';

          // No parking rules on Sunday (0) or Sat (if Sat is not in the daysArray length)
          if (userDay === 0  || (userDay === 6 && daysArray.length < 6)) {
            parkingMessage = 'NO PERMIT REQUIRED TO PARK HERE for the date entered.';

          }  else {

            // Warning: This needs to be updated for the case where the next day does
            // not have any permit zone rules (Ex: Sunday and some Saturdays).
            // As its written, it will say display "You park here until..."
            if (convPreviewTime < convStartTime || convPreviewTime > convEndTime) {
              parkingMessage = 'You can park here until ' +  polygonRules.startTime +
              ', then you there is a two hour limit until' + polygonRules.endTime;
            } else {
              parkingMessage = 'You can park here for two hours only';
            }
          }

          rulesToDisplay += '<br>' + '<span class="parking-advice">' + parkingMessage + '</span>';
        }

      }

      rulesToDisplay += '<br>';

      if (privileges) {
        rulesToDisplay +=  '<div class="delete-polygon" data-polyId=' +
        feature.getProperty('id').toString() + '>DELETE FEATURE</div><br>';
      }

      return rulesToDisplay;
    };

    return factory;
  },
]);
