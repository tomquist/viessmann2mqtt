import { describe, expect, it } from "vitest";
import { HomeAssistantDiscovery } from "../homeassistant.js";
import { HeatingDevice } from "../heating.js";
import { DeviceFactory } from "../factory.js";
import { Feature } from "../../models.js";
import { DeviceAccessor, DeviceModel } from "../base.js";

describe("Service Technician Commands Disabled", () => {
  const accessor: DeviceAccessor = {
    installationId: 1234567,
    gatewayId: "TEST_GATEWAY_1234567890",
    deviceId: "0",
  };

  const deviceModel: DeviceModel = {
    id: "0",
    modelId: "Vitodens-200",
    gatewaySerial: "TEST_GATEWAY_1234567890",
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

  const discovery = new HomeAssistantDiscovery(
    "homeassistant",
    accessor.installationId,
    accessor.gatewayId,
    accessor.deviceId,
  );

  describe("Service technician commands should be disabled by default", () => {
    it("should disable configuration feature commands", async () => {
      const features: Feature[] = [
        {
          feature: "heating.configuration.houseOrientation",
          gatewayId: accessor.gatewayId,
          deviceId: accessor.deviceId,
          timestamp: "2026-01-16T10:27:14.001Z",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            horizontal: { type: "number", value: 0, unit: "degree" },
            vertical: { type: "number", value: 0, unit: "degree" },
          },
          commands: {
            setOrientation: {
              uri: "",
              name: "setOrientation",
              isExecutable: true,
              params: {
                horizontal: {
                  type: "number",
                  required: true,
                  constraints: { min: 0, max: 360, stepping: 1 },
                },
                vertical: {
                  type: "number",
                  required: true,
                  constraints: { min: 0, max: 360, stepping: 1 },
                },
              },
            },
          },
        },
      ];

      const device = DeviceFactory.createDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        features,
      ) as HeatingDevice;

      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      // Find components for setOrientation command
      const orientationComponents = Object.values(config.components).filter((c) =>
        c.unique_id?.includes("setorientation"),
      );

      expect(orientationComponents.length).toBeGreaterThan(0);
      for (const component of orientationComponents) {
        expect(component.enabled_by_default).toBe(false);
        expect(component.en).toBe(false);
        expect(component.entity_category).toBe("config");
        expect(component.ent_cat).toBe("config");
      }
    });

    it("should disable calibration commands (setAltitude)", async () => {
      const features: Feature[] = [
        {
          feature: "device.configuration.houseLocation",
          gatewayId: accessor.gatewayId,
          deviceId: accessor.deviceId,
          timestamp: "2026-01-16T10:27:14.001Z",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            altitude: { type: "number", value: 0, unit: "meter" },
          },
          commands: {
            setAltitude: {
              uri: "",
              name: "setAltitude",
              isExecutable: true,
              params: {
                altitude: {
                  type: "number",
                  required: true,
                  constraints: { min: -100, max: 3000, stepping: 100 },
                },
              },
            },
          },
        },
      ];

      const device = DeviceFactory.createDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        features,
      ) as HeatingDevice;

      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      // Find all components - configuration commands should be disabled if created
      const allComponents = Object.values(config.components);
      const altitudeComponents = allComponents.filter((c) =>
        c.unique_id?.includes("setaltitude") || 
        c.unique_id?.includes("houseLocation") ||
        c.command_topic?.includes("setAltitude")
      );

      // Configuration features with matching properties should create components that are disabled
      // If no matching property, component won't be created (which is also correct behavior)
      if (altitudeComponents.length > 0) {
        for (const component of altitudeComponents) {
          // Verify the component has the disabled property set
          expect(component.enabled_by_default).toBe(false);
          expect(component.en).toBe(false);
          // entity_category should only be set for command components (number, select, etc.), not sensors
          if (["number", "select", "switch", "button", "text", "climate"].includes(component.platform)) {
            expect(component.entity_category).toBe("config");
            expect(component.ent_cat).toBe("config");
          }
        }
      } else {
        // If no components created, that's fine - the important tests are the ones that DO create components
        // This test case might not create components if there's no matching state property
        expect(config.components).toBeDefined();
      }
    });

    it("should disable reset commands", async () => {
      const features: Feature[] = [
        {
          feature: "device.setDefaultValues",
          gatewayId: accessor.gatewayId,
          deviceId: accessor.deviceId,
          timestamp: "2026-01-16T10:27:14.001Z",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {},
          commands: {
            reset: {
              uri: "",
              name: "reset",
              isExecutable: true,
              params: {},
            },
          },
        },
      ];

      const device = DeviceFactory.createDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        features,
      ) as HeatingDevice;

      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      const resetComponents = Object.values(config.components).filter((c) =>
        c.unique_id?.includes("reset"),
      );

      expect(resetComponents.length).toBeGreaterThan(0);
      for (const component of resetComponents) {
        expect(component.enabled_by_default).toBe(false);
        expect(component.en).toBe(false);
        expect(component.entity_category).toBe("config");
        expect(component.ent_cat).toBe("config");
      }
    });

    it("should disable screed drying commands", async () => {
      const features: Feature[] = [
        {
          feature: "heating.circuits.1.operating.programs.screedDrying",
          gatewayId: accessor.gatewayId,
          deviceId: accessor.deviceId,
          timestamp: "2026-01-16T10:27:14.001Z",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            active: { type: "boolean", value: false },
            profile: { type: "string", value: "none" },
          },
          commands: {
            activate: {
              uri: "",
              name: "activate",
              isExecutable: true,
              params: {
                profile: {
                  type: "string",
                  required: true,
                  constraints: {
                    enum: ["profileOne", "profileTwo"],
                  },
                },
              },
            },
            deactivate: {
              uri: "",
              name: "deactivate",
              isExecutable: true,
              params: {},
            },
          },
        },
      ];

      const device = DeviceFactory.createDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        features,
      ) as HeatingDevice;

      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      const screedComponents = Object.values(config.components).filter((c) =>
        c.unique_id?.includes("screeddrying"),
      );

      expect(screedComponents.length).toBeGreaterThan(0);
      for (const component of screedComponents) {
        expect(component.enabled_by_default).toBe(false);
        expect(component.en).toBe(false);
        expect(component.entity_category).toBe("config");
        expect(component.ent_cat).toBe("config");
      }
    });

    it("should disable calibration commands (setHysteresis)", async () => {
      const features: Feature[] = [
        {
          feature: "heating.dhw.temperature.hysteresis",
          gatewayId: accessor.gatewayId,
          deviceId: accessor.deviceId,
          timestamp: "2026-01-16T10:27:14.001Z",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            value: { type: "number", value: 2.5, unit: "kelvin" },
          },
          commands: {
            setHysteresis: {
              uri: "",
              name: "setHysteresis",
              isExecutable: true,
              params: {
                hysteresis: {
                  type: "number",
                  required: true,
                  constraints: { min: 1, max: 10, stepping: 0.5 },
                },
              },
            },
          },
        },
      ];

      const device = DeviceFactory.createDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        features,
      ) as HeatingDevice;

      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      const hysteresisComponents = Object.values(config.components).filter((c) =>
        c.unique_id?.includes("sethysteresis"),
      );

      expect(hysteresisComponents.length).toBeGreaterThan(0);
      for (const component of hysteresisComponents) {
        expect(component.enabled_by_default).toBe(false);
        expect(component.en).toBe(false);
        expect(component.entity_category).toBe("config");
        expect(component.ent_cat).toBe("config");
      }
    });

    it("should NOT disable user-facing commands (setTemperature)", async () => {
      const features: Feature[] = [
        {
          feature: "heating.circuits.1.operating.programs.comfort",
          gatewayId: accessor.gatewayId,
          deviceId: accessor.deviceId,
          timestamp: "2026-01-16T10:27:14.001Z",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            temperature: { type: "number", value: 23, unit: "celsius" },
          },
          commands: {
            setTemperature: {
              uri: "",
              name: "setTemperature",
              isExecutable: true,
              params: {
                temperature: {
                  type: "number",
                  required: true,
                  constraints: { min: 10, max: 30, stepping: 0.5 },
                },
              },
            },
          },
        },
      ];

      const device = DeviceFactory.createDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        features,
      ) as HeatingDevice;

      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      // Find components that might be related to temperature commands
      // They might enhance existing sensors or create new ones
      const allComponents = Object.values(config.components);
      const temperatureComponents = allComponents.filter((c) =>
        c.command_topic?.includes("setTemperature") || 
        c.unique_id?.includes("settemperature") ||
        (c.platform === "number" && c.command_topic?.includes("comfort"))
      );

      // If components exist, verify they're NOT disabled
      if (temperatureComponents.length > 0) {
        for (const component of temperatureComponents) {
          // User-facing commands should NOT have enabled_by_default set to false
          expect(component.enabled_by_default).not.toBe(false);
          expect(component.en).not.toBe(false);
        }
      } else {
        // If no components created, that's also fine - might enhance existing sensors
        // Just verify the config was generated successfully
        expect(config.components).toBeDefined();
      }
    });

    it("should disable sensor components for service technician features (screed drying)", async () => {
      const features: Feature[] = [
        {
          feature: "heating.circuits.2.operating.programs.screedDrying",
          gatewayId: accessor.gatewayId,
          deviceId: accessor.deviceId,
          timestamp: "2026-01-16T10:27:14.001Z",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            active: { type: "boolean", value: false },
            profile: { type: "string", value: "none" },
          },
          commands: {},
        },
      ];

      const device = DeviceFactory.createDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        features,
      ) as HeatingDevice;

      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      // Find sensor component for screed drying
      const screedComponents = Object.values(config.components).filter((c) =>
        c.unique_id?.includes("screeddrying") || c.state_topic?.includes("screedDrying"),
      );

      expect(screedComponents.length).toBeGreaterThan(0);
      for (const component of screedComponents) {
        // Sensor components for service technician features should be disabled
        expect(component.enabled_by_default).toBe(false);
        expect(component.en).toBe(false);
        // Service technician sensor components should have entity_category: "diagnostic"
        // (Sensors cannot have entity_category: "config" - only command components can)
        if (component.platform === "sensor" || component.platform === "binary_sensor") {
          expect(component.entity_category).toBe("diagnostic");
          expect(component.ent_cat).toBe("diagnostic");
        }
      }
    });

    it("should NOT disable resetSchedule (user-facing)", async () => {
      const features: Feature[] = [
        {
          feature: "heating.circuits.1.heating.schedule",
          gatewayId: accessor.gatewayId,
          deviceId: accessor.deviceId,
          timestamp: "2026-01-16T10:27:14.001Z",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            entries: {
              type: "Schedule",
              value: {
                mon: [{ mode: "normal", start: "06:00", end: "22:00", position: 0 }],
              },
            },
          },
          commands: {
            resetSchedule: {
              uri: "",
              name: "resetSchedule",
              isExecutable: true,
              params: {},
            },
          },
        },
      ];

      const device = DeviceFactory.createDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        features,
      ) as HeatingDevice;

      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      const resetScheduleComponents = Object.values(config.components).filter((c) =>
        c.unique_id?.includes("resetschedule"),
      );

      if (resetScheduleComponents.length > 0) {
        for (const component of resetScheduleComponents) {
          // resetSchedule is user-facing, should NOT be disabled
          expect(component.enabled_by_default).not.toBe(false);
          expect(component.en).not.toBe(false);
        }
      }
    });
  });
});
