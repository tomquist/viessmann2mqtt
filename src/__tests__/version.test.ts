import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAppVersion } from "../version.js";

describe("resolveAppVersion", () => {
  beforeEach(() => {
    delete process.env.V2M_APP_VERSION;
  });

  afterEach(() => {
    delete process.env.V2M_APP_VERSION;
  });

  it("prefers V2M_APP_VERSION when set", () => {
    process.env.V2M_APP_VERSION = "  9.9.9+abc1234  ";
    expect(resolveAppVersion()).toBe("9.9.9+abc1234");
  });

  it("matches package.json when V2M_APP_VERSION is unset", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf-8"),
    ) as { version: string };
    expect(resolveAppVersion()).toBe(pkg.version);
  });
});
