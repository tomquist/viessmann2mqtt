import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Optional override for reported software version (Home Assistant `origin.sw_version`, etc.).
 * Set at runtime or at image build time, e.g. `1.2.3+abc1234` from package version + git short hash.
 *
 * @see Dockerfile — `ARG` / `ENV V2M_APP_VERSION`
 */
const ENV_APP_VERSION = "V2M_APP_VERSION";

let cachedPackageJsonVersion: string | undefined;

function readPackageJsonVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const projectRoot = join(here, "..");
    const raw = readFileSync(join(projectRoot, "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { version?: string };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // Missing file (e.g. minimal container image) or invalid JSON
  }
  return "unknown";
}

/**
 * Application version string for discovery and diagnostics.
 * Prefer `process.env.V2M_APP_VERSION` when set (e.g. Docker build injecting version + git hash);
 * otherwise reads `version` from `package.json` next to the compiled output (dev / full installs).
 */
export function resolveAppVersion(): string {
  const fromEnv = process.env[ENV_APP_VERSION]?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (cachedPackageJsonVersion === undefined) {
    cachedPackageJsonVersion = readPackageJsonVersion();
  }
  return cachedPackageJsonVersion;
}
