<?php

/**
 * @file
 * Views integration for the cab_booking module.
 */

use Drupal\field\FieldStorageConfigInterface;

/**
 * Implements hook_field_views_data_alter().
 *
 * Core only derives Views handlers for configurable fields from the database
 * column type, so a 'timestamp' field such as field_reservation_date is exposed
 * with the plain 'numeric' filter and staff would have to type raw Unix
 * timestamps to filter on it. Core already maps timestamp *base* fields to the
 * date handlers in \Drupal\views\EntityViewsData::mapSingleFieldViewsData(); we
 * apply the same mapping to configurable timestamp fields so the exposed
 * "Reservation Date" filter on the new_cab_bookings view accepts dates.
 */
function cab_booking_field_views_data_alter(array &$data, FieldStorageConfigInterface $field_storage) {
  if ($field_storage->getType() !== 'timestamp') {
    return;
  }

  $column = $field_storage->getName() . '_value';
  foreach ($data as $table_name => $table_data) {
    if (isset($table_data[$column]['filter'])) {
      $data[$table_name][$column]['filter']['id'] = 'date';
    }
  }
}
