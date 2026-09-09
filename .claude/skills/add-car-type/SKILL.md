---
name: add-car-type
description: >-
  Add a new car type (vehicle pricing tier) to the cab-booking Drupal project — a
  term in the `car_type` taxonomy with its fare fields (minimum/maximum distance,
  minimum price, price per unit, seat capacity). Use this whenever the user wants to
  add, create, or set up a new vehicle option, cab category, or pricing tier for the
  cab-booking app — e.g. "add an SUV option", "create a Van car type at ₹3/km",
  "set up a luxury sedan with a 6-seat capacity", or "we need a new mini pricing tier".
  Trigger even if the user doesn't say the words "taxonomy" or "car_type" — any request
  to add a bookable vehicle/pricing tier to this project is this skill.
---

# Add a car type

## What this does and why

The cab-booking site prices each ride from a `car_type` taxonomy term. Each term
carries the pricing rules for one kind of vehicle. `CarTypeService` loads these
terms and the booking block pushes them into `drupalSettings`, where the front-end
fare calculator (`price-calculator.js`) reads them. So "adding a car type" means
**creating one taxonomy term with the right fields**, then clearing cache so the
new term flows through to the form.

Doing this by hand through the admin UI is easy to get wrong: a missing field, an
inverted min/max, or a forgotten cache clear silently breaks fare calculation. This
skill makes it a repeatable, validated, one-shot operation.

## The data model (confirm before you rely on it)

Vocabulary: **`car_type`**. Each term needs a name (the vehicle label the customer
sees, e.g. "Sedan") plus these fields:

| Field machine name        | Meaning                                   | Example |
|---------------------------|-------------------------------------------|---------|
| `field_minimum_distance`  | Lower bound of the priced range, in km    | `0`     |
| `field_maximum_distance`  | Upper bound; beyond this shows "Request Quote" | `50` |
| `field_minimum_price`     | Base/floor fare charged below min distance | `15.00` |
| `field_price_per_unit`    | Fare charged per km within range          | `2.50`  |
| `field_seat_capacity`     | Max seats (booking is rejected above this) | `4`     |

These names come from the project's `config/sync` and `CLAUDE.md`. If a term save
fails on an unknown field, don't guess — grep `config/sync` for
`field.field.taxonomy_term.car_type.*` to confirm the current field set, and adjust.

**Important:** a taxonomy term is *content*, not configuration. It lives in the
database, so — unlike adding a field or changing structure — you do **not** run
`drush cex` afterwards. You only need a cache rebuild.

## Workflow

### 1. Collect the values

Ask for anything the user hasn't already given: vehicle name, minimum distance,
maximum distance, minimum price, price per unit, seat capacity. If they give a
partial spec (common), confirm the rest with sensible prompts rather than inventing
numbers. Echo the full set back for confirmation before writing anything.

### 2. Sanity-check the inputs

Catch obvious mistakes conversationally before touching the database:

- all five numeric fields are actually numbers;
- `minimum_distance` is **less than** `maximum_distance` (a very common slip);
- `price_per_unit` > 0 and `minimum_price` ≥ 0;
- `seat_capacity` is a positive whole number;
- the name isn't blank.

The bundled script re-checks all of this server-side, so this step is just for a
fast, friendly heads-up.

### 3. Create the term

Copy `scripts/create_car_type.php` from this skill into the **project root** as a
temporary file, fill in the six values at the top, then run it inside Lando. Using a
written script (rather than a long `drush php:eval` one-liner) avoids shell-escaping
headaches and keeps the operation reviewable.

```bash
# from the project root (the folder containing .lando.yml)
cp <this-skill>/scripts/create_car_type.php ./create_car_type.tmp.php
#  → edit ./create_car_type.tmp.php: set the 6 values in the EDIT block
lando drush scr create_car_type.tmp.php
rm ./create_car_type.tmp.php
```

The script validates, refuses to create a duplicate name, creates the term, and
prints the new term id (or the list of problems if validation failed).

### 4. Clear cache

```bash
lando drush cr
```

This is what makes `CarTypeService` re-read terms and the booking block re-publish
the updated `drupalSettings`, so the new vehicle appears in the dropdown and prices
correctly.

### 5. Verify

Confirm the term exists and its fields stuck:

```bash
lando drush php:eval "\$t = \Drupal::entityTypeManager()->getStorage('taxonomy_term')->loadByProperties(['vid'=>'car_type','name'=>'Sedan']); \$t = reset(\$t); print_r(['tid'=>\$t->id(),'min_km'=>\$t->get('field_minimum_distance')->value,'max_km'=>\$t->get('field_maximum_distance')->value,'min_price'=>\$t->get('field_minimum_price')->value,'per_km'=>\$t->get('field_price_per_unit')->value,'seats'=>\$t->get('field_seat_capacity')->value]);"
```

(Replace `Sedan` with the name you used.) If you can open the site, also load the
booking form and check the new option appears and a sample route prices as expected.

Report back the new term id and a one-line summary of the pricing you set.

## Example

**Input:** "Add an SUV: 0–60 km range, ₹200 base, ₹18/km, seats 6."

**What you do:** confirm the values → copy and fill the script
(`$name='SUV'; $minimum_distance=0; $maximum_distance=60; $minimum_price=200;
$price_per_unit=18; $seat_capacity=6;`) → `lando drush scr create_car_type.tmp.php`
→ `rm` the temp file → `lando drush cr` → verify.

**Output:** "Created car type 'SUV' (tid 12): priced ₹18/km over 0–60 km, ₹200 base
fare, up to 6 seats. Cache cleared — it's live on the booking form."

## Notes & edge cases

- **Currency is not stored on the term** — the fields are plain numbers; the symbol
  is presentation. Keep units consistent with the existing terms (km, and whatever
  currency the site already uses).
- **Duplicate names** are rejected by the script to avoid two terms competing in the
  dropdown. If the user genuinely wants a variant, suggest a distinct name
  ("SUV — Premium").
- **If the site isn't running**, `lando start` first. If `lando` isn't the tool in
  use, the same script works with plain `drush scr create_car_type.tmp.php` from a
  bootstrapped environment.
- **Editing an existing car type** (changing a rate) is the same pattern with a
  `loadByProperties()` + set + save instead of `create()` — offer this if the user
  actually meant "update", not "add".
