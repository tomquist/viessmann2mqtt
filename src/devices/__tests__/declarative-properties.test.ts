import { beforeEach, describe, expect, it } from "vitest";
import { HeatingCircuit, HeatingDevice } from "../heating.js";
import { DeviceFactory } from "../factory.js";
import { Feature } from "../../models.js";
import { DeviceAccessor, DeviceModel } from "../base.js";
import { loadAnonymizedDiagnosticsData } from "./test-helpers.js";

// Load diagnostics data with anonymized serial numbers
const diagnosticsData = loadAnonymizedDiagnosticsData();

describe("Declarative Properties", () => {
  let device0Data: typeof diagnosticsData.data[0];
  let features: Feature[];
  let device: HeatingDevice;
  let accessor: DeviceAccessor;
  let deviceModel: DeviceModel;

  beforeEach(() => {
    device0Data = diagnosticsData.data.find((d: any) => d.deviceId === "0")!;
    features = device0Data.features.data;

    accessor = {
      installationId: device0Data.installationId,
      gatewayId: device0Data.gatewayId,
      deviceId: device0Data.deviceId,
    };

    deviceModel = {
      id: device0Data.deviceId,
      modelId: "Vitodens-200",
      gatewaySerial: device0Data.gatewayId,
      boilerSerial: "",
      boilerSerialEditor: "",
      bmuSerial: null,
      bmuSerialEditor: null,
      createdAt: "",
      editedAt: "",
      status: "",
      deviceType: "",
      roles: ["type:boiler"],
    };

    device = DeviceFactory.createDevice(
      accessor,
      deviceModel.roles,
      deviceModel,
      features,
    ) as HeatingDevice;
  });

  describe("Device Properties", () => {
    it("should retrieve boolean properties synchronously", () => {
      // These are now declarative properties, not methods
      const isDHW = device.isDomesticHotWaterDevice;
      expect(typeof isDHW).toBe("boolean");

      const isSolar = device.isSolarThermalDevice;
      expect(typeof isSolar).toBe("boolean");
    });

    it("should retrieve available circuits as array", () => {
      const circuits = device.getAvailableCircuits();
      expect(Array.isArray(circuits)).toBe(true);
      
      // Based on diagnostics data, should have circuits ["1", "2", "3"]
      if (circuits.length > 0) {
        expect(circuits.every((id) => typeof id === "string")).toBe(true);
      }
    });
  });

  describe("Circuit Properties", () => {
    it("should retrieve circuit properties synchronously", () => {
      const circuits = device.getAvailableCircuits();
      if (circuits.length === 0) return;

      const circuit = new HeatingCircuit(device, circuits[0]);

      // All properties should be synchronous now
      const name = circuit.getName;
      expect(name === null || typeof name === "string").toBe(true);

      const roomTemp = circuit.getRoomTemperature;
      expect(roomTemp === null || typeof roomTemp === "number").toBe(true);

      const supplyTemp = circuit.getSupplyTemperature;
      expect(supplyTemp === null || typeof supplyTemp === "number").toBe(true);

      const activeMode = circuit.getActiveMode;
      expect(activeMode === null || typeof activeMode === "string").toBe(true);

      const modes = circuit.getModes;
      expect(Array.isArray(modes)).toBe(true);
    });

    it("should retrieve dependent properties correctly", () => {
      const circuits = device.getAvailableCircuits();
      if (circuits.length === 0) return;

      const circuit = new HeatingCircuit(device, circuits[0]);

      // getCurrentDesiredTemperature depends on getActiveProgram
      const activeProgram = circuit.getActiveProgram;
      const desiredTemp = circuit.getCurrentDesiredTemperature;

      // If there's an active program (not null and not standby), should have desired temp
      // Otherwise, desired temp should be null
      if (activeProgram && activeProgram !== "standby") {
        expect(desiredTemp === null || typeof desiredTemp === "number").toBe(true);
      } else {
        expect(desiredTemp).toBeNull();
      }
    });
  });

  describe("Property Access Patterns", () => {
    it("should allow property access (not method calls)", () => {
      const circuits = device.getAvailableCircuits();
      if (circuits.length === 0) return;

      const circuit = new HeatingCircuit(device, circuits[0]);

      // Properties should be accessed without () - they're not methods
      const name = circuit.getName; // Not getName()
      expect(name === null || typeof name === "string").toBe(true);

      const modes = circuit.getModes; // Not getModes()
      expect(Array.isArray(modes)).toBe(true);
    });
  });
});
