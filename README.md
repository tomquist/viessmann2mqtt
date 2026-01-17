# viessmann2mqtt

CLI tool to poll the Viessmann API for feature data and publish it to an MQTT broker. Supports automatic Home Assistant device discovery and bidirectional command execution via MQTT.

## Features

- **Automatic Data Polling**: Continuously polls Viessmann API and publishes device data to MQTT
- **Home Assistant Integration**: Automatic device discovery for seamless Home Assistant integration
- **MQTT Commands**: Bidirectional communication - send commands to your Viessmann devices via MQTT
- **Multiple Device Support**: Supports heating systems, gas boilers, heat pumps, fuel cells, and hybrid systems
- **Multiple Installations**: Handles multiple installations, gateways, and devices
- **Change Detection**: Only publishes data when values change, reducing MQTT traffic
- **Configurable Polling**: Adjustable polling interval to balance responsiveness and API usage

## Installation

### Locally
```bash
npm install && npm run build
V2M_USERNAME='***' \
  V2M_PASSWORD='***' \
  V2M_CLIENT_ID=*** \
  V2M_MQTT_URI=mqtt://rpi1:1883 \
  npm start
```

### Docker
```bash
docker run -d \
  -e V2M_USERNAME='***' \
  -e V2M_PASSWORD='***' \
  -e V2M_CLIENT_ID=*** \
  -e V2M_MQTT_URI=mqtt://rpi1:1883 \
  tomquist/viessmann2mqtt:latest
```

## Configuration

The app can be configured using these environment variables:

### Viessmann API Configuration

- `V2M_USERNAME` (required): Username of the Viessmann account
- `V2M_PASSWORD` (required): Password of the Viessmann account 
- `V2M_CLIENT_ID` (required): A Viessmann API client id
- `V2M_CLIENT_SECRET` (optional): Client secret (not required when using a public API key)
- `V2M_ACCESS_TOKEN_URI` (optional): Override the OAuth token URL. Default `https://iam.viessmann-climatesolutions.com/idp/v3/token`
- `V2M_AUTHORIZATION_URI` (optional): Override the OAuth authorization URL. Default `https://iam.viessmann-climatesolutions.com/idp/v3/authorize`
- `V2M_REDIRECT_URI` (optional): Set this to customize the redirect URL. Default `https://localhost/redirect`
- `V2M_SCOPES` (optional): Can be used to customize the scopes using a comma-separated list. Default `IoT User,offline_access` 
- `V2M_BASE_URL` (optional): Override the Viessmann API base URL. Default `https://api.viessmann-climatesolutions.com`
- `V2M_POLL_INTERVAL` (optional): The polling interval in seconds. Default `60`

### MQTT Configuration

- `V2M_MQTT_URI` (required): The MQTT broker URL, e.g. `mqtt://host:1883` or `mqtts://host:8883` for TLS
- `V2M_MQTT_USERNAME` (optional): Username for MQTT authentication
- `V2M_MQTT_PASSWORD` (optional): Password for MQTT authentication
- `V2M_MQTT_CLIENT_ID` (optional): MQTT client identifier. Default: `viessmann2mqtt`
- `V2M_MQTT_TOPIC` (optional): Topic prefix where data should be published. Default: `viessmann`
- `V2M_MQTT_RETAIN` (optional): Retain MQTT messages. Default: `false`
- `V2M_MQTT_DISCOVERY` (optional): Enable Home Assistant device discovery. Default: `true`
- `V2M_MQTT_COMMANDS` (optional): Enable MQTT command subscription for device control. Default: `true`
- `V2M_VERBOSE` (optional): Set to `true` for more detailed logs. Default: `false`

## MQTT Topics

### Data Publication

Device features are published to topics following this pattern:
```
{TOPIC}/installations/{INSTALLATION_ID}/gateways/{GATEWAY_SERIAL}/devices/{DEVICE_ID}/features/{FEATURE_PATH}
```

Example:
```
viessmann/installations/12345/gateways/ABC123/devices/0/features/heating.circuits.0.operating.programs.comfort
```

Each message contains:
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "properties": {
    "temperature": {
      "value": 21.5,
      "unit": "celsius"
    }
  }
}
```

### Home Assistant Discovery

When `V2M_MQTT_DISCOVERY=true` (default), device discovery configurations are published to:
```
homeassistant/device/{DEVICE_ID}/config
```

These configurations automatically create entities in Home Assistant for:
- Climate controls
- Sensors (temperature, pressure, etc.)
- Switches and buttons
- Number inputs for setpoints
- Select entities for modes and programs

The device identifiers match the ViCare integration format (`{gateway_serial}_{device_serial}`) for compatibility.

### Command Execution

When `V2M_MQTT_COMMANDS=true` (default), commands can be sent to devices via MQTT:

**Topic Pattern:**
```
{TOPIC}/installations/{INSTALLATION_ID}/gateways/{GATEWAY_SERIAL}/devices/{DEVICE_ID}/features/{FEATURE_PATH}/commands/{COMMAND_NAME}/set
```

**Example - Set Temperature:**
```bash
mosquitto_pub -h mqtt-broker \
  -t "viessmann/installations/12345/gateways/ABC123/devices/0/features/heating.circuits.0.operating.programs.comfort/commands/setTemperature/set" \
  -m '{"temperature": 22.0}'
```

**Example - Set Mode (single parameter):**
```bash
mosquitto_pub -h mqtt-broker \
  -t "viessmann/installations/12345/gateways/ABC123/devices/0/features/heating.circuits.0.operating.modes.active/commands/setMode/set" \
  -m "standby"
```

**Command Payload Formats:**
- Single parameter commands: Can send the value directly (string/number/boolean) or as JSON object
- Multi-parameter commands: Must send JSON object with parameter names as keys
- Values are validated against command constraints (min/max, enum values, stepping)

## Supported Device Types

The application automatically detects and supports:

- **Heating Devices**: Generic heating systems
- **Gas Boilers**: Vitodens, Vitocrossal, Vitopend series
- **Heat Pumps**: Vitocal series, VBC70, V200WO1A, CU401B
- **Fuel Cells**: Vitovalor, Vitocharge, Vitoblo series
- **Hybrid Systems**: Systems with both boiler and heat pump roles

Device types are detected based on device roles and model identifiers.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Lint
npm run lint

# Fix linting issues
npm run lint:fix
```

## Contributing

Contributions are welcome! This project follows standard open-source contribution practices.

### Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/viessmann2mqtt.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Install dependencies: `npm install`

### Development Workflow

1. **Make your changes** - Write code following the existing patterns
2. **Run tests** - Ensure all tests pass: `npm test`
3. **Check linting** - Fix any linting issues: `npm run lint:fix`
4. **Test manually** - Verify your changes work as expected
5. **Commit** - Write clear, descriptive commit messages
6. **Push** - Push to your fork: `git push origin feature/your-feature-name`
7. **Create PR** - Open a pull request against the `main` branch

### Code Style

- Follow the existing code style and patterns
- Use TypeScript for type safety
- Run `npm run lint:fix` before committing to auto-fix formatting issues
- Ensure `npm run lint` passes without errors
- Use meaningful variable and function names
- Add comments for complex logic

### Testing

- Write tests for new features and bug fixes
- Ensure all existing tests pass: `npm test`
- Use the test UI for debugging: `npm run test:ui`
- Tests are located in `src/**/__tests__/` directories
- Follow the existing test patterns and use the test helpers

### Pull Request Guidelines

- **Title**: Use a clear, descriptive title
- **Description**: Explain what changes you made and why
- **Testing**: Describe how you tested your changes
- **Breaking Changes**: Clearly mark any breaking changes
- **Related Issues**: Reference any related issues using `#issue-number`

### Project Structure

- `src/app.ts` - Main application entry point
- `src/api.ts` - Viessmann API client
- `src/config.ts` - Configuration management
- `src/commands.ts` - MQTT command subscription handler
- `src/publish.ts` - MQTT publisher
- `src/devices/` - Device-specific implementations
  - `base.ts` - Base device class
  - `factory.ts` - Device factory for auto-detection
  - `discovery.ts` - Device discovery decorators
  - `homeassistant.ts` - Home Assistant discovery generation
  - `heating.ts`, `gaz-boiler.ts`, `heat-pump.ts`, `fuel-cell.ts`, `hybrid.ts` - Device type implementations
- `src/devices/__tests__/` - Test files

### Adding New Device Types

1. Create a new device class extending `Device` in `src/devices/`
2. Add discovery methods using the `@discover` decorator
3. Register the device type in `DeviceFactory.createDevice()`
4. Add tests in `src/devices/__tests__/`
5. Update this README's "Supported Device Types" section

### Reporting Issues

When reporting issues, please include:
- Description of the problem
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (Node version, OS, etc.)
- Relevant logs (use `V2M_VERBOSE=true` for detailed logs)

### Questions?

Feel free to open an issue for questions or discussions about potential features.

## License

MIT