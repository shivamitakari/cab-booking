# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Drupal 10 site ("cab-booking") that lets visitors request a cab reservation through a public form, see a live Google Maps route, distance, duration, and an automatically calculated fare, then have staff confirm the booking. Built on the `drupal/recommended-project` template with a relocated document root (`web/`). Local development uses Lando (`drupal10` recipe, PHP 8.2).

## Development commands

This project runs under Lando. Drush and Composer must be run inside the Lando container.

- `lando start` — boot the local environment (first run builds containers)
- `lando drush cr` — clear all caches (run after most config/code changes)
- `lando drush cim` — import configuration from `config/sync` into the database
- `lando drush cex` — export the active config back to `config/sync` (do this after any config change made through the UI, then commit the YAML)
- `lando drush uli` — generate a one-time admin login link
- `lando composer require drupal/<module>` — add a contrib module
- `lando drush sqlc < prod-10-Dec-2025.sql` — load the committed production database dump

There is no automated test suite, linter, or build step configured in this repo beyond Drupal core's tooling. `.editorconfig` defines whitespace conventions.

## Database configuration

`web/sites/default/settings.php` is committed to the repo, and its `$databases['default']['default']` block gets hand-edited frequently as the local dev setup changes — don't assume the values documented here are still current; read the file. As of this writing it points to `host: database` with credentials `drupal10`/`drupal10`/`drupal10`, but `.lando.yml` currently defines the database service under the key `database_11` (image `bitnamilegacy/mariadb:10.3.27`, creds `database_11`/`database_11`/`database_11`) — in Lando the service key is the in-network hostname, so this is a real mismatch worth checking/fixing before assuming a fresh `lando start` will connect. If starting fresh, either restore the production dump (`lando drush sqlc < prod-10-Dec-2025.sql`) once the DB connects, or reconcile `settings.php`'s `host`/credentials with whatever service key and creds `.lando.yml` actually defines.

## Configuration-as-code workflow

Site configuration lives as YAML in `config/sync/` (283 files) and is the source of truth for content types, fields, displays, blocks, views, roles, and taxonomy. Structural changes (adding fields, altering form/view displays, etc.) should be made so they end up in `config/sync` via `drush cex` and committed — not left only in the database. After pulling changes, run `drush cim` then `drush cr`.

## Architecture

### Custom module: `web/modules/custom/cab_booking`

This is where essentially all project-specific PHP/JS logic lives. Key pieces:

- **`CabBookingBlock`** (`src/Plugin/Block/CabBookingBlock.php`) — the entry point of the UX. It builds a fresh unsaved `booking` node via `Node::create()`, renders that node's `user_booking` form mode via `EntityFormBuilderInterface::getForm()`, and passes it to the `cab_booking` theme hook. It also loads all car-type data via `CarTypeService` and pushes it into `drupalSettings` for the front-end fare calculator. Note: `build()` also calls `getFormObject('node', 'default')->setEntity($node)` but assigns the result to an unused `$form` variable — that call is dead code; the rendered form comes entirely from `$this->entityFormBuilder->getForm($node, 'user_booking')`.
- **`CarTypeService`** (`src/Service/CarTypeService.php`, service id `cab_booking.car_type_service`) — loads `car_type` taxonomy terms and exposes their pricing fields (`field_minimum_distance`, `field_maximum_distance`, `field_minimum_price`, `field_price_per_unit`, `field_seat_capacity`) as a keyed array indexed by term ID.
- **`cab_booking.module`** — the glue via hooks:
  - `hook_entity_presave` / `hook_entity_insert` auto-title booking nodes as `Booking #<id>`. The presave sets title to `'Booking'` as a placeholder; the insert fires a second `$entity->save()` to rewrite it as `Booking #<id>` — this causes two DB writes per new booking.
  - `hook_form_..._alter` relabels the submit button to "Request Reservation", strips revision UI from the confirm form, and registers a validation handler that rejects bookings whose requested seats exceed the selected car type's `field_seat_capacity`.
  - `hook_entity_type_alter` registers two extra node form classes/operations: `user_booking` (public request form) and `booking_confirm` (staff confirmation form). Both reuse `\Drupal\node\NodeForm`.
- **`js/price-calculator.js`** (library `cab_booking/price-calculator`) — runs the Google Maps integration: Places Autocomplete on the From/Destination fields, draws the route, uses the DistanceMatrix service to populate the hidden `field_distance`/`field_duration` fields, and computes the fare from the `drupalSettings` car-type data. Falls back to a "Request Quote" tooltip when distance is out of range.

### Domain model (defined in `config/sync`)

- **Content type `booking`** carries the reservation: `field_from`, `field_destination`, `field_car_type` (ref → `car_type` vocab), `field_seats`, `field_distance`, `field_duration`, `field_price`, `field_reservation_date`, `field_full_name`, `field_contact_number`, `field_email_id`, `field_booking_status` (ref → `booking_status` vocab), plus message/add-on fields.
- **Two form modes** drive the two-step flow: `user_booking` (what the public block renders) and `booking_confirm` (staff-only).
- **Taxonomies**: `car_type` holds pricing/capacity rules per vehicle; `booking_status` tracks workflow state.
- **Role `booking_manager`** has `edit any booking content` for staff who confirm reservations.
- **View `booking_list`** (`config/sync/views.view.booking_list.yml`) is the admin listing of `booking` nodes — the internal counterpart to the token-gated `/api/bookings/summary` JSON feed below.

### Routing

`/booking/{node}/confirm` (`cab_booking.booking.confirm`) renders the `booking_confirm` node form mode, gated by `node.update` access — this is the staff confirmation step.

`GET /api/bookings/summary` (`cab_booking.api.summary`, `BookingApiController::summary`) returns a small, PII-safe JSON summary of bookings — KPIs (today / pending 7d / confirmed 7d / revenue 7d), a 7-day per-day series, status and car-type breakdowns, and the last 10 bookings with the customer name masked to initials. It's consumed by the external "booking dashboard" view. Access is gated by a shared token: set `$settings['cab_booking_api_token']` in `settings.php` and send it via the `X-API-Token` header (or `?token=` query param); without it the endpoint returns 403.

### MCP server: `mcp/booking-summary`

A small local Node MCP server (`mcp/booking-summary/index.js`) wraps `GET /api/bookings/summary` as a single tool, `get_booking_summary`, so a Cowork/Claude Desktop "booking dashboard" artifact can pull live data from the Drupal site over stdio JSON-RPC. It needs `CAB_BOOKING_URL` and `CAB_BOOKING_API_TOKEN` (matching `$settings['cab_booking_api_token']`) set in its MCP server config; see `mcp/booking-summary/README.md` for setup.

### Theme

Default front-end theme is the custom **`booking`** theme ("Zanaverse booking theme", base theme Olivero) at `web/themes/csutom/booking` (note the directory is spelled `csutom`). Admin theme is Claro.

## Contrib modules of note

`geolocation`, `google_place_autocomplete` (Google Maps / Places integration backing the route map and address fields), `phonenumber`, `field_group`, `captcha` + `recaptcha_v3` (spam protection on the booking forms).

## Project-specific Claude Code config

`.claude/agents/` defines three subagents scoped to this repo — `cab-booking-developer` (structural/PHP changes that must land in `config/sync`), `cab-booking-frontend-developer` (Twig/CSS/JS in the `booking` theme and module libraries), and `cab-booking-qa` (end-to-end verification after a change lands). `.claude/skills/add-car-type` automates creating a new `car_type` taxonomy term (a content operation — no `drush cex` needed, just `drush cr`).
