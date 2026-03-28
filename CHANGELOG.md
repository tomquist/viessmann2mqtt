# Changelog

## [Next]
- Home Assistant: split `...statistics` discovery into separate per-property sensors, so independent metrics like `starts` and `hours` are exposed as distinct entities with the correct unit.
- Home Assistant: for features that expose `activate`/`deactivate` (no params), `setActive` (boolean `active`), and a boolean `active` property (for example DHW one-time charge), discovery now creates a single optimistic MQTT switch instead of a binary sensor, two buttons, and a separate `setActive` switch. Features with only `activate`/`deactivate` are unchanged.

## 1.0.0
- Initial Home Assistant add-on support.
