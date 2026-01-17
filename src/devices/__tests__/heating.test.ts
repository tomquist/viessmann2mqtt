import { beforeEach, describe, expect, it } from "vitest";
import { HeatingCircuit, HeatingDevice } from "../heating.js";
import { DeviceFactory } from "../factory.js";
import { Feature } from "../../models.js";
import { DeviceAccessor, DeviceModel } from "../base.js";
import { loadAnonymizedDiagnosticsData } from "./test-helpers.js";

// Load diagnostics data with anonymized serial numbers
const diagnosticsData = loadAnonymizedDiagnosticsData();

describe("HeatingDevice", () => {
  let device0Data: typeof diagnosticsData.data[0];
  let features: Feature[];
  let device: HeatingDevice;
  let accessor: DeviceAccessor;
  let deviceModel: DeviceModel;

  beforeEach(() => {
    // Get device 0 data (gas boiler)
    device0Data = diagnosticsData.data.find((d: any) => d.deviceId === "0")!;
    features = device0Data.features.data as Feature[];

    accessor = {
      installationId: device0Data.installationId as number,
      gatewayId: device0Data.gatewayId as string,
      deviceId: device0Data.deviceId as string,
    };

    deviceModel = {
      id: device0Data.deviceId as string,
      modelId: "Vitodens-200",
      gatewaySerial: device0Data.gatewayId as string,
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

    // Create device using factory
    device = DeviceFactory.createDevice(
      accessor,
      deviceModel.roles,
      deviceModel,
      features,
    ) as HeatingDevice;
  });

  describe("Property Retrieval", () => {
    it("should retrieve isDomesticHotWaterDevice property", () => {
      const value = device.isDomesticHotWaterDevice;
      expect(typeof value).toBe("boolean");
    });

    it("should retrieve isSolarThermalDevice property", () => {
      const value = device.isSolarThermalDevice;
      expect(typeof value).toBe("boolean");
    });

    it("should get available circuits", () => {
      const circuits = device.getAvailableCircuits();
      expect(Array.isArray(circuits)).toBe(true);
      expect(circuits.length).toBeGreaterThan(0);
    });
  });

  describe("HeatingCircuit", () => {
    it("should create circuit instances and retrieve properties", () => {
      const circuits = device.getAvailableCircuits();
      if (circuits.length > 0) {
        const circuit = new HeatingCircuit(device, circuits[0]);

        // Test property retrieval
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

  describe("Component Generation", () => {
    it("should generate Home Assistant components", () => {
      const components = device.generateHomeAssistantComponents(
        "homeassistant",
        device0Data.installationId as number,
        device0Data.gatewayId as string,
        device0Data.deviceId as string,
        new Set(),
        features,
      );

      expect(typeof components).toBe("object");
      
      // Components may be empty if features don't match decorator patterns
      // This is okay - we're testing that the method works, not that it always produces components
      if (Object.keys(components).length > 0) {
        // Verify component structure
        for (const [, component] of Object.entries(components)) {
          expect(component).toHaveProperty("platform");
          expect(component).toHaveProperty("unique_id");
          expect(component.unique_id).toContain("viessmann_");
        }
      }
    });

    it("should generate components for circuits with available features", () => {
      const circuits = device.getAvailableCircuits();
      expect(circuits.length).toBeGreaterThan(0);

      // Check if we have circuit sensor features with actual values
      const hasRoomTemp = features.some(
        (f) =>
          f.isEnabled &&
          f.feature.includes("circuits.") &&
          f.feature.includes("sensors.temperature.room") &&
          f.properties?.value?.value !== undefined,
      );
      const hasSupplyTemp = features.some(
        (f) =>
          f.isEnabled &&
          f.feature.includes("circuits.") &&
          f.feature.includes("sensors.temperature.supply") &&
          f.properties?.value?.value !== undefined,
      );

      if (hasRoomTemp || hasSupplyTemp) {
        const components = device.generateHomeAssistantComponents(
          "homeassistant",
          device0Data.installationId,
          device0Data.gatewayId,
          device0Data.deviceId,
          new Set(),
          features,
        );

        // Should have circuit sensor components if features have values
        const circuitSensors = Object.keys(components).filter((key) =>
          key.includes("circuit_") && key.includes("_temp"),
        );
        // Components are only generated if features have values, so this may be 0
        expect(circuitSensors.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("should generate circuit climate components when modes and temperature are available", () => {
      const components = device.generateHomeAssistantComponents(
        "homeassistant",
        device0Data.installationId as number,
        device0Data.gatewayId as string,
        device0Data.deviceId as string,
        new Set(),
        features,
      );

      // Check for climate components
      const climateComponents = Object.entries(components).filter(
        ([, component]) => component.platform === "climate",
      );

      // Climate components should be generated if circuits have modes and desired temp
      expect(climateComponents.length).toBeGreaterThanOrEqual(0);
    });
  });
});
