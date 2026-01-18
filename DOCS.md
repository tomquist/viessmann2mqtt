# Viessmann2MQTT Home Assistant Add-on

This add-on runs the Viessmann2MQTT service inside Home Assistant, polling the Viessmann API and publishing data to MQTT for Home Assistant discovery.

## Configuration

## Prerequisites

You must create a Viessmann API client ID in the Viessmann developer portal before configuring this add-on.

1. Sign in to the [Viessmann developer portal](https://app.developer.viessmann-climatesolutions.com) using your existing ViCare app credentials.
2. In the **Clients** section, select **Add** and create a client with:
   - Name: `HomeAssistant`
   - Google reCAPTCHA: `disabled`
   - Redirect URI: `vicare://oauth-callback/everest`
3. Copy the **Client ID** from the **Clients** section and use it as the `client_id` in the add-on configuration.

**Note:** It can take up to an hour for a newly created client to become active.

### Required

- `username`: Your Viessmann account username.
- `password`: Your Viessmann account password.
- `client_id`: Your Viessmann API client ID.

### Optional

- `client_secret`: Optional client secret (useful for private applications).
- `poll_interval`: Polling interval in seconds.
- `mqtt_topic`: Base MQTT topic.
- `mqtt_client_id`: MQTT client ID.
- `mqtt_retain`: Retain MQTT messages.
- `mqtt_discovery`: Enable Home Assistant discovery.
- `mqtt_commands`: Enable MQTT command subscription.
- `verbose`: Enable verbose logging.

### Advanced (hidden) MQTT overrides

By default, the add-on uses the Home Assistant MQTT service credentials via bashio.
If you need to override them, set the following optional fields in the add-on configuration (YAML mode):

- `mqtt_uri`: MQTT broker URI (e.g. `mqtt://core-mosquitto:1883`).
- `mqtt_username`: MQTT username override.
- `mqtt_password`: MQTT password override.

## Notes

- Ensure the Home Assistant MQTT integration is installed and configured, unless you provide manual MQTT settings above.
- Optional values inherit application defaults when not set in the add-on configuration.

## API limits

The Viessmann API is rate-limited. Basic tier limits are 120 calls per 10 minutes and 1450 calls per 24 hours; exceeding them results in a 24-hour block. If you have multiple devices, these limits are shared across them.
