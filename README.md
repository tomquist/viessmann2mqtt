# viessmann2mqtt

CLI tool to poll the Viessmann API for feature data and publish it to an MQTT broker.

## Locally
```bash
yarn install && yarn build
V2M_USERNAME='***' \
  V2M_PASSWORD='***' \
  V2M_CLIENT_ID=*** \
  V2M_MQTT_URI=mqtt://rpi1:1883 \
  yarn start
```

## Docker
```bash
docker run -d \
  -e V2M_USERNAME='***' \
  -e V2M_PASSWORD='***' \
  -e V2M_CLIENT_ID=*** \
  -e V2M_MQTT_URI=mqtt://rpi1:1883
  tomquist/viessmann2mqtt:latest
```

## Configuration
The app can be configured using these environment variables:

- `V2M_USERNAME` (required): Username of the Viessmann account
- `V2M_PASSWORD` (required): Password of the Viessann account 
- `V2M_CLIENT_ID` (required): A Viessmann API client id
- `V2M_CLIENT_SECRET` (required): Optional client secret (not required when using a public API key)
- `V2M_ACCESS_TOKEN_URI` (optional): Override the OAuth token URL. Default `https://iam.viessmann-climatesolutions.com/idp/v3/token`
- `V2M_AUTHORIZATION_URI` (optional): Override the OAuth authorization URL. Default `https://iam.viessmann-climatesolutions.com/idp/v3/authorize`
- `V2M_REDIRECT_URL` (optional): Set this to customize the redirect URL. Default `https://localhost/redirect`
- `V2M_SCOPES` (optional): Can be used to customize the scopes using a comma-separated list. Default `IoT User,offline_access` 
- `V2M_BASE_URL` (optional): Override the Viessmann API base URL. Default `https://api.viessmann-climatesolutions.com`
- `V2M_POLL_INTERVAL` (optional): The polling interval in seconds (Default `60`) 
- `V2M_MQTT_URI` (required): // The MQTT broker URL, e.g. `mqtt://host:1883`
- `V2M_MQTT_USERNAME` (optional): // Optional username for MQTT authentication
- `V2M_MQTT_PASSWORD` (optional): // Optional password for MQTT authentication
- `V2M_MQTT_CLIENT_ID` (optional): // MQTT client identifier. Default: `viessmann2mqtt`
- `V2M_MQTT_TOPIC` (required): // Topic prefix where data should be published. Default: `viessmann`
- `V2M_VERBOSE` (optional): // Set to `true` for more logs. Default: `false'