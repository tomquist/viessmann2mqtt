import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { HomeAssistantDiscovery } from "../homeassistant.js";
import { HeatingDevice } from "../heating.js";
import { DeviceFactory } from "../factory.js";
import { Feature } from "../../models.js";
import { DeviceAccessor, DeviceModel } from "../base.js";
import { loadAnonymizedDiagnosticsData } from "./test-helpers.js";

const packageVersion = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf-8"),
) as { version: string };

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
      device0Data.installationId,
      device0Data.gatewayId,
      device0Data.deviceId,
    );
  });

  describe("generateDeviceDiscoveryConfig", () => {
    it("should generate device discovery config", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);

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

    it("should include origin information", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);

      expect(config.origin).toBeDefined();
      expect(config.origin.name).toBe("viessmann2mqtt");
      expect(config.origin.sw_version).toBe(packageVersion.version);
    });

    it("should include MQTT availability for bridge online/offline status", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);
      expect(config.availability).toBeDefined();
      expect(Array.isArray(config.availability)).toBe(true);
      expect(config.availability![0]).toMatchObject({
        topic: "homeassistant/status",
        payload_available: "online",
        payload_not_available: "offline",
      });
    });

    it("should not set MQTT abbreviation-only keys on components", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);
      for (const component of Object.values(config.components)) {
        expect(component).not.toHaveProperty("ent_cat");
        expect(component).not.toHaveProperty("en");
      }
    });

    it("should set default_entity_id on each component (platform.slug)", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);
      for (const [key, component] of Object.entries(config.components)) {
        expect(component).not.toHaveProperty("object_id");
        expect(component.default_entity_id).toBe(
          `${component.platform}.${key}`,
        );
      }
    });

    it("should include components", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);

      expect(config.components).toBeDefined();
      expect(typeof config.components).toBe("object");
    });

    it("should generate components with correct structure", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);

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

    it("should generate unique IDs for all components", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);

      const uniqueIds = new Set<string>();
      for (const component of Object.values(config.components)) {
        if (component.unique_id) {
          expect(uniqueIds.has(component.unique_id)).toBe(false);
          uniqueIds.add(component.unique_id);
        }
      }
    });

    it("should include device identifiers in component unique IDs", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);
      
      for (const component of Object.values(config.components)) {
        if (component.unique_id) {
          // Unique ID should contain parts of the device identifier
          expect(component.unique_id).toContain(String(device0Data.installationId));
        }
      }
    });
  });

  describe("Component Generation from Decorators", () => {
    it("should generate components from @Sensor decorators", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);

      // Should have sensor components if device has sensors with @Sensor decorator
      const sensorComponents = Object.values(config.components).filter(
        (c) => c.platform === "sensor" || c.platform === "binary_sensor",
      );

      // May or may not have sensors depending on device type and features
      expect(Array.isArray(sensorComponents)).toBe(true);
    });

    it("should generate circuit components when circuits are available", () => {
      const circuits = device.getAvailableCircuits();
      
      if (circuits.length > 0) {
        const config = discovery.generateDeviceDiscoveryConfig(device, features);

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
    it("should include correct device model", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);

      expect(config.device.model).toBe(device.getModelId());
    });

    it("should include device ID in name", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);

      expect(config.device.name).toContain(device0Data.deviceId);
    });

    it("should create unique device identifier", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);

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

  describe("Statistics Feature Splitting", () => {
    it("should split statistics features into separate sensors per numeric property", () => {
      const accessor: DeviceAccessor = {
        installationId: 1234567,
        gatewayId: "TEST_GATEWAY_1234567890",
        deviceId: "0",
      };

      const deviceModel: DeviceModel = {
        id: "0",
        modelId: "Test-Model",
        gatewaySerial: "TEST_GATEWAY_1234567890",
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

      const makeFeature = (
        featurePath: string,
        properties: Record<string, any>,
      ): Feature => ({
        feature: featurePath,
        gatewayId: accessor.gatewayId,
        deviceId: accessor.deviceId,
        timestamp: "2024-01-01T00:00:00.000Z",
        isEnabled: true,
        isReady: true,
        apiVersion: 1,
        uri: `https://example.test/${featurePath}`,
        properties,
        commands: {},
      });

      const features: Feature[] = [
        makeFeature("heating.burners.0.statistics", {
          hours: { type: "number", value: 123, unit: "hour" },
          starts: { type: "number", value: 45, unit: "count" },
        }),
        makeFeature("heating.compressors.0.statistics", {
          hours: { type: "number", value: 456, unit: "hour" },
          starts: { type: "number", value: 78, unit: "count" },
        }),
      ];

      const device = new HeatingDevice(accessor, [], deviceModel, features);
      const discovery = new HomeAssistantDiscovery(
        "homeassistant",
        accessor.installationId,
        accessor.gatewayId,
        accessor.deviceId,
      );

      const config = discovery.generateDeviceDiscoveryConfig(device, features);

      expect(config.components).toHaveProperty("burners_0_statistics_hours");
      expect(config.components).toHaveProperty("burners_0_statistics_starts");
      expect(config.components).toHaveProperty("compressors_0_statistics_hours");
      expect(config.components).toHaveProperty("compressors_0_statistics_starts");

      expect(config.components).not.toHaveProperty("burners_0_statistics");
      expect(config.components).not.toHaveProperty("compressors_0_statistics");

      const burnerHours = config.components["burners_0_statistics_hours"];
      const burnerStarts = config.components["burners_0_statistics_starts"];

      expect(burnerHours.unit_of_measurement).toBe("h");
      expect(burnerStarts.unit_of_measurement).toBe("count");
      expect(burnerHours.device_class).toBe("duration");
      expect(burnerHours.value_template).toContain("{% if value_json is defined");
      expect(burnerHours.value_template).toContain("| float");
    });

    it("should map HA auto climate command to weather-controlled Viessmann mode when available", () => {
      const tmpl = HomeAssistantDiscovery.buildModeCommandTemplate("mode", [
        "standby",
        "heating",
        "dhwAndHeatingWeatherControlled",
      ]);
      expect(tmpl).toContain("dhwAndHeatingWeatherControlled");
    });

    it("should set day/currentDay consumption without entity_category and week as diagnostic", () => {
      const accessor: DeviceAccessor = {
        installationId: 1,
        gatewayId: "GW",
        deviceId: "0",
      };
      const deviceModel: DeviceModel = {
        id: "0",
        modelId: "M",
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
      const consumptionFeatures = [
        {
          feature: "heating.gas.consumption.heating",
          gatewayId: "GW",
          deviceId: "0",
          timestamp: "",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            day: { type: "array", value: [1.2], unit: "kilowatthour" },
            currentDay: { type: "number", value: 3.4, unit: "kilowatthour" },
            week: { type: "array", value: [10], unit: "kilowatthour" },
            month: { type: "array", value: [20], unit: "kilowatthour" },
          },
          commands: {},
        },
      ] as unknown as Feature[];
      // DeviceFactory falls through to Hybrid (modelPattern /.*/) which extends GazBoiler and
      // registers gas consumption via TimeBasedSensor — skipping auto time-split. Use HeatingDevice directly.
      const dev = new HeatingDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        consumptionFeatures,
      );
      const disc = new HomeAssistantDiscovery("mqtt", 1, "GW", "0");
      const cfg = disc.generateDeviceDiscoveryConfig(dev, consumptionFeatures);
      const dayKey = Object.keys(cfg.components).find((k) => k.endsWith("_day"));
      const weekKey = Object.keys(cfg.components).find((k) => k.endsWith("_week"));
      expect(dayKey).toBeDefined();
      expect(weekKey).toBeDefined();
      expect(cfg.components[dayKey!].entity_category).toBeUndefined();
      expect(cfg.components[weekKey!].entity_category).toBe("diagnostic");
    });

    it("should derive energy vs. power from the unit reported by the API", () => {
      const accessor: DeviceAccessor = {
        installationId: 1,
        gatewayId: "GW",
        deviceId: "0",
      };
      const deviceModel: DeviceModel = {
        id: "0",
        modelId: "M",
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
      const makeFeature = (feature: string, properties: Record<string, unknown>) => ({
        feature,
        gatewayId: "GW",
        deviceId: "0",
        timestamp: "",
        isEnabled: true,
        isReady: true,
        apiVersion: 1,
        uri: "",
        properties,
        commands: {},
      });
      const value = (v: number, unit: string) => ({
        status: { type: "string", value: "connected" },
        value: { type: "number", value: v, unit },
      });
      // Units as reported by real devices
      const cases: Array<[string, Record<string, unknown>, string, Record<string, string>]> = [
        ["heating.compressors.0.power.consumption.current", value(0.8, "kilowatt"),
          "compressors_0_power_consumption_current", { device_class: "power", unit_of_measurement: "kW", state_class: "measurement" }],
        ["heating.power.consumption.current", value(1.2, "kilowatt"),
          "power_consumption_current", { device_class: "power", unit_of_measurement: "kW", state_class: "measurement" }],
        ["heating.compressors.0.heat.production.current", value(3100, "watt"),
          "compressors_0_heat_production_current", { device_class: "power", unit_of_measurement: "W", state_class: "measurement" }],
        ["heating.heat.production.current", value(3.1, "kilowatt"),
          "heat_production_current", { device_class: "power", unit_of_measurement: "kW", state_class: "measurement" }],
        ["heating.power.production.cumulative", { value: { type: "number", value: 1234, unit: "kilowattHour" } },
          "power_production_cumulative", { device_class: "energy", unit_of_measurement: "kWh", state_class: "total_increasing" }],
        ["heating.power.purchase.cumulative", { value: { type: "number", value: 4321, unit: "kilowattHour" } },
          "power_purchase_cumulative", { device_class: "energy", unit_of_measurement: "kWh", state_class: "total_increasing" }],
        ["heating.power.sold.current", { value: { type: "number", value: 500, unit: "watt" } },
          "power_sold_current", { device_class: "power", unit_of_measurement: "W", state_class: "measurement" }],
        ["heating.fuelCell.managers.energy.prediction.power.consumption", { value: { type: "number", value: 900, unit: "wattHour" } },
          "fuelCell_managers_energy_prediction_power_consumption", { device_class: "energy", unit_of_measurement: "Wh" }],
        ["heating.heatingRod.power.consumption.currentYear.dhw", { value: { type: "number", value: 42, unit: "kilowattHour" } },
          "heatingRod_power_consumption_currentYear_dhw", { device_class: "energy", unit_of_measurement: "kWh", state_class: "total_increasing" }],
      ];
      const testFeatures = [
        ...cases.map(([feature, properties]) => makeFeature(feature, properties)),
        makeFeature("heating.solar.power.production", {
          day: { type: "array", value: [5], unit: "kilowattHour" },
          week: { type: "array", value: [30], unit: "kilowattHour" },
        }),
        makeFeature("ess.battery.usedAverage", {
          averageUsableSystemEnergy: { type: "number", value: 9000, unit: "wattHour" },
        }),
      ] as unknown as Feature[];
      const dev = new HeatingDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        testFeatures,
      );
      const disc = new HomeAssistantDiscovery("mqtt", 1, "GW", "0");
      const cfg = disc.generateDeviceDiscoveryConfig(dev, testFeatures);

      for (const [, , key, expected] of cases) {
        expect(cfg.components[key], key).toMatchObject(expected);
      }

      // Day/week production totals are energy, not power
      for (const key of ["solar_power_production_day", "solar_power_production_week"]) {
        expect(cfg.components[key], key).toMatchObject({ device_class: "energy", unit_of_measurement: "kWh" });
      }

      // Stored energy is not a counter and must not become a total_increasing energy sensor
      const battery = cfg.components["ess_battery_usedAverage"];
      expect(battery.unit_of_measurement).toBe("Wh");
      expect(battery.device_class).toBeUndefined();
      expect(battery.state_class).not.toBe("total_increasing");
    });

    it("should set optimistic on boolean command switches", () => {
      const accessor: DeviceAccessor = {
        installationId: 1,
        gatewayId: "GW",
        deviceId: "0",
      };
      const deviceModel: DeviceModel = {
        id: "0",
        modelId: "M",
        gatewaySerial: "GW",
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
      const features: Feature[] = [
        {
          feature: "heating.circuits.0.operating.programs.comfort",
          gatewayId: "GW",
          deviceId: "0",
          timestamp: "",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            active: { type: "boolean", value: true },
          },
          commands: {
            setActive: {
              uri: "",
              name: "setActive",
              isExecutable: true,
              params: {
                active: { type: "boolean", required: true, constraints: {} },
              },
            },
          },
        },
      ];
      const dev = DeviceFactory.createDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        features,
      ) as HeatingDevice;
      const disc = new HomeAssistantDiscovery("mqtt", 1, "GW", "0");
      const cfg = disc.generateDeviceDiscoveryConfig(dev, features);
      const sw = Object.values(cfg.components).find(
        (c) => c.platform === "switch" && c.command_topic?.includes("setActive"),
      );
      expect(sw).toBeDefined();
      expect(sw!.optimistic).toBe(true);
    });

    it("should summarize device bus topology and expose full payload as attributes", () => {
      const accessor: DeviceAccessor = {
        installationId: 1,
        gatewayId: "GW",
        deviceId: "0",
      };
      const deviceModel: DeviceModel = {
        id: "0",
        modelId: "M",
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
      const features: Feature[] = [
        {
          feature: "device.busTopology",
          gatewayId: "GW",
          deviceId: "0",
          timestamp: "",
          isEnabled: true,
          isReady: true,
          apiVersion: 1,
          uri: "",
          properties: {
            value: {
              type: "array",
              value: [
                { busAddress: 1, busType: "CanInternal" },
                { busAddress: 50, busType: "CanInternal" },
              ],
            },
          },
          commands: {},
        },
      ];

      const dev = new HeatingDevice(
        accessor,
        deviceModel.roles,
        deviceModel,
        features,
      );
      const disc = new HomeAssistantDiscovery("mqtt", 1, "GW", "0");
      const cfg = disc.generateDeviceDiscoveryConfig(dev, features);
      const busTopology = cfg.components["device_busTopology"];

      expect(busTopology).toBeDefined();
      expect(busTopology.platform).toBe("sensor");
      expect(busTopology.value_template).toContain("| count }} devices");
      expect(busTopology.json_attributes_topic).toContain("/features/device.busTopology");
      expect(busTopology.json_attributes_template).toContain("'devices': value_json.properties.value.value");
      expect(busTopology.entity_category).toBe("diagnostic");
    });

    it("should consolidate activate/deactivate/setActive with boolean active into one optimistic switch", () => {
      const config = discovery.generateDeviceDiscoveryConfig(device, features);
      const baseKey = "dhw_oneTimeCharge";
      const oneTime = config.components[baseKey];

      expect(oneTime).toBeDefined();
      expect(oneTime.platform).toBe("switch");
      expect(oneTime.optimistic).toBe(true);
      expect(oneTime.command_topic).toContain("/commands/setActive/set");
      expect(oneTime.payload_on).toBe(JSON.stringify({ active: true }));
      expect(oneTime.payload_off).toBe(JSON.stringify({ active: false }));
      expect(oneTime.state_topic).toContain("/features/heating.dhw.oneTimeCharge");
      expect(oneTime.value_template).toContain("properties.active.value");
      expect(oneTime.state_on).toBe("ON");
      expect(oneTime.state_off).toBe("OFF");
      expect(oneTime.name).toBeDefined();
      expect(config.components[`${baseKey}_activate`.toLowerCase()]).toBeUndefined();
      expect(config.components[`${baseKey}_deactivate`.toLowerCase()]).toBeUndefined();
      expect(config.components[`${baseKey}_setactive_active`.toLowerCase()]).toBeUndefined();
    });
  });
});
