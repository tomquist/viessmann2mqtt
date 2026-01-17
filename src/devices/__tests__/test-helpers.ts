import { readFileSync } from "fs";
import { join } from "path";

/**
 * Load diagnostics data and anonymize serial numbers for testing.
 * This prevents exposing personal serial numbers in test files.
 */
export function loadAnonymizedDiagnosticsData() {
  const rawDiagnosticsData = JSON.parse(
    readFileSync(join(process.cwd(), "api/features_diagnostics.json"), "utf-8"),
  );

  // Anonymize serial numbers for testing
  return {
    ...rawDiagnosticsData,
    data: rawDiagnosticsData.data.map((device: any) => ({
      ...device,
      installationId: 1234567, // Anonymized
      gatewayId: "TEST_GATEWAY_1234567890", // Anonymized
      features: {
        ...device.features,
        data: device.features.data.map((feature: any) => ({
          ...feature,
          gatewayId: "TEST_GATEWAY_1234567890", // Anonymized
          uri: feature.uri?.replace(
            /installations\/\d+\/gateways\/[^/]+/,
            "installations/1234567/gateways/TEST_GATEWAY_1234567890",
          ),
          commands: Object.fromEntries(
            Object.entries(feature.commands || {}).map(([key, cmd]: [string, any]) => [
              key,
              {
                ...cmd,
                uri: cmd.uri?.replace(
                  /installations\/\d+\/gateways\/[^/]+/,
                  "installations/1234567/gateways/TEST_GATEWAY_1234567890",
                ),
              },
            ]),
          ),
        })),
      },
    })),
  };
}
