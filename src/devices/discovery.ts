/**
 * Discovery metadata for Home Assistant sensor discovery.
 */
export interface SensorDiscoveryMetadata {
  /**
   * The API feature path (e.g., "heating.sensors.temperature.outside").
   */
  featurePath: string;

  /**
   * Home Assistant platform type.
   */
  platform: "sensor" | "binary_sensor" | "climate";

  /**
   * Device class for the sensor (e.g., "temperature", "energy", "pressure").
   */
  deviceClass?: string;

  /**
   * Unit of measurement (e.g., "°C", "kWh", "bar").
   */
  unitOfMeasurement?: string;

  /**
   * Value template for extracting the value from MQTT payload.
   * Defaults to "{{ value_json.properties.value.value }}" for sensors.
   */
  valueTemplate?: string;

  /**
   * Component key in the components object (e.g., "outside_temp", "dhw").
   * If not provided, will be derived from method name.
   */
  componentKey?: string;

  /**
   * For circuit-specific sensors, the circuit ID placeholder.
   * Use "N" for normalized lookup in data-points.json.
   */
  circuitNormalizedPath?: string;
}

/**
 * Metadata storage using WeakMap to avoid memory leaks.
 */
const metadataStore = new WeakMap<DiscoverableMethod, SensorDiscoveryMetadata>();

/**
 * Decorator to mark a device method as a Home Assistant discoverable sensor.
 *
 * @example
 * ```typescript
 * @Sensor({
 *   featurePath: "heating.sensors.temperature.outside",
 *   platform: "sensor",
 *   deviceClass: "temperature",
 *   unitOfMeasurement: "°C",
 * })
 * async getOutsideTemperature(): Promise<number | null> {
 *   // ...
 * }
 * ```
 */
export function Sensor(metadata: SensorDiscoveryMetadata) {
  return function (
     
    target: any,
    propertyKey: string,
    descriptor?: PropertyDescriptor,
  ) {
    // Store metadata on the method function itself
    if (descriptor?.value && typeof descriptor.value === "function") {
       
      metadataStore.set(descriptor.value as DiscoverableMethod, metadata);
    }
    // Also store on the original method if it exists
     
    const originalMethod = target[propertyKey];
    if (originalMethod && typeof originalMethod === "function") {
       
      metadataStore.set(originalMethod as DiscoverableMethod, metadata);
    }
  };
}

/**
 * Get discovery metadata from a method function.
 */
export function getDiscoveryMetadata(
  method: DiscoverableMethod,
): SensorDiscoveryMetadata | undefined {
  return metadataStore.get(method);
}

/**
 * Metadata for circuit-based sensor components.
 */
export interface CircuitSensorMetadata {
  /**
   * The normalized feature path template with "N" placeholder for circuit ID
   * (e.g., "heating.circuits.N.sensors.temperature.room").
   */
  featurePathTemplate: string;

  /**
   * Home Assistant platform type.
   */
  platform: "sensor" | "binary_sensor";

  /**
   * Device class for the sensor (e.g., "temperature", "energy", "pressure").
   */
  deviceClass?: string;

  /**
   * Unit of measurement (e.g., "°C", "kWh", "bar").
   */
  unitOfMeasurement?: string;

  /**
   * Value template for extracting the value from MQTT payload.
   * Defaults to "{{ value_json.properties.value.value }}" for sensors.
   */
  valueTemplate?: string;

  /**
   * Component key template (e.g., "circuit_{id}_room_temp").
   * The {id} placeholder will be replaced with the circuit ID.
   */
  componentKeyTemplate: string;

  /**
   * Method name to get available circuits (e.g., "getAvailableCircuits").
   */
  getAvailableItemsMethod: string;
}

/**
 * Component builder function for circuit climate components.
 */
export type CircuitClimateComponentBuilder = (params: {
  itemId: string;
  featurePath: string;
  componentKey: string;
  baseTopic: string;
  installationId: number;
  gatewayId: string;
  deviceId: string;
  circuit: {
    getName: string | null;
    getModes: string[];
    getCurrentDesiredTemperature: number | null;
  };
}) => Record<string, { platform: string; unique_id?: string; [key: string]: any }> | null;

/**
 * Metadata for circuit climate components.
 */
export interface CircuitClimateMetadata {
  /**
   * The normalized feature path template with "N" placeholder for circuit ID
   * (e.g., "heating.circuits.N.operating.modes.active").
   */
  featurePathTemplate: string;

  /**
   * Method name to get available circuits (e.g., "getAvailableCircuits").
   */
  getAvailableItemsMethod: string;

  /**
   * Method name to get circuit name (e.g., "getName").
   */
  getNameMethod: string;

  /**
   * Component key template (e.g., "circuit_{id}").
   */
  componentKeyTemplate: string;

  /**
   * Component builder function that generates the component configuration.
   * This makes component generation fully declarative.
   */
  componentBuilder: CircuitClimateComponentBuilder;
}

/**
 * Metadata for heating curve sensors (slope and shift).
 */
export interface HeatingCurveMetadata {
  /**
   * The normalized feature path template with "N" placeholder for circuit ID
   * (e.g., "heating.circuits.N.heating.curve").
   */
  featurePathTemplate: string;

  /**
   * Method name to get available circuits (e.g., "getAvailableCircuits").
   */
  getAvailableItemsMethod: string;

  /**
   * Component key template (e.g., "circuit_{id}_heating_curve_slope").
   */
  componentKeyTemplate: string;
}

/**
 * Metadata for time-based sensor components.
 */
export interface TimeBasedSensorMetadata {
  /**
   * The API feature path (e.g., "heating.gas.consumption.heating").
   */
  featurePath: string;

  /**
   * Base component key (e.g., "gas_consumption").
   */
  baseComponentKey: string;

  /**
   * Device class for the sensor (e.g., "energy", "gas").
   */
  deviceClass?: string;

  /**
   * Unit of measurement (e.g., "kWh", "m³").
   * Can be determined dynamically from feature properties.
   */
  unitOfMeasurement?: string;

  /**
   * Value template for the day value (e.g., "{{ value_json.properties.day.value[0] }}").
   */
  dayValueTemplate?: string;
}

/**
 * Metadata for burner-based sensor components.
 */
export interface BurnerSensorMetadata {
  /**
   * The normalized feature path template with "N" placeholder for burner ID
   * (e.g., "heating.burners.N.statistics").
   */
  featurePathTemplate: string;

  /**
   * Home Assistant platform type.
   */
  platform: "sensor";

  /**
   * Property path within the feature (e.g., "hours.value", "starts.value", "modulation.value.value").
   */
  propertyPath: string;

  /**
   * Device class for the sensor (optional).
   */
  deviceClass?: string;

  /**
   * Unit of measurement (e.g., "h", "%").
   */
  unitOfMeasurement?: string;

  /**
   * Value template for extracting the value from MQTT payload.
   */
  valueTemplate?: string;

  /**
   * Component key template (e.g., "burner_{id}_hours").
   */
  componentKeyTemplate: string;

  /**
   * Method name to get available burners (e.g., "getAvailableBurners").
   */
  getAvailableItemsMethod: string;

  /**
   * Display name template (e.g., "Burner {number} Operating Hours").
   */
  displayNameTemplate: string;
}

/**
 * Metadata storage for complex component decorators.
 * Uses class prototype + property key as the key since properties don't have function references.
 */
const circuitSensorStore = new WeakMap<object, Map<string, CircuitSensorMetadata>>();
const circuitClimateStore = new WeakMap<object, Map<string, CircuitClimateMetadata>>();
const heatingCurveStore = new WeakMap<object, Map<string, HeatingCurveMetadata>>();
const timeBasedSensorStore = new WeakMap<object, Map<string, TimeBasedSensorMetadata>>();
const burnerSensorStore = new WeakMap<object, Map<string, BurnerSensorMetadata>>();

/**
 * Helper to get or create a metadata map for a class prototype.
 */
function getMetadataMap<T>(store: WeakMap<object, Map<string, T>>, target: object): Map<string, T> {
  const prototype = (target as { prototype?: object }).prototype || target;
  let map = store.get(prototype);
  if (!map) {
    map = new Map();
    store.set(prototype, map);
  }
  return map;
}

/**
 * Decorator for circuit-based sensor components.
 * 
 * @example
 * ```typescript
 * @CircuitSensor({
 *   featurePathTemplate: "heating.circuits.N.sensors.temperature.room",
 *   platform: "sensor",
 *   deviceClass: "temperature",
 *   unitOfMeasurement: "°C",
 *   componentKeyTemplate: "circuit_{id}_room_temp",
 *   getAvailableItemsMethod: "getAvailableCircuits",
 * })
 * ```
 */
export function CircuitSensor(metadata: CircuitSensorMetadata) {
  return function (
    target: object,
    propertyKey: string,
  ) {
    // Store metadata on the class prototype using property key
    const map = getMetadataMap(circuitSensorStore, target);
    map.set(propertyKey, metadata);
  };
}

/**
 * Decorator for circuit climate components.
 * 
 * @example
 * ```typescript
 * @CircuitClimate({
 *   featurePathTemplate: "heating.circuits.N.operating.modes.active",
 *   getAvailableItemsMethod: "getAvailableCircuits",
 *   getNameMethod: "getName",
 *   componentKeyTemplate: "circuit_{id}",
 * })
 * ```
 */
export function CircuitClimate(metadata: CircuitClimateMetadata) {
  return function (
    target: object,
    propertyKey: string,
  ) {
    const map = getMetadataMap(circuitClimateStore, target);
    map.set(propertyKey, metadata);
  };
}

/**
 * Decorator for heating curve sensors (slope and shift).
 * 
 * @example
 * ```typescript
 * @HeatingCurve({
 *   featurePathTemplate: "heating.circuits.N.heating.curve",
 *   getAvailableItemsMethod: "getAvailableCircuits",
 *   componentKeyTemplate: "circuit_{id}_heating_curve",
 * })
 * ```
 */
export function HeatingCurve(metadata: HeatingCurveMetadata) {
  return function (
    target: object,
    propertyKey: string,
  ) {
    const map = getMetadataMap(heatingCurveStore, target);
    map.set(propertyKey, metadata);
  };
}

/**
 * Decorator for time-based sensor components.
 * 
 * @example
 * ```typescript
 * @TimeBasedSensor({
 *   featurePath: "heating.gas.consumption.heating",
 *   baseComponentKey: "gas_consumption",
 *   deviceClass: "energy",
 *   dayValueTemplate: "{{ value_json.properties.day.value[0] }}",
 * })
 * ```
 */
export function TimeBasedSensor(metadata: TimeBasedSensorMetadata) {
  return function (
    target: object,
    propertyKey: string,
  ) {
    const map = getMetadataMap(timeBasedSensorStore, target);
    map.set(propertyKey, metadata);
  };
}

/**
 * Decorator for burner-based sensor components.
 * 
 * @example
 * ```typescript
 * @BurnerSensor({
 *   featurePathTemplate: "heating.burners.N.statistics",
 *   platform: "sensor",
 *   propertyPath: "hours.value",
 *   unitOfMeasurement: "h",
 *   componentKeyTemplate: "burner_{id}_hours",
 *   getAvailableItemsMethod: "getAvailableBurners",
 *   displayNameTemplate: "Burner {number} Operating Hours",
 * })
 * ```
 */
export function BurnerSensor(metadata: BurnerSensorMetadata) {
  return function (
    target: object,
    propertyKey: string,
  ) {
    const map = getMetadataMap(burnerSensorStore, target);
    map.set(propertyKey, metadata);
  };
}

/**
 * Get circuit sensor metadata from a class prototype and property key.
 */
export function getCircuitSensorMetadata(
  prototype: object,
  propertyKey: string,
): CircuitSensorMetadata | undefined {
  return circuitSensorStore.get(prototype)?.get(propertyKey);
}

/**
 * Get circuit climate metadata from a class prototype and property key.
 */
export function getCircuitClimateMetadata(
  prototype: object,
  propertyKey: string,
): CircuitClimateMetadata | undefined {
  return circuitClimateStore.get(prototype)?.get(propertyKey);
}

/**
 * Get heating curve metadata from a class prototype and property key.
 */
export function getHeatingCurveMetadata(
  prototype: object,
  propertyKey: string,
): HeatingCurveMetadata | undefined {
  return heatingCurveStore.get(prototype)?.get(propertyKey);
}

/**
 * Get time-based sensor metadata from a class prototype and property key.
 */
export function getTimeBasedSensorMetadata(
  prototype: object,
  propertyKey: string,
): TimeBasedSensorMetadata | undefined {
  return timeBasedSensorStore.get(prototype)?.get(propertyKey);
}

/**
 * Get burner sensor metadata from a class prototype and property key.
 */
export function getBurnerSensorMetadata(
  prototype: object,
  propertyKey: string,
): BurnerSensorMetadata | undefined {
  return burnerSensorStore.get(prototype)?.get(propertyKey);
}

/**
 * Get all properties with complex component metadata from a class instance.
 */
export function getComplexComponentProperties(
  instance: any,
): {
  circuitSensors: Array<{ propertyName: string; metadata: CircuitSensorMetadata }>;
  circuitClimates: Array<{ propertyName: string; metadata: CircuitClimateMetadata }>;
  heatingCurves: Array<{ propertyName: string; metadata: HeatingCurveMetadata }>;
  timeBasedSensors: Array<{ propertyName: string; metadata: TimeBasedSensorMetadata }>;
  burnerSensors: Array<{ propertyName: string; metadata: BurnerSensorMetadata }>;
} {
  const result = {
    circuitSensors: [] as Array<{ propertyName: string; metadata: CircuitSensorMetadata }>,
    circuitClimates: [] as Array<{ propertyName: string; metadata: CircuitClimateMetadata }>,
    heatingCurves: [] as Array<{ propertyName: string; metadata: HeatingCurveMetadata }>,
    timeBasedSensors: [] as Array<{ propertyName: string; metadata: TimeBasedSensorMetadata }>,
    burnerSensors: [] as Array<{ propertyName: string; metadata: BurnerSensorMetadata }>,
  };

  const prototype = Object.getPrototypeOf(instance) as object;
  const propertyNames = new Set<string>();
  
  let current: object | null = prototype;
  while (current && current !== Object.prototype) {
    Object.getOwnPropertyNames(current).forEach((name) => {
      if (name !== "constructor") {
        propertyNames.add(name);
      }
    });
    current = Object.getPrototypeOf(current);
  }

  for (const propertyName of propertyNames) {
    const circuitSensorMeta = getCircuitSensorMetadata(prototype, propertyName);
    if (circuitSensorMeta) {
      result.circuitSensors.push({ propertyName, metadata: circuitSensorMeta });
    }
    
    const circuitClimateMeta = getCircuitClimateMetadata(prototype, propertyName);
    if (circuitClimateMeta) {
      result.circuitClimates.push({ propertyName, metadata: circuitClimateMeta });
    }
    
    const heatingCurveMeta = getHeatingCurveMetadata(prototype, propertyName);
    if (heatingCurveMeta) {
      result.heatingCurves.push({ propertyName, metadata: heatingCurveMeta });
    }
    
    const timeBasedMeta = getTimeBasedSensorMetadata(prototype, propertyName);
    if (timeBasedMeta) {
      result.timeBasedSensors.push({ propertyName, metadata: timeBasedMeta });
    }
    
    const burnerMeta = getBurnerSensorMetadata(prototype, propertyName);
    if (burnerMeta) {
      result.burnerSensors.push({ propertyName, metadata: burnerMeta });
    }
  }

  return result;
}

/**
 * Type for a discoverable method.
 */
export type DiscoverableMethod = () => Promise<unknown>;

/**
 * Metadata for property-based data retrieval.
 */
export interface PropertyRetrievalMetadata {
  /**
   * The API feature path (e.g., "heating.solar").
   */
  featurePath: string;

  /**
   * Property path within the feature (e.g., "active", "value").
   */
  propertyPath: string;

  /**
   * Return type hint for TypeScript.
   */
  returnType?: "boolean" | "number" | "string" | "array";

  /**
   * Source to access data from. Defaults to "properties".
   * Use "commands" to access command parameters (e.g., for mode constraints).
   */
  source?: "properties" | "commands";

  /**
   * Custom accessor function for complex cases.
   * If provided, this function will be called with the feature and should return the value.
   * Takes precedence over propertyPath and source.
   */
  customAccessor?: (feature: any) => any;
}

/**
 * Metadata for dependent property-based data retrieval.
 * Used when the feature path depends on another property value.
 */
export interface DependentPropertyMetadata {
  /**
   * Name of the method/property that provides the dependent value (e.g., "getActiveProgram").
   */
  dependsOn: string;

  /**
   * Feature path template with placeholder for the dependent value (e.g., "heating.circuits.N.operating.programs.{program}").
   * Use {value} as placeholder for the dependent property value.
   * Use N as placeholder for circuit/burner ID if applicable.
   */
  featurePathTemplate: string;

  /**
   * Property path within the feature (e.g., "temperature", "value").
   */
  propertyPath: string;

  /**
   * Return type hint for TypeScript.
   */
  returnType?: "boolean" | "number" | "string" | "array";

  /**
   * Optional condition function (as string to be evaluated) that checks if the dependent value is valid.
   * Returns true if the property should be retrieved, false otherwise.
   * Example: "(value) => value && value !== 'standby'"
   * If not provided, any truthy value is considered valid.
   */
  condition?: string;

  /**
   * Optional placeholder name for the dependent value in the feature path template.
   * Defaults to "value".
   */
  placeholder?: string;
}

/**
 * Metadata storage for property retrieval decorators.
 */
const propertyRetrievalStore = new WeakMap<object, Map<string, PropertyRetrievalMetadata>>();

/**
 * Metadata storage for dependent property retrieval decorators.
 */
const dependentPropertyStore = new WeakMap<object, Map<string, DependentPropertyMetadata>>();

/**
 * Decorator for property-based data retrieval.
 * Implements a synchronous getter that retrieves data from cached features.
 * Features are already available via dependency injection, so no async needed.
 * 
 * @example
 * ```typescript
 * @PropertyRetrieval({
 *   featurePath: "heating.solar",
 *   propertyPath: "active",
 *   returnType: "boolean",
 * })
 * declare isSolarThermalDevice: boolean;
 * ```
 */
export function PropertyRetrieval(metadata: PropertyRetrievalMetadata) {
  return function (
    target: object,
    propertyKey: string,
    descriptor?: PropertyDescriptor,
  ) {
    // Store metadata
    const map = getMetadataMap(propertyRetrievalStore, target);
    map.set(propertyKey, metadata);

    // Implement getter function that can be used as both property and method
    const getterImpl = function(this: any) {
      // Handle instance-specific placeholders like circuitId (N placeholder)
      let featurePath = metadata.featurePath;
      if (featurePath.includes("N")) {
        const circuitId = (this as { circuitId?: string }).circuitId;
        if (circuitId !== undefined) {
          featurePath = featurePath.replace(/N/g, String(circuitId));
        }
      }
      
      // Access features - could be on device.features or this.features
      let features = (this as { features?: Map<string, unknown> }).features;
      
      // If features not found on this, try accessing via device property (for HeatingCircuit)
      if (!features && (this as { device?: { features?: Map<string, unknown> } }).device) {
        features = (this as { device: { features?: Map<string, unknown> } }).device.features;
      }
      
      if (!features) {
        return metadata.returnType === "boolean" ? false : null;
      }
      
      const feature = features.get(featurePath) as { isEnabled?: boolean } | undefined;
      if (!feature || !feature.isEnabled) {
        return metadata.returnType === "boolean" ? false : null;
      }
      
      // Handle custom accessor if provided
      if (metadata.customAccessor) {
        const value = metadata.customAccessor(feature as Parameters<typeof metadata.customAccessor>[0]);
        if (metadata.returnType === "boolean") {
          return (value === true || value === "on");
        }
        return value as unknown;
      }

      // Determine source (properties or commands)
      const source = metadata.source || "properties";
      
      // Access from commands if needed
      if (source === "commands") {
        const parts = metadata.propertyPath.split(".");
        let current: unknown = (feature as { commands?: Record<string, unknown> }).commands;
        
        for (const part of parts) {
          if (current === null || current === undefined) {
            return metadata.returnType === "array" ? [] : null;
          }
          if (typeof current !== "object") {
            return metadata.returnType === "array" ? [] : null;
          }
          const currentObj = current as Record<string, unknown>;
          if (currentObj[part] === undefined) {
            return metadata.returnType === "array" ? [] : null;
          }
          current = currentObj[part];
        }
        
        // Handle array return type
        if (metadata.returnType === "array") {
          return (Array.isArray(current) ? current : []) as unknown[];
        }
        
        return current;
      }
      
      // Default: access from properties using getPropertyValue
      type GetPropertyValueFn = <T>(feature: unknown, path: string) => T | null;
      let getPropertyValueFn: GetPropertyValueFn | undefined;
      const thisObj = this as { getPropertyValue?: GetPropertyValueFn; device?: { getPropertyValue?: GetPropertyValueFn } };
      if (thisObj.getPropertyValue) {
        getPropertyValueFn = thisObj.getPropertyValue.bind(thisObj);
      } else if (thisObj.device?.getPropertyValue) {
        getPropertyValueFn = thisObj.device.getPropertyValue.bind(thisObj.device);
      } else {
        return null;
      }
      
      // Handle array access like "day.value[0]"
      let propertyPath = metadata.propertyPath;
      let arrayIndex: number | undefined;
      if (propertyPath.includes("[") && propertyPath.includes("]")) {
        const match = propertyPath.match(/^(.+)\[(\d+)\]$/);
        if (match) {
          propertyPath = match[1];
          arrayIndex = parseInt(match[2], 10);
        }
      }
      
      let value = getPropertyValueFn<unknown>(feature, propertyPath);
      
      // Handle array access
      if (arrayIndex !== undefined && Array.isArray(value)) {
        value = value.length > arrayIndex ? value[arrayIndex] : null;
      }
      
      if (metadata.returnType === "boolean") {
        return (value === true || value === "on");
      }
      return value;
    };

    // If this is a method (has descriptor), replace the implementation
    if (descriptor && descriptor.value) {
      descriptor.value = getterImpl;
      return;
    }
    
    // If this is a property (no descriptor), implement a synchronous getter
    if (!descriptor) {
      Object.defineProperty(target, propertyKey, {
        get: getterImpl,
        enumerable: true,
        configurable: true,
      });
    }
  };
}

/**
 * Decorator for dependent property-based data retrieval.
 * Implements a synchronous getter that retrieves data from cached features,
 * where the feature path depends on another property value.
 * 
 * @example
 * ```typescript
 * @DependentProperty({
 *   dependsOn: "getActiveProgram",
 *   featurePathTemplate: "heating.circuits.N.operating.programs.{program}",
 *   propertyPath: "temperature",
 *   returnType: "number",
 *   condition: "(value) => value && value !== 'standby'",
 *   placeholder: "program",
 * })
 * declare getCurrentDesiredTemperature: number | null;
 * ```
 */
export function DependentProperty(metadata: DependentPropertyMetadata) {
  return function (
    target: object,
    propertyKey: string,
    descriptor?: PropertyDescriptor,
  ) {
    // Store metadata
    const map = getMetadataMap(dependentPropertyStore, target);
    map.set(propertyKey, metadata);

    // Implement getter function that can be used as both property and method
    const getterImpl = function(this: any) {
      // Get the dependent property value - could be a method or a property
      const dependentAccessor = (this)[metadata.dependsOn];
      
      let dependentValue: any;
      if (typeof dependentAccessor === "function") {
        // It's a method, call it
        dependentValue = dependentAccessor.call(this);
      } else {
        // It's a property, access it directly
        dependentValue = dependentAccessor;
      }
      
      if (dependentValue === undefined || dependentValue === null) {
        return null;
      }
      
      // Check condition if provided
      if (metadata.condition) {
        try {
          // Evaluate condition function - using Function constructor is necessary for dynamic conditions
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          const conditionFn = new Function("value", `return ${metadata.condition}`) as (value: unknown) => boolean;
          if (!conditionFn(dependentValue)) {
            return null;
          }
        } catch {
          // If condition evaluation fails, fall back to truthy check
          if (!dependentValue) {
            return null;
          }
        }
      } else if (!dependentValue) {
        return null;
      }
      
      // Build feature path by replacing placeholders
      const placeholder = metadata.placeholder || "value";
      const dependentValueStr = String(dependentValue);
      let featurePath = metadata.featurePathTemplate.replace(`{${placeholder}}`, dependentValueStr);
      
      // Handle instance-specific placeholders like circuitId (N placeholder)
      // Check if this instance has a circuitId property (for HeatingCircuit)
      if (featurePath.includes("N")) {
        const circuitId = (this as { circuitId?: string }).circuitId;
        if (circuitId !== undefined) {
          featurePath = featurePath.replace(/N/g, circuitId);
        }
      }
      
      // Access features - could be on device.features or this.features
      let features = (this as { features?: Map<string, unknown> }).features;
      
      // If features not found on this, try accessing via device property (for HeatingCircuit)
      if (!features && (this as { device?: { features?: Map<string, unknown> } }).device) {
        features = (this as { device: { features?: Map<string, unknown> } }).device.features;
      }
      
      if (!features) {
        return metadata.returnType === "boolean" ? false : null;
      }
      
      const feature = features.get(featurePath) as { isEnabled?: boolean } | undefined;
      if (!feature || !feature.isEnabled) {
        return metadata.returnType === "boolean" ? false : null;
      }
      
      // Get getPropertyValue method - could be on device or this
      type GetPropertyValueFn = <T>(feature: unknown, path: string) => T | null;
      let getPropertyValueFn: GetPropertyValueFn | undefined;
      const thisObj = this as { getPropertyValue?: GetPropertyValueFn; device?: { getPropertyValue?: GetPropertyValueFn } };
      if (thisObj.getPropertyValue) {
        getPropertyValueFn = thisObj.getPropertyValue.bind(thisObj);
      } else if (thisObj.device?.getPropertyValue) {
        getPropertyValueFn = thisObj.device.getPropertyValue.bind(thisObj.device);
      } else {
        return null;
      }
      
      const value = getPropertyValueFn<unknown>(feature, metadata.propertyPath);
      
      if (metadata.returnType === "boolean") {
        return (value === true || value === "on");
      }
      return value;
    };

    // If this is a method (has descriptor), replace the implementation
    if (descriptor && descriptor.value) {
      descriptor.value = getterImpl;
      return;
    }
    
    // If this is a property (no descriptor), implement a synchronous getter
    if (!descriptor) {
      Object.defineProperty(target, propertyKey, {
        get: getterImpl,
        enumerable: true,
        configurable: true,
      });
    }
  };
}

/**
 * Get all methods with discovery metadata from a class instance.
 */
export function getDiscoverableMethods(
  instance: Record<string, unknown>,
): Array<{ methodName: string; metadata: SensorDiscoveryMetadata; method: DiscoverableMethod }> {
  const methods: Array<{ methodName: string; metadata: SensorDiscoveryMetadata; method: DiscoverableMethod }> = [];
   
  const prototype = Object.getPrototypeOf(instance);

  // Get all property names from the prototype chain
  const propertyNames = new Set<string>();
   
  let current: object | null = prototype;
  while (current && current !== Object.prototype) {
    Object.getOwnPropertyNames(current).forEach((name) => {
      if (name !== "constructor" && name.startsWith("get")) {
        propertyNames.add(name);
      }
    });
     
    current = Object.getPrototypeOf(current);
  }

  // Check each property for discovery metadata
  for (const methodName of propertyNames) {
    const method = instance[methodName];
    if (typeof method === "function") {
      const metadata = getDiscoveryMetadata(method as DiscoverableMethod);
      if (metadata) {
        // Bind the method to the instance to preserve 'this' context
        methods.push({
          methodName,
          metadata,
          method: (method as DiscoverableMethod).bind(instance),
        });
      }
    }
  }

  return methods;
}
