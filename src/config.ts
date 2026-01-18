function stringEnvVar(envVarName: keyof typeof process["env"]): string;
function stringEnvVar(
  envVarName: keyof typeof process["env"],
  defaultValue: string
): string;

function stringEnvVar(
  envVarName: keyof typeof process["env"],
  defaultValue: null
): string | undefined;
function stringEnvVar(
  envVarName: keyof typeof process["env"],
  defaultValue?: string | null,
): string | undefined {
  const value = process.env[envVarName];
  if (value == null && defaultValue === undefined) {
    console.error(`Missing env var ${envVarName}`);
    process.exit(1);
  }
  return value ?? defaultValue ?? undefined;
}
function intEnvVar(
  envVarName: keyof typeof process["env"],
  defaultValue?: number,
): number {
  if (defaultValue != null) {
    const value = stringEnvVar(envVarName, null);
    if (value == null) {
      return defaultValue;
    }
    return parseInt(value, 10);
  } else {
    const value = stringEnvVar(envVarName);
    return parseInt(value, 10);
  }
}
function boolEnvVar(
  envVarName: keyof typeof process["env"],
  defaultValue = false,
): boolean {
  const value = stringEnvVar(envVarName, null);
  if (value == null) {
    return defaultValue;
  }
  return value === "true";
}

function arrayEnvVar(
  envVarName: keyof typeof process["env"],
  defaultValue?: string[],
): string[] {
  if (defaultValue != null) {
    const value = stringEnvVar(envVarName, null);
    if (value == null) {
      return defaultValue;
    }
    return value.split(",");
  } else {
    const value = stringEnvVar(envVarName);
    return value.split(",");
  }
}
export function getConfig() {
  return {
    username: stringEnvVar("V2M_USERNAME"),
    password: stringEnvVar("V2M_PASSWORD"),
    clientId: stringEnvVar("V2M_CLIENT_ID"),
    clientSecret: stringEnvVar("V2M_CLIENT_SECRET", null),
    accessTokenUri: stringEnvVar("V2M_ACCESS_TOKEN_URI", null),
    authorizationUri: stringEnvVar("V2M_AUTHORIZATION_URI", null),
    redirectUri: stringEnvVar(
      "V2M_REDIRECT_URI",
      "vicare://oauth-callback/everest",
    ),
    scopes: arrayEnvVar("V2M_SCOPES", ["IoT User", "offline_access"]),
    baseUrl: stringEnvVar("V2M_BASE_URL", null),
    pollInterval: intEnvVar("V2M_POLL_INTERVAL", 60),
    mqttUrl: stringEnvVar("V2M_MQTT_URI"),
    mqttClientId: stringEnvVar("V2M_MQTT_CLIENT_ID", "viessmann2mqtt"),
    mqttUsername: stringEnvVar("V2M_MQTT_USERNAME", null),
    mqttPassword: stringEnvVar("V2M_MQTT_PASSWORD", null),
    mqttRetain: boolEnvVar("V2M_MQTT_RETAIN"),
    mqttTopic: stringEnvVar("V2M_MQTT_TOPIC", "viessmann"),
    mqttDiscovery: boolEnvVar("V2M_MQTT_DISCOVERY", true),
    mqttCommands: boolEnvVar("V2M_MQTT_COMMANDS", true),
    verbose: boolEnvVar("V2M_VERBOSE", false),
  };
}

export function anonymizeConfig(
  config: ReturnType<typeof getConfig>,
): ReturnType<typeof getConfig> {
  const newConfig = { ...config };
  const hideKeys: Array<keyof ReturnType<typeof getConfig>> = [
    "password",
    "mqttPassword",
    "clientSecret",
  ];
  for (const key of hideKeys) {
    if (config[key] != null) {
      (newConfig as any)[key] = "***";
    }
  }
  return newConfig;
}
