import { readFileSync } from "fs";
import { join } from "path";
import { Command, Feature } from "../../models.js";

interface RawDiagnosticsDevice {
  deviceId: string;
  installationId: number;
  gatewayId: string;
  boilerSerial?: string;
  features: {
    data: Feature[];
  };
  [key: string]: unknown;
}

interface RawDiagnosticsData {
  fetchedAt: string;
  data: RawDiagnosticsDevice[];
}

/**
 * Load diagnostics data and anonymize serial numbers for testing.
 * This prevents exposing personal serial numbers in test files.
 */
export function loadAnonymizedDiagnosticsData(): RawDiagnosticsData {
  const rawDiagnosticsData = JSON.parse(
    readFileSync(join(process.cwd(), "api/features_diagnostics.json"), "utf-8"),
  ) as RawDiagnosticsData;

  // Anonymize serial numbers for testing
  return {
    ...rawDiagnosticsData,
    data: rawDiagnosticsData.data.map((device: RawDiagnosticsDevice) => ({
      ...device,
      installationId: 1234567, // Anonymized
      gatewayId: "TEST_GATEWAY_1234567890", // Anonymized
      boilerSerial: "TEST_DEVICE_SERIAL_123", // Anonymized device serial
      features: {
        ...device.features,
        data: device.features.data.map((feature: Feature) => {
          const anonymizedFeature: Feature = {
            ...feature,
            gatewayId: "TEST_GATEWAY_1234567890", // Anonymized
            deviceId: feature.deviceId,
            uri: feature.uri.replace(
              /installations\/\d+\/gateways\/[^/]+/,
              "installations/1234567/gateways/TEST_GATEWAY_1234567890",
            ),
            commands: Object.fromEntries(
              Object.entries(feature.commands || {}).map(([key, cmd]) => {
                const command = cmd;
                return [
                  key,
                  {
                    ...command,
                    uri: command.uri.replace(
                      /installations\/\d+\/gateways\/[^/]+/,
                      "installations/1234567/gateways/TEST_GATEWAY_1234567890",
                    ),
                  },
                ];
              }),
            ) as Record<string, Command>,
          };

          // Anonymize device serial numbers in feature properties
          // Check if this is a device.serial feature and anonymize the value
          if (feature.feature === "device.serial" && feature.properties?.value && "value" in feature.properties.value && "type" in feature.properties.value) {
            anonymizedFeature.properties = {
              ...feature.properties,
              value: {
                type: "string" as const,
                value: "TEST_DEVICE_SERIAL_123", // Anonymized device serial
              },
            };
          }

          return anonymizedFeature;
        }),
      },
    })),
  };
}
