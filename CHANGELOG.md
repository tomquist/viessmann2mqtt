# Changelog

## [Next]
- Home Assistant: energy vs. power sensors are now derived from the unit the API reports instead of the feature path (#18):
  - Current readings like `heating.compressors.N.power.consumption.current`, `heating.power.consumption.current` and `heating.heat.production.current` are `power` sensors (`W`/`kW`, `state_class: measurement`) instead of `kWh` energy counters.
  - Cumulative counters like `heating.power.production.cumulative` and `heating.solar.power.production` are `energy` sensors instead of `power` sensors with a `kWh` unit.
  - `heating.power.purchase/sold.*`, `pcc.transfer.*.total` and other power/energy features without a matching path now get the `power`/`energy` device class.
  - Values reported in `wattHour` are shown as `Wh` instead of being labelled `kWh` (previously off by a factor of 1000).


## [1.1.1] - 2026-03-29


## [1.1.0] - 2026-03-28
- API: handle non-array `installations` responses from the Viessmann API (avoids crashes on unexpected payload shapes).
- Documentation: Home Assistant add-on terminology updated to **App** where relevant.
- Home Assistant: split `...statistics` discovery into separate per-property sensors, so independent metrics like `starts` and `hours` are exposed as distinct entities with the correct unit.
- Home Assistant: for features that expose `activate`/`deactivate` (no params), `setActive` (boolean `active`), and a boolean `active` property (for example DHW one-time charge), discovery now creates a single optimistic MQTT switch instead of a binary sensor, two buttons, and a separate `setActive` switch. Features with only `activate`/`deactivate` are unchanged.
- Home Assistant: discovery, MQTT command handling, device availability, and reported software version (`V2M_APP_VERSION` / `origin.sw_version`) improvements.
- Home Assistant: MQTT discovery uses `default_entity_id` instead of deprecated `object_id`.
- Home Assistant: keep bus topology metadata out of sensor state payloads (only the intended metric is published as state).
- Build and release: pre-built add-on images on GitHub Container Registry (`image` in `config.yaml`), `aarch64`/`amd64` only in `config.yaml`, `develop`/`main` branching, `release.sh` and Release workflow, Docker Hub / GHCR multi-arch tags (`edge`/`next` on `develop`, **`latest` on `main`** and semver tags), and maintainer notes for `RELEASE_TOKEN` and public GHCR packages.

## 1.0.0
- Initial Home Assistant add-on support.
