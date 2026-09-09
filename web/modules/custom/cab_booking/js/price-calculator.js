(function ($, Drupal) {
  Drupal.behaviors.priceCalculator = {
    attach: function (context, settings) {
      once('cab-booking-wrapper-init', '.cab-booking-wrapper', context).forEach(function (element) {
        $('#edit-field-from-0-value').attr('placeholder', Drupal.t('Airport, hotel, or apartment address here'));
        $('#edit-field-destination-0-value').attr('placeholder', Drupal.t('Hotel, apartment or Airport address here'));
        $('#edit-field-seats-0-value').attr('placeholder', Drupal.t('1,2,3,4,5...'));
        const originAutocomplete = new google.maps.places.Autocomplete(document.getElementById("edit-field-from-0-value"));
        originAutocomplete.addListener("place_changed", () => {
          Drupal.originalPlace = originAutocomplete.getPlace();
          if (!Drupal.originalPlace.geometry) {
            alert("Please select a valid location from the dropdown.");
            return;
          }
          onChangeHandler();
          // use place.geometry.location or place.formatted_address
        });
        const destinationAutocomplete = new google.maps.places.Autocomplete(document.getElementById("edit-field-destination-0-value"));
        destinationAutocomplete.addListener("place_changed", () => {
          Drupal.destinationPlace = destinationAutocomplete.getPlace();
          if (!Drupal.destinationPlace.geometry) {
            alert("Please select a valid location from the dropdown.");
            return;
          }
          onChangeHandler();
          // use place.geometry.location or place.formatted_address
        });
        
        $('#edit-field-car-type').on('change', function() {
          onChangeHandler();
        });
        var directionsService = new google.maps.DirectionsService();
        const directionsRenderer = new google.maps.DirectionsRenderer({
          suppressMarkers: false,
          polylineOptions: {
            strokeColor: '#800080', // Purple
            strokeOpacity: 0.8,
            strokeWeight: 5,
          }
        });
       let map = new google.maps.Map($('.route-map')[0], {
          zoom: 14,
          center: { lat: -34.397, lng: 150.644 },
          styles: [
            {
              featureType: "all",
              elementType: "all",
              stylers: [
                { saturation: -100 },
                { lightness: 50 },
                { visibility: "on" }
              ]
            },
            {
              featureType: "water",
              elementType: "geometry",
              stylers: [{ color: "#e3f2fd" }]
            },
            {
              featureType: "landscape",
              elementType: "geometry",
              stylers: [{ color: "#ffffff" }]
            }
          ]
        });

        directionsRenderer.setMap(map);
        
        const onChangeHandler = function () {
          calculateAndDisplayRoute(directionsService, directionsRenderer);
        };
        function calculateAndDisplayRoute(
          directionsService,
          directionsRenderer
        ) {
          if (
            !$('#edit-field-from-0-value').val() || 
            !$('#edit-field-destination-0-value').val() ||
            $('#edit-field-car-type').val() === '_none' ||
            !$.isNumeric($('#edit-field-car-type').val())
          ) {
            return;
          }
          directionsService
            .route({
              origin: {
                placeId: Drupal.originalPlace.place_id,
              },
              destination: {
                placeId: Drupal.destinationPlace.place_id,
              },
              travelMode: google.maps.TravelMode.DRIVING,
            })
            .then((response) => {
              directionsRenderer.setDirections(response);
               getDistanceBetweenPlaces(Drupal.originalPlace.place_id, Drupal.destinationPlace.place_id, function(result) {
                // Show in UI or calculate fare
                document.getElementById('distance').innerText = result.distance.text;
                let distance_in_km = result.distance.value / 1000;
                $('#edit-field-distance-0-value').val(distance_in_km.toFixed(2)); // in KM
                document.getElementById('duration').innerText = result.duration.text;
                let duration_in_minutes = result.duration.value / 60;
                $('#edit-field-duration-0-value').val(duration_in_minutes.toFixed(2)); // in minutes
                const price = getPrice(result.distance.value);
                $('#edit-field-price-0-value').val('');
                if ($.isNumeric(price)) {
                  document.getElementById('price').innerText = price;
                  $('#edit-field-price-0-value').val(price);
                }
                else {
                  document.getElementById('price').innerHTML = '<div class="tooltip">Request Quote<span class="tooltiptext">Book and our team will contact you for price</span></div>';
                }
              });
            })
            .catch((e) => console.log("Directions request failed due to " + e));
          }
      });
    }
  }
    
  function getPrice(route_distance) {
    const vehicleType = $('#edit-field-car-type').val();
    const carTypes = drupalSettings.cab_booking.car_types;

    if (!$.isNumeric(vehicleType) || !carTypes || !carTypes[vehicleType]) {
      return '';
    }

    const {
      price_per_unit,
      minimum_distance,
      minimum_price,
      maximum_distance
    } = carTypes[vehicleType];
    
    if (
      !$.isNumeric(price_per_unit) ||
      !$.isNumeric(minimum_distance) ||
      !$.isNumeric(minimum_price) ||
      !$.isNumeric(maximum_distance)
    ) {
      return '';
    }

    const route_distance_in_km = route_distance / 1000; // Convert meters to kilometers
    if (route_distance_in_km < minimum_distance) {
      return minimum_price;
    }

    if (route_distance_in_km > maximum_distance) {
      return '';
    }
    return (route_distance_in_km * price_per_unit).toFixed(2); // Return price rounded to 2 decimal places

  }

  function getDistanceBetweenPlaces(sourcePlaceId, destinationPlaceId, callback) {
    const service = new google.maps.DistanceMatrixService();

    service.getDistanceMatrix(
      {
        origins: [{ placeId: sourcePlaceId }],
        destinations: [{ placeId: destinationPlaceId }],
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC,
      },
      (response, status) => {
        if (status !== 'OK') {
          console.error('Error getting distance matrix:', status);
          return;
        }

        const result = response.rows[0].elements[0];

        if (result.status === 'OK') {
          const distanceText = result.distance.text; // e.g. "14.2 km"
          const durationText = result.duration.text; // e.g. "23 mins"

          console.log('Distance:', distanceText, '| Duration:', durationText);

          // Optional: return result to callback
          if (typeof callback === 'function') {
            callback({
              distance: result.distance,
              duration: result.duration,
            });
          }
        } else {
          console.warn('Distance not found:', result.status);
        }
      }
    );
  }


})(jQuery, Drupal);
