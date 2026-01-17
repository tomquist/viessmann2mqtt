import { beforeEach, describe, expect, it } from "vitest";
import {
  BurnerSensor,
  CircuitClimate,
  CircuitSensor,
  DependentProperty,
  type DiscoverableMethod,
  HeatingCurve,
  PropertyRetrieval,
  Sensor,
  TimeBasedSensor,
  getBurnerSensorMetadata,
  getCircuitClimateMetadata,
  getCircuitSensorMetadata,
  getComplexComponentProperties,
  getDiscoverableMethods,
  getDiscoveryMetadata,
  getHeatingCurveMetadata,
  getTimeBasedSensorMetadata,
} from "../discovery.js";
import { HeatingDevice } from "../heating.js";
import { DeviceFactory } from "../factory.js";
import { Feature } from "../../models.js";
import { DeviceAccessor, DeviceModel } from "../base.js";
import { loadAnonymizedDiagnosticsData } from "./test-helpers.js";

// Load diagnostics data with anonymized serial numbers
const diagnosticsData = loadAnonymizedDiagnosticsData();

describe("Discovery Decorators", () => {
  describe("@Sensor", () => {
    it("should store and retrieve sensor metadata", () => {
      class TestDevice {
        @Sensor({
          featurePath: "heating.sensors.temperature.outside",
          platform: "sensor",
          deviceClass: "temperature",
          unitOfMeasurement: "°C",
        })
        getOutsideTemperature(): number | null {
          return null;
        }
      }

      // Get the original method from prototype to access metadata
      // The metadata is stored on the original function, not bound versions
      // Access via descriptor to avoid unbound method lint error
      const descriptor = Object.getOwnPropertyDescriptor(TestDevice.prototype, "getOutsideTemperature");
      const method = descriptor?.value as unknown as DiscoverableMethod | undefined;
      if (!method) {
        throw new Error("Method not found");
      }
      const metadata = getDiscoveryMetadata(method);

      expect(metadata).toBeDefined();
      expect(metadata?.featurePath).toBe("heating.sensors.temperature.outside");
      expect(metadata?.platform).toBe("sensor");
      expect(metadata?.deviceClass).toBe("temperature");
      expect(metadata?.unitOfMeasurement).toBe("°C");
    });

    it("should support custom value template", () => {
      class TestDevice {
        @Sensor({
          featurePath: "heating.sensors.temperature.outside",
          platform: "sensor",
          valueTemplate: "{{ value_json.properties.day.value[0] }}",
        })
        getOutsideTemperature(): number | null {
          return null;
        }
      }

      // Get the original method from prototype to access metadata
      // The metadata is stored on the original function, not bound versions
      // Access via descriptor to avoid unbound method lint error
      const descriptor = Object.getOwnPropertyDescriptor(TestDevice.prototype, "getOutsideTemperature");
      const method = descriptor?.value as unknown as DiscoverableMethod | undefined;
      if (!method) {
        throw new Error("Method not found");
      }
      const metadata = getDiscoveryMetadata(method);

      expect(metadata?.valueTemplate).toBe("{{ value_json.properties.day.value[0] }}");
    });
  });

  describe("@CircuitSensor", () => {
    it("should store and retrieve circuit sensor metadata", () => {
      class TestDevice {
        @CircuitSensor({
          featurePathTemplate: "heating.circuits.N.sensors.temperature.room",
          platform: "sensor",
          deviceClass: "temperature",
          componentKeyTemplate: "circuit_{id}_room_temp",
          getAvailableItemsMethod: "getAvailableCircuits",
        })
        declare _generateCircuitRoomTemp: Record<string, any>;
      }

      const _device = new TestDevice();
      const metadata = getCircuitSensorMetadata(TestDevice.prototype, "_generateCircuitRoomTemp");

      expect(metadata).toBeDefined();
      expect(metadata?.featurePathTemplate).toBe("heating.circuits.N.sensors.temperature.room");
      expect(metadata?.platform).toBe("sensor");
      expect(metadata?.componentKeyTemplate).toBe("circuit_{id}_room_temp");
    });
  });

  describe("@CircuitClimate", () => {
    it("should store and retrieve circuit climate metadata", () => {
      class TestDevice {
        @CircuitClimate({
          featurePathTemplate: "heating.circuits.N.operating.modes.active",
          getAvailableItemsMethod: "getAvailableCircuits",
          getNameMethod: "getName",
          componentKeyTemplate: "circuit_{id}",
          componentBuilder: () => ({}), // Mock builder
        })
        declare _generateCircuitClimate: Record<string, any>;
      }

      const _device = new TestDevice();
      const metadata = getCircuitClimateMetadata(TestDevice.prototype, "_generateCircuitClimate");

      expect(metadata).toBeDefined();
      expect(metadata?.featurePathTemplate).toBe("heating.circuits.N.operating.modes.active");
      expect(metadata?.componentKeyTemplate).toBe("circuit_{id}");
      expect(metadata?.getNameMethod).toBe("getName");
      expect(metadata?.componentBuilder).toBeDefined();
    });
  });

  describe("@HeatingCurve", () => {
    it("should store and retrieve heating curve metadata", () => {
      class TestDevice {
        @HeatingCurve({
          featurePathTemplate: "heating.circuits.N.heating.curve",
          getAvailableItemsMethod: "getAvailableCircuits",
          componentKeyTemplate: "circuit_{id}_heating_curve",
        })
        declare _generateHeatingCurve: Record<string, any>;
      }

      const _device = new TestDevice();
      const metadata = getHeatingCurveMetadata(TestDevice.prototype, "_generateHeatingCurve");

      expect(metadata).toBeDefined();
      expect(metadata?.featurePathTemplate).toBe("heating.circuits.N.heating.curve");
      expect(metadata?.componentKeyTemplate).toBe("circuit_{id}_heating_curve");
    });
  });

  describe("@TimeBasedSensor", () => {
    it("should store and retrieve time-based sensor metadata", () => {
      class TestDevice {
        @TimeBasedSensor({
          featurePath: "heating.gas.consumption.dhw",
          baseComponentKey: "gas_consumption_dhw",
        })
        declare _generateGasConsumption: Record<string, any>;
      }

      const _device = new TestDevice();
      const metadata = getTimeBasedSensorMetadata(TestDevice.prototype, "_generateGasConsumption");

      expect(metadata).toBeDefined();
      expect(metadata?.featurePath).toBe("heating.gas.consumption.dhw");
      expect(metadata?.baseComponentKey).toBe("gas_consumption_dhw");
    });
  });

  describe("@BurnerSensor", () => {
    it("should store and retrieve burner sensor metadata", () => {
      class TestDevice {
        @BurnerSensor({
          featurePathTemplate: "heating.burners.N.statistics",
          platform: "sensor",
          propertyPath: "hours.value",
          getAvailableItemsMethod: "getAvailableBurners",
          componentKeyTemplate: "burner_{id}_hours",
          displayNameTemplate: "Burner {number} Operating Hours",
        })
        declare _generateBurnerHours: Record<string, any>;
      }

      const _device = new TestDevice();
      const metadata = getBurnerSensorMetadata(TestDevice.prototype, "_generateBurnerHours");

      expect(metadata).toBeDefined();
      expect(metadata?.featurePathTemplate).toBe("heating.burners.N.statistics");
      expect(metadata?.componentKeyTemplate).toBe("burner_{id}_hours");
      expect(metadata?.platform).toBe("sensor");
      expect(metadata?.propertyPath).toBe("hours.value");
    });
  });

  describe("@PropertyRetrieval", () => {
    it("should apply property retrieval decorator", () => {
      class TestDevice {
        @PropertyRetrieval({
          featurePath: "heating.dhw",
          propertyPath: "enabled",
          returnType: "boolean",
        })
        declare isDomesticHotWaterDevice: boolean;
      }

      // PropertyRetrieval decorator creates a getter, so we can't easily test metadata retrieval
      // But we can verify the property exists
      const device = new TestDevice();
      expect(device).toHaveProperty("isDomesticHotWaterDevice");
    });
  });

  describe("@DependentProperty", () => {
    it("should apply dependent property decorator", () => {
      class TestDevice {
        @DependentProperty({
          featurePathTemplate: "heating.circuits.N.operating.programs.{program}.temperature",
          propertyPath: "temperature",
          returnType: "number",
          dependsOn: "getActiveProgram",
        })
        declare getCurrentDesiredTemperature: number | null;
      }

      // DependentProperty decorator creates a getter, so we can't easily test metadata retrieval
      // But we can verify the property exists
      const device = new TestDevice();
      expect(device).toHaveProperty("getCurrentDesiredTemperature");
    });
  });
});

describe("getDiscoverableMethods", () => {
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

  it("should discover methods decorated with @Sensor", () => {
    const discoverableMethods = getDiscoverableMethods(device as unknown as Record<string, unknown>);

    // Should find methods decorated with @Sensor
    const sensorMethods = discoverableMethods.filter(
      (m) => m.metadata.platform === "sensor" || m.metadata.platform === "binary_sensor",
    );

    expect(discoverableMethods.length).toBeGreaterThan(0);
    expect(sensorMethods.length).toBeGreaterThan(0);

    // Verify each method has metadata
    for (const { methodName, metadata, method } of discoverableMethods) {
      expect(methodName).toBeDefined();
      expect(metadata).toBeDefined();
      expect(metadata.featurePath).toBeDefined();
      expect(typeof method).toBe("function");
    }
  });

  it("should bind methods to the instance", () => {
    const discoverableMethods = getDiscoverableMethods(device as unknown as Record<string, unknown>);

    for (const { method } of discoverableMethods) {
      // Bound methods should be callable
      expect(() => method()).not.toThrow();
    }
  });
});

describe("getComplexComponentProperties", () => {
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

  it("should retrieve circuit sensor properties", () => {
    const properties = getComplexComponentProperties(device);

    // May or may not have circuit sensors depending on device type
    expect(Array.isArray(properties.circuitSensors)).toBe(true);

    // Verify structure if sensors exist
    for (const sensor of properties.circuitSensors) {
      expect(sensor.propertyName).toBeDefined();
      expect(sensor.metadata.featurePathTemplate).toBeDefined();
      expect(sensor.metadata.platform).toBeDefined();
    }
  });

  it("should retrieve circuit climate properties", () => {
    const properties = getComplexComponentProperties(device);

    // May or may not have climates depending on device type
    expect(Array.isArray(properties.circuitClimates)).toBe(true);

    for (const climate of properties.circuitClimates) {
      expect(climate.propertyName).toBeDefined();
      expect(climate.metadata.featurePathTemplate).toBeDefined();
    }
  });

  it("should retrieve heating curve properties", () => {
    const properties = getComplexComponentProperties(device);

    expect(Array.isArray(properties.heatingCurves)).toBe(true);

    for (const curve of properties.heatingCurves) {
      expect(curve.propertyName).toBeDefined();
      expect(curve.metadata.featurePathTemplate).toBeDefined();
    }
  });

  it("should retrieve time-based sensor properties", () => {
    const properties = getComplexComponentProperties(device);

    expect(Array.isArray(properties.timeBasedSensors)).toBe(true);

    for (const sensor of properties.timeBasedSensors) {
      expect(sensor.propertyName).toBeDefined();
      expect(sensor.metadata.featurePath).toBeDefined();
      expect(sensor.metadata.baseComponentKey).toBeDefined();
    }
  });

  it("should retrieve burner sensor properties", () => {
    const properties = getComplexComponentProperties(device);

    expect(Array.isArray(properties.burnerSensors)).toBe(true);

    for (const sensor of properties.burnerSensors) {
      expect(sensor.propertyName).toBeDefined();
      expect(sensor.metadata.featurePathTemplate).toBeDefined();
    }
  });
});

describe("Metadata Retrieval Functions", () => {
  it("should retrieve circuit sensor metadata", () => {
    class TestDevice {
      @CircuitSensor({
        featurePathTemplate: "heating.circuits.N.sensors.temperature.room",
        platform: "sensor",
        componentKeyTemplate: "circuit_{id}_room_temp",
        getAvailableItemsMethod: "getAvailableCircuits",
      })
      declare _test: Record<string, any>;
    }

    const metadata = getCircuitSensorMetadata(TestDevice.prototype, "_test");
    expect(metadata).toBeDefined();
    expect(metadata?.featurePathTemplate).toBe("heating.circuits.N.sensors.temperature.room");
  });

  it("should return undefined for non-existent metadata", () => {
    class TestDevice {
      declare _nonExistent: Record<string, any>;
    }

    const metadata = getCircuitSensorMetadata(TestDevice.prototype, "_nonExistent");
    expect(metadata).toBeUndefined();
  });
});
