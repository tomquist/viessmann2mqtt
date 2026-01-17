import { Device as DeviceModel, Feature } from "../models.js";
import { generateTimeBasedComponents, normalizeUnit } from "./homeassistant-utils.js";
import { getComplexComponentProperties } from "./discovery.js";

export interface DeviceAccessor {
  installationId: number;
  gatewayId: string;
  deviceId: string;
}

export type { DeviceModel };

/**
 * Base class for all devices.
 * Provides access to feature properties.
 * Devices receive all data via dependency injection - they do not fetch data themselves.
 */
export abstract class Device {
  protected readonly accessor: DeviceAccessor;

  protected readonly roles: string[];

  protected readonly deviceModel: DeviceModel;

  /**
   * Features injected via constructor.
   * Maps feature path to Feature object.
   */
  private readonly features: Map<string, Feature>;

  constructor(
    accessor: DeviceAccessor,
    roles: string[],
    deviceModel: DeviceModel,
    features: Feature[],
  ) {
    this.accessor = accessor;
    this.roles = roles;
    this.deviceModel = deviceModel;
    
    // Build feature map from provided features
    this.features = new Map<string, Feature>();
    for (const feature of features) {
      this.features.set(feature.feature, feature);
    }
  }

  /**
   * Get a feature property from the injected features.
   * Returns null if the feature is not available or not enabled.
   * Synchronous since features are already cached.
   */
  protected getProperty(propertyName: string): Feature | null {
    const feature = this.features.get(propertyName);
    if (feature === undefined) {
      // Feature not found means it doesn't exist
      return null;
    }
    
    return feature.isEnabled ? feature : null;
  }

  /**
   * Get a property value from a feature.
   * Returns null if the property doesn't exist.
   */
  protected getPropertyValue<T>(
    feature: Feature | null,
    propertyPath: string,
  ): T | null {
    if (!feature) {
      return null;
    }

    const parts = propertyPath.split(".");
     
    let current: any = feature.properties;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return null;
      }
      if (typeof current !== "object") {
        return null;
      }
      if (current[part] === undefined) {
        return null;
      }
       
      current = current[part];
    }

    // If we ended up with an object that has a "value" property, return that
    if (current && typeof current === "object" && "value" in current) {
       
      return current.value as T;
    }

    return current as T;
  }

  /**
   * Check if the device has specific roles.
   */
  protected hasRoles(roles: string[]): boolean {
    if (roles.length === 0) {
      return false;
    }
    return roles.every((role) => this.roles.includes(role));
  }

  /**
   * Get device serial number.
   */
  getSerial(): string | null {
    const feature = this.getProperty("device.serial");
    return this.getPropertyValue<string>(feature, "value");
  }

  /**
   * Get device model ID.
   */
  getModelId(): string {
    return this.deviceModel.modelId;
  }


  /**
   * Generate Home Assistant component configurations for this device.
   * This method can be overridden by subclasses to provide device-specific components.
   * Most components are now generated via decorators, so this typically returns empty.
   * 
   * @param baseTopic - MQTT base topic
   * @param installationId - Installation ID
   * @param gatewayId - Gateway ID
   * @param deviceId - Device ID
   * @param decoratedFeaturePaths - Set of feature paths already handled by decorators
   * @param features - Optional pre-fetched features array to avoid redundant API calls
   * @returns Record of component configurations keyed by component key
   */
  generateHomeAssistantComponents(
    baseTopic: string,
    installationId: number,
    gatewayId: string,
    deviceId: string,
    _decoratedFeaturePaths: Set<string>,
    features: Feature[],
  ): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
    const components: Record<string, { platform: string; unique_id?: string; [key: string]: any }> = {};
    
    // Process time-based sensors (generic, available to all devices)
    Object.assign(components, this.generateTimeBasedSensorComponents(baseTopic, installationId, gatewayId, deviceId, features));
    
    return components;
  }

  /**
   * Generate time-based sensor components for this device.
   * Uses the @TimeBasedSensor decorator metadata to generate week/month/year sensors.
   * This is generic functionality available to all device types.
   */
  protected generateTimeBasedSensorComponents(
    baseTopic: string,
    installationId: number,
    gatewayId: string,
    deviceId: string,
    features: Feature[],
  ): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
    const components: Record<string, { platform: string; unique_id?: string; [key: string]: any }> = {};
    const complexProperties = getComplexComponentProperties(this);

    for (const { metadata } of complexProperties.timeBasedSensors) {
      const feature = features.find((f: Feature) => f.feature === metadata.featurePath && f.isEnabled);
      if (!feature) continue;

      // Check if we have a day value (could be in day.value array or currentDay.value)
      const dayValue = (feature.properties?.day as { value?: number[] } | undefined)?.value;
      const currentDayValue = (feature.properties?.currentDay as { value?: number } | undefined)?.value;
      if ((!dayValue || dayValue.length === 0) && currentDayValue === undefined) continue;

      // Determine unit and device class from day or currentDay property
      const dayUnit = (feature.properties?.day as { unit?: string } | undefined)?.unit;
      const currentDayUnit = (feature.properties?.currentDay as { unit?: string } | undefined)?.unit;
      const unit = dayUnit || currentDayUnit;
      
      let deviceClass = metadata.deviceClass;
      let normalizedUnit = metadata.unitOfMeasurement;

      if (unit) {
        const unitLower = unit.toLowerCase();
        if (unitLower.includes("kilowatthour") || unitLower.includes("watthour") || unitLower.includes("megawatthour")) {
          deviceClass = "energy";
          normalizedUnit = normalizeUnit(unit, "energy");
        } else if (unitLower.includes("cubicmeter") || unitLower.includes("m³")) {
          deviceClass = undefined;
          normalizedUnit = normalizeUnit(unit) || "m³";
        } else {
          normalizedUnit = normalizeUnit(unit) || unit;
        }
      }

      const baseComponent = {
        device_class: deviceClass,
        unit_of_measurement: normalizedUnit,
      };

      const timeComponents = generateTimeBasedComponents(
        metadata.featurePath,
        feature,
        metadata.baseComponentKey,
        baseComponent,
        installationId,
        gatewayId,
        deviceId,
        baseTopic,
      );

      Object.assign(components, timeComponents);
    }

    return components;
  }


  /**
   * Detect device class and unit of measurement for a feature based on its path and properties.
   * This method can be overridden by device subclasses to provide custom detection logic.
   * 
   * @param featurePath - The feature path (e.g., "heating.sensors.temperature.outside")
   * @param propertyPath - The property path (e.g., "value.value", "strength.value")
   * @param properties - The feature properties object
   * @returns Object with deviceClass and unitOfMeasurement, or undefined for both
   */
  detectDeviceClassAndUnit(
    featurePath: string,
    propertyPath: string,
    properties: Record<string, unknown>,
  ): { deviceClass?: string; unitOfMeasurement?: string } {
    // Base implementation provides generic detection logic
    // Subclasses can override for device-specific logic
    return this.detectDeviceClassAndUnitGeneric(featurePath, propertyPath, properties);
  }

  /**
   * Generic device class and unit detection logic.
   * This is the default implementation that can be called by device subclasses.
   */
  protected detectDeviceClassAndUnitGeneric(
    featurePath: string,
    propertyPath: string,
    properties: Record<string, unknown>,
  ): { deviceClass?: string; unitOfMeasurement?: string } {
    let deviceClass: string | undefined;
    let unitOfMeasurement: string | undefined;

    // First, check if the property itself has unit "percent" or "percentage"
    const detectedPropKey = propertyPath.split(".")[0];
    if (properties[detectedPropKey] && typeof properties[detectedPropKey] === "object") {
      const prop = properties[detectedPropKey] as Record<string, unknown>;
      if ("unit" in prop) {
        const unit = prop.unit as string;
        const unitLower = unit.toLowerCase();
        if (unitLower === "percent" || unitLower === "percentage") {
          // Value is already in percentage format (0-100), expose as percentage
          return { unitOfMeasurement: "%" };
        }
      }
    }
    
    // Also check other properties for percentage units (in case propertyPath doesn't match)
    for (const propKey of Object.keys(properties)) {
      if (properties[propKey] && typeof properties[propKey] === "object") {
        const prop = properties[propKey] as Record<string, unknown>;
        if ("unit" in prop && "value" in prop) {
          const unit = prop.unit as string;
          const unitLower = unit.toLowerCase();
          if (unitLower === "percent" || unitLower === "percentage") {
            // Value is already in percentage format (0-100), expose as percentage
            return { unitOfMeasurement: "%" };
          }
        }
      }
    }

    // Check feature path for device class and unit hints
    if (featurePath.includes("temperature")) {
      deviceClass = "temperature";
      unitOfMeasurement = "°C";
    } else if (featurePath.includes("wifi") && propertyPath.includes("strength")) {
      // WiFi signal strength (RSSI) - measured in dBm
      deviceClass = "signal_strength";
      unitOfMeasurement = "dBm";
    } else if (featurePath.includes("rssi") || (propertyPath.includes("strength") && featurePath.includes("signal"))) {
      // RSSI or signal strength - measured in dBm
      deviceClass = "signal_strength";
      unitOfMeasurement = "dBm";
    } else if (featurePath.includes("pressure")) {
      deviceClass = "pressure";
      // Try to get unit from the detected property or any property with a unit
      let foundUnit = false;
      const pressurePropKey = propertyPath.split(".")[0];
      if (properties[pressurePropKey] && typeof properties[pressurePropKey] === "object") {
        const prop = properties[pressurePropKey] as Record<string, unknown>;
        if ("unit" in prop) {
          const unit = prop.unit as string;
          const normalizedUnit = normalizeUnit(unit, deviceClass);
          if (normalizedUnit) {
            unitOfMeasurement = normalizedUnit;
            foundUnit = true;
          } else if (deviceClass === "pressure") {
            unitOfMeasurement = "bar";
            foundUnit = true;
          }
        }
      }
      // If not found in detected property, check other properties
      if (!foundUnit) {
        const propsKeys = Object.keys(properties);
        for (const key of propsKeys) {
          if (properties[key] && typeof properties[key] === "object") {
            const prop = properties[key] as Record<string, unknown>;
            if ("unit" in prop) {
              const unit = prop.unit as string;
              const normalizedUnit = normalizeUnit(unit, deviceClass);
              if (normalizedUnit) {
                unitOfMeasurement = normalizedUnit;
                foundUnit = true;
                break;
              } else if (deviceClass === "pressure") {
                unitOfMeasurement = "bar";
                foundUnit = true;
                break;
              }
            }
          }
        }
      }
      // If still no unit found, use default bar for pressure sensors
      if (!foundUnit) {
        unitOfMeasurement = "bar";
      }
    } else if (featurePath.includes("consumption")) {
      if (featurePath.includes("gas")) {
        // Gas consumption - check unit to determine device class
        if (properties.day && typeof properties.day === "object" && "unit" in properties.day) {
          const unit = (properties.day as Record<string, unknown>).unit as string;
          const unitLower = unit.toLowerCase();
          if (unitLower.includes("kilowatthour") || unitLower.includes("watthour")) {
            deviceClass = "energy";
            unitOfMeasurement = normalizeUnit(unit, "energy") || "kWh";
          } else {
            unitOfMeasurement = normalizeUnit(unit) || "m³";
          }
        }
      } else if (featurePath.includes("power")) {
        deviceClass = "energy";
        // Check multiple possible property paths for unit: day, currentDay, value, etc.
        let foundUnit = false;
        const unitPropertyKeys = ["day", "currentDay", "value", "week", "month", "year"];
        for (const key of unitPropertyKeys) {
          if (properties[key] && typeof properties[key] === "object" && "unit" in properties[key]) {
            const unit = (properties[key] as Record<string, unknown>).unit as string;
            const normalizedUnit = normalizeUnit(unit, "energy");
            if (normalizedUnit) {
              unitOfMeasurement = normalizedUnit;
              foundUnit = true;
              break;
            }
          }
        }
        // If no unit found, use default kWh for energy sensors
        if (!foundUnit) {
          unitOfMeasurement = "kWh";
        }
      }
    } else if (featurePath.includes("production")) {
      if (featurePath.includes("power")) {
        deviceClass = "power";
        // Try to get unit from the detected property
        const powerPropKey = propertyPath.split(".")[0];
        if (properties[powerPropKey] && typeof properties[powerPropKey] === "object") {
          const prop = properties[powerPropKey] as Record<string, unknown>;
          if ("unit" in prop) {
            const unit = prop.unit as string;
            unitOfMeasurement = normalizeUnit(unit) || "W";
          }
        }
      } else if (featurePath.includes("heat")) {
        deviceClass = "energy";
        // Check multiple possible property paths for unit: day, currentDay, value, etc.
        let foundUnit = false;
        const unitPropertyKeys = ["day", "currentDay", "value", "week", "month", "year"];
        for (const key of unitPropertyKeys) {
          if (properties[key] && typeof properties[key] === "object" && "unit" in properties[key]) {
            const unit = (properties[key] as Record<string, unknown>).unit as string;
            const normalizedUnit = normalizeUnit(unit, "energy");
            if (normalizedUnit) {
              unitOfMeasurement = normalizedUnit;
              foundUnit = true;
              break;
            }
          }
        }
        // If no unit found, use default kWh for energy sensors
        if (!foundUnit) {
          unitOfMeasurement = "kWh";
        }
      }
    }

    // Fallback: If no device class was detected but we have a property with a unit,
    // extract and normalize the unit anyway (for sensors like volumetricFlow)
    if (!unitOfMeasurement) {
      const detectedPropKey = propertyPath.split(".")[0];
      if (properties[detectedPropKey] && typeof properties[detectedPropKey] === "object") {
        const prop = properties[detectedPropKey] as Record<string, unknown>;
        if ("unit" in prop) {
          const unit = prop.unit as string;
          const normalizedUnit = normalizeUnit(unit);
          if (normalizedUnit) {
            unitOfMeasurement = normalizedUnit;
          }
        }
      }
      // If still no unit found, check other properties
      if (!unitOfMeasurement) {
        for (const propKey of Object.keys(properties)) {
          if (properties[propKey] && typeof properties[propKey] === "object") {
            const prop = properties[propKey] as Record<string, unknown>;
            if ("unit" in prop && "value" in prop) {
              const unit = prop.unit as string;
              const normalizedUnit = normalizeUnit(unit);
              if (normalizedUnit) {
                unitOfMeasurement = normalizedUnit;
                break;
              }
            }
          }
        }
      }
    }

    return { deviceClass, unitOfMeasurement };
  }

  /**
   * Check if a feature path represents a list feature that should be excluded from publishing.
   * List features are containers for individual items and should not be published to MQTT.
   * 
   * @param featurePath - The feature path to check (e.g., "heating.burners", "heating.circuits.0")
   * @returns true if the feature is a list container that should be excluded
   */
  static isListFeature(featurePath: string): boolean {
    // Known list feature patterns that end with just the list name
    // These are containers for individual items (e.g., heating.burners.0, heating.circuits.0)
    const listPatterns = [
      /^heating\.burners$/,                    // heating.burners (list)
      /^heating\.circuits$/,                   // heating.circuits (list)
      /^heating\.compressors$/,                // heating.compressors (list)
      /^device\.serial\.internalComponents$/,  // device.serial.internalComponents (list)
      /^fuelCell\.errors\.raw$/,               // fuelCell.errors.raw (list)
      /^gateway\.devices$/,                    // gateway.devices (list)
    ];
    
    // Check if the feature path matches any list pattern
    // Individual items like "heating.burners.0" or "heating.circuits.0" should NOT match
    return listPatterns.some(pattern => pattern.test(featurePath));
  }
}
