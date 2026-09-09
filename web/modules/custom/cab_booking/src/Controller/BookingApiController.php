<?php

namespace Drupal\cab_booking\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Site\Settings;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Returns an aggregated, PII-safe JSON summary of bookings.
 *
 * Consumed by the Cowork "booking-dashboard" artifact (via an MCP connector).
 * The payload is intentionally pre-aggregated and small: it contains counts,
 * a 7-day series, breakdowns, and the last 10 bookings with the customer name
 * masked to initials — so no personal data leaves the site.
 *
 * Access is gated by a shared secret. Set it in settings.php:
 * @code
 * $settings['cab_booking_api_token'] = 'some-long-random-string';
 * @endcode
 * and send it on each request via the `X-API-Token` header (preferred) or a
 * `?token=` query parameter.
 */
class BookingApiController extends ControllerBase {

  /**
   * The entity type manager.
   *
   * @var \Drupal\Core\Entity\EntityTypeManagerInterface
   */
  protected $entityTypeManager;

  /**
   * The request stack.
   *
   * @var \Symfony\Component\HttpFoundation\RequestStack
   */
  protected $requestStack;

  public function __construct(EntityTypeManagerInterface $entity_type_manager, RequestStack $request_stack) {
    $this->entityTypeManager = $entity_type_manager;
    $this->requestStack = $request_stack;
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('entity_type.manager'),
      $container->get('request_stack')
    );
  }

  /**
   * Builds the summary payload.
   */
  public function summary() {
    $request = $this->requestStack->getCurrentRequest();

    // --- Shared-token authentication ---------------------------------------
    $expected = (string) Settings::get('cab_booking_api_token', '');
    $provided = (string) ($request->headers->get('X-API-Token') ?: $request->query->get('token', ''));
    if ($expected === '' || !hash_equals($expected, $provided)) {
      return new JsonResponse([
        'error' => 'Forbidden. Set $settings[\'cab_booking_api_token\'] in settings.php and send it via the X-API-Token header.',
      ], 403);
    }

    $node_storage = $this->entityTypeManager->getStorage('node');
    $term_storage = $this->entityTypeManager->getStorage('taxonomy_term');

    // Load published booking nodes, newest first.
    $ids = $node_storage->getQuery()
      ->condition('type', 'booking')
      ->condition('status', 1)
      ->sort('created', 'DESC')
      ->accessCheck(FALSE)
      ->execute();
    $nodes = $ids ? $node_storage->loadMultiple($ids) : [];

    // Small cache so we resolve each taxonomy term only once.
    $term_names = [];
    $term_name = function ($tid) use (&$term_names, $term_storage) {
      if (empty($tid)) {
        return NULL;
      }
      if (!array_key_exists($tid, $term_names)) {
        $term = $term_storage->load($tid);
        $term_names[$tid] = $term ? $term->label() : NULL;
      }
      return $term_names[$tid];
    };

    // Mask a full name down to initials, e.g. "Jane Okafor" -> "J. O.".
    $mask = function ($name) {
      $name = trim((string) $name);
      if ($name === '') {
        return 'Guest';
      }
      $parts = preg_split('/\s+/', $name);
      $out = strtoupper(substr($parts[0], 0, 1)) . '.';
      if (count($parts) > 1) {
        $last = end($parts);
        $out .= ' ' . strtoupper(substr($last, 0, 1)) . '.';
      }
      return $out;
    };

    $field_value = function ($node, $field) {
      return $node->hasField($field) && !$node->get($field)->isEmpty()
        ? $node->get($field)->value
        : NULL;
    };
    $field_target = function ($node, $field) {
      return $node->hasField($field) && !$node->get($field)->isEmpty()
        ? $node->get($field)->target_id
        : NULL;
    };

    $now = new \DateTimeImmutable('now');
    $today_start = $now->setTime(0, 0, 0)->getTimestamp();
    $week_start = $now->modify('-6 days')->setTime(0, 0, 0)->getTimestamp();

    // Pre-seed the 7-day series so empty days still appear.
    $per_day = [];
    for ($i = 6; $i >= 0; $i--) {
      $day = $now->modify("-{$i} days");
      $per_day[$day->format('Y-m-d')] = [
        'label' => $day->format('D j'),
        'count' => 0,
      ];
    }

    $kpi_today = 0;
    $pending_7d = 0;
    $confirmed_7d = 0;
    $revenue_7d = 0.0;
    $by_status = [];
    $by_car_type = [];
    $recent = [];

    foreach ($nodes as $node) {
      $created = (int) $node->getCreatedTime();
      $price = (float) ($field_value($node, 'field_price') ?? 0);
      $status = $term_name($field_target($node, 'field_booking_status')) ?: 'Unknown';
      $car_type = $term_name($field_target($node, 'field_car_type')) ?: 'Unknown';

      $is_cancel = stripos($status, 'cancel') !== FALSE;

      if ($created >= $today_start) {
        $kpi_today++;
      }

      if ($created >= $week_start) {
        if (stripos($status, 'pend') !== FALSE) {
          $pending_7d++;
        }
        if (stripos($status, 'confirm') !== FALSE) {
          $confirmed_7d++;
        }
        if (!$is_cancel) {
          $revenue_7d += $price;
        }

        $day_key = date('Y-m-d', $created);
        if (isset($per_day[$day_key])) {
          $per_day[$day_key]['count']++;
        }

        $by_status[$status] = ($by_status[$status] ?? 0) + 1;
        $by_car_type[$car_type] = ($by_car_type[$car_type] ?? 0) + 1;
      }

      if (count($recent) < 10) {
        $recent[] = [
          'ref' => 'BK-' . $node->id(),
          'customer' => $mask($field_value($node, 'field_full_name')),
          'from' => $field_value($node, 'field_from'),
          'to' => $field_value($node, 'field_destination'),
          'car_type' => $car_type,
          'fare' => round($price, 2),
          'status' => $status,
          'created' => $created,
        ];
      }
    }

    $data = [
      'generated_at' => $now->format(\DateTimeInterface::ATOM),
      'currency' => 'GBP',
      'kpis' => [
        'today' => $kpi_today,
        'pending_7d' => $pending_7d,
        'confirmed_7d' => $confirmed_7d,
        'revenue_7d' => round($revenue_7d, 2),
      ],
      'per_day' => array_values($per_day),
      'by_status' => $by_status,
      'by_car_type' => $by_car_type,
      'recent' => $recent,
    ];

    $response = new JsonResponse($data);
    $response->headers->set('Cache-Control', 'no-store');
    return $response;
  }

}
