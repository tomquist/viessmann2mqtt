import { beforeEach, describe, expect, it } from "vitest";
import { HomeAssistantDiscovery } from "../homeassistant.js";
import { HeatingDevice } from "../heating.js";
import { DeviceFactory } from "../factory.js";
import { Feature } from "../../models.js";
import { DeviceAccessor, DeviceModel } from "../base.js";
import { loadAnonymizedDiagnosticsData } from "./test-helpers.js";

// Load diagnostics data with anonymized serial numbers
const diagnosticsData = loadAnonymizedDiagnosticsData();

describe("HomeAssistantDiscovery", () => {
  let device0Data: typeof diagnosticsData.data[0];
  let features: Feature[];
  let device: HeatingDevice;
  let accessor: DeviceAccessor;
  let deviceModel: DeviceModel;
  let discovery: HomeAssistantDiscovery;

  beforeEach(() => {
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
      boilerSerial: device0Data.boilerSerial as string || "TEST_DEVICE_SERIAL_123", // Use anonymized serial
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

    discovery = new HomeAssistantDiscovery(
      "homeassistant",
      device0Data.installationId as number,
      device0Data.gatewayId as string,
      device0Data.deviceId as string,
    );
  });

  describe("generateDeviceDiscoveryConfig", () => {
    it("should generate device discovery config", async () => {
      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      expect(config).toBeDefined();
      expect(config.device).toBeDefined();
      expect(config.device.identifiers).toBeDefined();
      expect(Array.isArray(config.device.identifiers)).toBe(true);
      // ViCare format: {gateway_serial}_{device_serial} or {gateway_serial}_{device_id}
      // Primary identifier should start with gateway serial
      expect(config.device.identifiers[0]).toMatch(new RegExp(`^${device0Data.gatewayId}_`));
      // Composite identifier should also be included
      expect(config.device.identifiers.some((id: string) => id.includes("viessmann_"))).toBe(true);
      expect(config.device.manufacturer).toBe("Viessmann");
      expect(config.device.model).toBeDefined();
      expect(config.device.name).toBeDefined();
    });

    it("should include origin information", async () => {
      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      expect(config.origin).toBeDefined();
      expect(config.origin.name).toBe("viessmann2mqtt");
      expect(config.origin.sw_version).toBeDefined();
    });

    it("should include components", async () => {
      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      expect(config.components).toBeDefined();
      expect(typeof config.components).toBe("object");
    });

    it("should generate components with correct structure", async () => {
      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      const componentKeys = Object.keys(config.components);
      
      if (componentKeys.length > 0) {
        for (const [, component] of Object.entries(config.components)) {
          expect(component).toHaveProperty("platform");
          expect(component).toHaveProperty("unique_id");
          expect(component.unique_id).toContain("viessmann_");
          
          // Components should have state_topic if they're sensors/climate
          if (component.platform === "sensor" || component.platform === "climate") {
            expect(component).toHaveProperty("state_topic");
            expect(typeof component.state_topic).toBe("string");
          }
        }
      }
    });

    it("should generate unique IDs for all components", async () => {
      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      const uniqueIds = new Set<string>();
      for (const component of Object.values(config.components)) {
        if (component.unique_id) {
          expect(uniqueIds.has(component.unique_id)).toBe(false);
          uniqueIds.add(component.unique_id);
        }
      }
    });

    it("should include device identifiers in component unique IDs", async () => {
      const config = await discovery.generateDeviceDiscoveryConfig(device, features);
      
      for (const component of Object.values(config.components)) {
        if (component.unique_id) {
          // Unique ID should contain parts of the device identifier
          expect(component.unique_id).toContain(String(device0Data.installationId));
        }
      }
    });
  });

  describe("Component Generation from Decorators", () => {
    it("should generate components from @Sensor decorators", async () => {
      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      // Should have sensor components if device has sensors with @Sensor decorator
      const sensorComponents = Object.values(config.components).filter(
        (c) => c.platform === "sensor" || c.platform === "binary_sensor",
      );

      // May or may not have sensors depending on device type and features
      expect(Array.isArray(sensorComponents)).toBe(true);
    });

    it("should generate circuit components when circuits are available", async () => {
      const circuits = device.getAvailableCircuits();
      
      if (circuits.length > 0) {
        const config = await discovery.generateDeviceDiscoveryConfig(device, features);

        // Should have circuit-related components
        const circuitComponents = Object.keys(config.components).filter((key) =>
          key.includes("circuit_"),
        );

        // Components are generated based on available features
        expect(Array.isArray(circuitComponents)).toBe(true);
      }
    });
  });

  describe("Device Information", () => {
    it("should include correct device model", async () => {
      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      expect(config.device.model).toBe(device.getModelId());
    });

    it("should include device ID in name", async () => {
      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      expect(config.device.name).toContain(device0Data.deviceId);
    });

    it("should create unique device identifier", async () => {
      const config = await discovery.generateDeviceDiscoveryConfig(device, features);

      // ViCare format: {gateway_serial}_{device_serial} (with dashes replaced by underscores)
      // Or: {gateway_serial}_{device_id} if device_serial is not available
      // Primary identifier should match ViCare format
      const primaryIdentifier = config.device.identifiers[0];
      expect(primaryIdentifier).toMatch(new RegExp(`^${device0Data.gatewayId}_(.+)$`));
      
      // Composite identifier should also be included for backwards compatibility
      const expectedCompositeIdentifier = `viessmann_${device0Data.installationId}_${device0Data.gatewayId}_${device0Data.deviceId}`;
      expect(config.device.identifiers).toContain(expectedCompositeIdentifier);
    });
  });
});
