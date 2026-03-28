import { describe, expect, it } from "vitest";
import {
  getCommandParamDefaultFromFeature,
  mergeMultiParamPayloadFromFeature,
} from "../commands.js";
import { Command, Feature } from "../models.js";

describe("multi-param command payload merge", () => {
  const setCurveCommand: Command = {
    uri: "",
    name: "setCurve",
    isExecutable: true,
    params: {
      slope: {
        type: "number",
        required: true,
        constraints: { min: 0.2, max: 3.5, stepping: 0.1 },
      },
      shift: {
        type: "number",
        required: true,
        constraints: { min: -13, max: 40, stepping: 1 },
      },
    },
  };

  const feature = {
    feature: "heating.circuits.0.heating.curve",
    gatewayId: "gw",
    deviceId: "0",
    timestamp: "",
    isEnabled: true,
    isReady: true,
    apiVersion: 1,
    uri: "",
    properties: {
      slope: { type: "number" as const, value: 1.5, unit: "dimensionless" },
      shift: { type: "number" as const, value: 8, unit: "kelvin" },
    },
    commands: { setCurve: setCurveCommand },
  } as unknown as Feature;

  it("fills missing required param from feature properties (partial HA payload)", () => {
    const merged = mergeMultiParamPayloadFromFeature(setCurveCommand, { slope: 1.2 }, feature);
    expect(merged).toEqual({ slope: 1.2, shift: 8 });
  });

  it("leaves complete payload unchanged", () => {
    const merged = mergeMultiParamPayloadFromFeature(
      setCurveCommand,
      { slope: 1.2, shift: 5 },
      feature,
    );
    expect(merged).toEqual({ slope: 1.2, shift: 5 });
  });

  it("getCommandParamDefaultFromFeature reads property value", () => {
    expect(getCommandParamDefaultFromFeature(feature, "shift")).toBe(8);
    expect(getCommandParamDefaultFromFeature(feature, "slope")).toBe(1.5);
  });
});
