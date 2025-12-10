# Field Group Markup

## Description
This module provides a very simple and basic Field Group Formatter that allows you to add processed HTML as markup to your entity form displays.

All base Field Group settings (like ID, classes, and hiding if empty) are supported. The markup has support for token replacement.

It's recommended that you leave "Display element also when empty" checked (it is by default) especially if you don't plan to nest anything inside your markup element.

## Requirements
- Drupal 9+
- Field Group module

## Installation
1. Run `composer require drupal/field_group_markup`.
2. Enable the module at `/admin/modules` or via `drush`.

## Configuration
1. Go to the field group configuration for your content type or entity.
2. Select "Markup" as the formatter.
3. Configure settings.

## Usage
- Use in form displays to add structural markup.
- Use in view displays for custom layouts.
- Supports token replacement in markup text.
- Integrates with Drupal's text formats for security and features.
