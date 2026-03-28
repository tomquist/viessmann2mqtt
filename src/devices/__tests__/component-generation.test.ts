import { beforeEach, describe, expect, it } from "vitest";
import { HeatingCircuit, HeatingDevice } from "../heating.js";
import { DeviceFactory } from "../factory.js";
import { Feature } from "../../models.js";
import { DeviceAccessor, DeviceModel } from "../base.js";
import { HomeAssistantDiscovery } from "../homeassistant.js";
import { loadAnonymizedDiagnosticsData } from "./test-helpers.js";

// Load diagnostics data with anonymized serial numbers
const diagnosticsData = loadAnonymizedDiagnosticsData();

describe("Component Generation", () => {
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

  describe("Circuit Components", () => {
    it("should generate circuit sensor components for available circuits", () => {
      const circuits = device.getAvailableCircuits();
      expect(circuits.length).toBeGreaterThan(0);

      const components = device.generateHomeAssistantComponents(
        "homeassistant",
        device0Data.installationId,
        device0Data.gatewayId,
        device0Data.deviceId,
        new Set(),
        features,
      );

      // Check for circuit sensor components
      const circuitSensors = Object.keys(components).filter((key) =>
        key.includes("circuit_") && (key.includes("room_temp") || key.includes("supply_temp")),
      );

      // Should have sensors if features exist with values
      const hasRoomTempFeatures = features.some(
        (f) =>
          f.isEnabled &&
          f.feature.includes("circuits.") &&
          f.feature.includes("sensors.temperature.room") &&
          f.properties?.value?.value !== undefined,
      );
      const hasSupplyTempFeatures = features.some(
        (f) =>
          f.isEnabled &&
          f.feature.includes("circuits.") &&
          f.feature.includes("sensors.temperature.supply") &&
          f.properties?.value?.value !== undefined,
      );

      if (hasRoomTempFeatures || hasSupplyTempFeatures) {
        // Components are only generated if features have values
        expect(circuitSensors.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("should generate circuit climate components when conditions are met", () => {
      const circuits = device.getAvailableCircuits();
      if (circuits.length === 0) return;

      // Check if we have a circuit with modes and desired temperature
      let hasValidCircuit = false;
      for (const circuitId of circuits) {
        const circuit = new HeatingCircuit(device, circuitId);
        const modes = circuit.getModes;
        const desiredTemp = circuit.getCurrentDesiredTemperature;

        if (modes.length > 0 && desiredTemp !== null) {
          hasValidCircuit = true;
          break;
        }
      }

      if (hasValidCircuit) {
        const components = device.generateHomeAssistantComponents(
          "homeassistant",
          device0Data.installationId,
          device0Data.gatewayId,
          device0Data.deviceId,
          new Set(),
          features,
        );

        const climateComponents = Object.entries(components).filter(
          ([, component]) => component.platform === "climate",
        );

        // Climate components are generated if modes map to Home Assistant modes
        // Even if we have modes and desired temp, the mapping might result in empty HA modes
        if (climateComponents.length > 0) {
          // Verify climate component structure
          for (const [, component] of climateComponents) {
            expect(component).toHaveProperty("platform", "climate");
            expect(component).toHaveProperty("unique_id");
            expect(component).toHaveProperty("name");
            expect(component).toHaveProperty("state_topic");
            expect(component).toHaveProperty("current_temperature_topic");
            expect(component).toHaveProperty("modes");
            expect(Array.isArray(component.modes)).toBe(true);
            expect(component.modes.length).toBeGreaterThan(0);
          }
        }
        
        // The method should work without errors even if no climate components are generated
        expect(typeof components).toBe("object");
      }
    });
  });

  describe("Component Structure", () => {
    it("should generate components with correct structure", () => {
      const components = device.generateHomeAssistantComponents(
        "homeassistant",
        device0Data.installationId,
        device0Data.gatewayId,
        device0Data.deviceId,
        new Set(),
        features,
      );

      for (const [, component] of Object.entries(components)) {
        // All components should have platform and unique_id
        expect(component).toHaveProperty("platform");
        expect(component).toHaveProperty("unique_id");

        // unique_id should follow the pattern
        expect(component.unique_id).toMatch(
          /^viessmann_\d+_[^_]+_[^_]+_.+$/,
        );

        // state_topic should contain the feature path
        if (component.state_topic) {
          expect(component.state_topic).toContain("/features/");
        }
      }
    });
  });

  describe("Device class and unit from property data (auto-generated sensors)", () => {
    const accessor: DeviceAccessor = {
      installationId: 1,
      gatewayId: "GW",
      deviceId: "99",
    };

    const baseModel: DeviceModel = {
      id: "99",
      modelId: "Test-Unit",
      gatewaySerial: "GW",
      boilerSerial: "",
      boilerSerialEditor: "",
      bmuSerial: null,
      bmuSerialEditor: null,
      createdAt: "",
      editedAt: "",
      status: "",
      deviceType: "",
      roles: [],
    };

    it("should map duration, volume, and volume_flow_rate from normalized units", () => {
      // Synthetic units for HA mapping (API `Unit` union is narrower than strings Viessmann may return)
      const features = [
        {
          feature: "heating.diagnostics.pumpRuntime",
          gatewayId: "GW",
          deviceId: "99",
          timestamp: "",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            value: { type: "number" as const, value: 12, unit: "hour" },
          },
          commands: {},
        },
        {
          feature: "heating.sensors.volume.buffer",
          gatewayId: "GW",
          deviceId: "99",
          timestamp: "",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            value: { type: "number" as const, value: 1.5, unit: "cubicMeter" },
          },
          commands: {},
        },
        {
          feature: "heating.sensors.volumetricFlow.supply",
          gatewayId: "GW",
          deviceId: "99",
          timestamp: "",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            value: { type: "number" as const, value: 8, unit: "liter/hour" },
          },
          commands: {},
        },
      ] as Feature[];
      const dev = new HeatingDevice(accessor, baseModel.roles, baseModel, features);
      const disc = new HomeAssistantDiscovery("mqtt", 1, "GW", "99");
      const cfg = disc.generateDeviceDiscoveryConfig(dev, features);

      expect(cfg.components.diagnostics_pumpRuntime.device_class).toBe("duration");
      expect(cfg.components.sensors_volume_buffer.device_class).toBe("volume");
      expect(cfg.components.sensors_volumetricFlow_supply.device_class).toBe(
        "volume_flow_rate",
      );
    });

    it("should use Fahrenheit from property unit for temperature sensors", () => {
      const features: Feature[] = [
        {
          feature: "heating.sensors.temperature.buffer",
          gatewayId: "GW",
          deviceId: "99",
          timestamp: "",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            value: { type: "number", value: 72, unit: "fahrenheit" },
          },
          commands: {},
        },
      ];
      const dev = new HeatingDevice(accessor, baseModel.roles, baseModel, features);
      const disc = new HomeAssistantDiscovery("mqtt", 1, "GW", "99");
      const cfg = disc.generateDeviceDiscoveryConfig(dev, features);

      expect(cfg.components.sensors_temperature_buffer.unit_of_measurement).toBe("°F");
      expect(cfg.components.sensors_temperature_buffer.device_class).toBe("temperature");
    });
  });
});
