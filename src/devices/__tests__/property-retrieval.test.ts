import { beforeEach, describe, expect, it } from "vitest";
import { HeatingDevice } from "../heating.js";
import { DeviceFactory } from "../factory.js";
import { Feature } from "../../models.js";
import { DeviceAccessor, DeviceModel } from "../base.js";
import { loadAnonymizedDiagnosticsData } from "./test-helpers.js";

// Load diagnostics data with anonymized serial numbers
const diagnosticsData = loadAnonymizedDiagnosticsData();

describe("Property Retrieval", () => {
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

  describe("Declarative Properties", () => {
    it("should retrieve boolean properties synchronously", () => {
      const isDHW = device.isDomesticHotWaterDevice;
      expect(typeof isDHW).toBe("boolean");

      const isSolar = device.isSolarThermalDevice;
      expect(typeof isSolar).toBe("boolean");
    });

    it("should retrieve circuit properties synchronously", async () => {
      const circuits = device.getAvailableCircuits();
      expect(Array.isArray(circuits)).toBe(true);

      if (circuits.length > 0) {
        const { HeatingCircuit } = await import("../heating.js");
        const circuit = new HeatingCircuit(device, circuits[0]);

        // All these should be synchronous properties now
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

        const activeProgram = circuit.getActiveProgram;
        expect(activeProgram === null || typeof activeProgram === "string").toBe(true);

        const desiredTemp = circuit.getCurrentDesiredTemperature;
        expect(desiredTemp === null || typeof desiredTemp === "number").toBe(true);
      }
    });
  });
});
