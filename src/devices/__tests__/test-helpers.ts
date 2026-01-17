import { readFileSync } from "fs";
import { join } from "path";
import { Feature } from "../../models.js";

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
 * Load test fixture data for testing.
 * Uses generic test data instead of personal diagnostics to make tests independent.
 * The fixture contains anonymized test data with generic identifiers.
 */
export function loadAnonymizedDiagnosticsData(): RawDiagnosticsData {
  const fixtureData = JSON.parse(
    readFileSync(join(process.cwd(), "src/devices/__tests__/fixtures/test-device-features.json"), "utf-8"),
  ) as RawDiagnosticsData;

  // Return fixture data directly - it's already anonymized with test values
  return fixtureData;
}
