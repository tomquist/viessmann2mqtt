#!/usr/bin/with-contenv bashio
set -euo pipefail

bashio::log.info "Starting viessmann2mqtt..."
bashio::log.info "Reading configuration..."

V2M_USERNAME="$(bashio::config 'username')"
bashio::log.info "V2M_USERNAME length: ${#V2M_USERNAME}"

V2M_PASSWORD="$(bashio::config 'password')"
bashio::log.info "V2M_PASSWORD length: ${#V2M_PASSWORD}"

V2M_CLIENT_ID="$(bashio::config 'client_id')"
bashio::log.info "V2M_CLIENT_ID length: ${#V2M_CLIENT_ID}"
V2M_POLL_INTERVAL=""
if bashio::config.has_value 'poll_interval'; then
  V2M_POLL_INTERVAL="$(bashio::config 'poll_interval')"
fi

V2M_MQTT_TOPIC=""
if bashio::config.has_value 'mqtt_topic'; then
  V2M_MQTT_TOPIC="$(bashio::config 'mqtt_topic')"
fi

V2M_MQTT_CLIENT_ID=""
if bashio::config.has_value 'mqtt_client_id'; then
  V2M_MQTT_CLIENT_ID="$(bashio::config 'mqtt_client_id')"
fi

V2M_MQTT_RETAIN=""
if bashio::config.has_value 'mqtt_retain'; then
  V2M_MQTT_RETAIN="$(bashio::config 'mqtt_retain')"
fi

V2M_MQTT_COMMANDS=""
if bashio::config.has_value 'mqtt_commands'; then
  V2M_MQTT_COMMANDS="$(bashio::config 'mqtt_commands')"
fi

V2M_VERBOSE=""
if bashio::config.has_value 'verbose'; then
  V2M_VERBOSE="$(bashio::config 'verbose')"
fi

V2M_CLIENT_SECRET=""
if bashio::config.has_value 'client_secret'; then
  V2M_CLIENT_SECRET="$(bashio::config 'client_secret')"
fi

V2M_REDIRECT_URI=""
if bashio::config.has_value 'redirect_uri'; then
  V2M_REDIRECT_URI="$(bashio::config 'redirect_uri')"
fi

V2M_SCOPES=""
if bashio::config.has_value 'scopes'; then
  V2M_SCOPES="$(bashio::config 'scopes')"
fi

mqtt_uri=""
if bashio::config.has_value 'mqtt_uri'; then
  mqtt_uri="$(bashio::config 'mqtt_uri')"
fi

mqtt_username=""
if bashio::config.has_value 'mqtt_username'; then
  mqtt_username="$(bashio::config 'mqtt_username')"
fi

mqtt_password=""
if bashio::config.has_value 'mqtt_password'; then
  mqtt_password="$(bashio::config 'mqtt_password')"
fi

bashio::log.info "Configuring MQTT connection..."

if [[ -z "${mqtt_uri}" ]]; then
  if bashio::services.available "mqtt"; then
    bashio::log.info "Using MQTT service discovery..."
    mqtt_host="$(bashio::services mqtt "host")"
    mqtt_port="$(bashio::services mqtt "port")"
    mqtt_uri="mqtt://${mqtt_host}:${mqtt_port}"
    bashio::log.info "MQTT URI: ${mqtt_uri}"
  fi
fi

if [[ -z "${mqtt_username}" ]] && bashio::services.available "mqtt"; then
  mqtt_username="$(bashio::services mqtt "username")"
fi

if [[ -z "${mqtt_password}" ]] && bashio::services.available "mqtt"; then
  mqtt_password="$(bashio::services mqtt "password")"
fi

bashio::log.info "Validating configuration..."

if [[ -z "${mqtt_uri}" ]]; then
  bashio::exit.nok "No MQTT broker configured. Set mqtt_uri or enable the MQTT integration."
fi

if [[ -z "${V2M_USERNAME}" ]]; then
  bashio::exit.nok "Missing env var V2M_USERNAME. Please configure 'username' in the add-on configuration."
fi

if [[ -z "${V2M_PASSWORD}" ]]; then
  bashio::exit.nok "Missing env var V2M_PASSWORD. Please configure 'password' in the add-on configuration."
fi

if [[ -z "${V2M_CLIENT_ID}" ]]; then
  bashio::exit.nok "Missing env var V2M_CLIENT_ID. Please configure 'client_id' in the add-on configuration."
fi

bashio::log.info "Configuration validated successfully"
bashio::log.info "Exporting environment variables..."

export V2M_USERNAME
export V2M_PASSWORD
export V2M_CLIENT_ID
export V2M_MQTT_URI="${mqtt_uri}"

if [[ -n "${V2M_CLIENT_SECRET}" ]]; then
  export V2M_CLIENT_SECRET
fi

if [[ -n "${V2M_REDIRECT_URI}" ]]; then
  export V2M_REDIRECT_URI
fi

if [[ -n "${V2M_SCOPES}" ]]; then
  export V2M_SCOPES
fi

if [[ -n "${V2M_POLL_INTERVAL}" ]]; then
  export V2M_POLL_INTERVAL
fi

if [[ -n "${V2M_MQTT_TOPIC}" ]]; then
  export V2M_MQTT_TOPIC
fi

if [[ -n "${V2M_MQTT_CLIENT_ID}" ]]; then
  export V2M_MQTT_CLIENT_ID
fi

if [[ -n "${V2M_MQTT_RETAIN}" ]]; then
  export V2M_MQTT_RETAIN
fi

if [[ -n "${V2M_MQTT_COMMANDS}" ]]; then
  export V2M_MQTT_COMMANDS
fi

if [[ -n "${V2M_VERBOSE}" ]]; then
  export V2M_VERBOSE
fi

if [[ -n "${mqtt_username}" ]]; then
  export V2M_MQTT_USERNAME="${mqtt_username}"
fi

if [[ -n "${mqtt_password}" ]]; then
  export V2M_MQTT_PASSWORD="${mqtt_password}"
fi

bashio::log.info "Starting application..."
node /app/bin/app.js
