import { HeatingDevice } from "./heating.js";
import { BurnerSensor, PropertyRetrieval, Sensor, TimeBasedSensor, getComplexComponentProperties } from "./discovery.js";
import {
  getFeatureName,
  normalizeUnit,
  percentageValueTemplate,
  safeValueTemplate,
} from "./homeassistant-utils.js";
import { Feature } from "../models.js";

/**
 * Gas boiler device.
 */
export class GazBoiler extends HeatingDevice {
  /**
   * Get available burners.
   */
  getAvailableBurners(): string[] {
    // Try to find available burners by checking each possible burner index
    const burners: string[] = [];
    for (let i = 0; i <= 5; i++) {
      const feature = this.getProperty(`heating.burners.${i}`);
      if (feature && feature.isEnabled) {
        burners.push(i.toString());
      }
    }
    return burners;
  }

  /**
   * Get boiler temperature.
   */
  @Sensor({
    featurePath: "heating.boiler.sensors.temperature.main",
    platform: "sensor",
    deviceClass: "temperature",
    unitOfMeasurement: "°C",
    componentKey: "boiler_temp",
  })
  getBoilerTemperature(): number | null {
    const feature = this.getProperty(
      "heating.boiler.sensors.temperature.main",
    );
    return this.getPropertyValue<number>(feature, "value");
  }

  /**
   * Get boiler target temperature.
   */
  @PropertyRetrieval({
    featurePath: "heating.boiler.temperature",
    propertyPath: "value",
    returnType: "number",
  })
  declare getBoilerTargetTemperature: number | null;

  /**
   * Get gas consumption for heating (today).
   * Note: Device class is set dynamically based on unit (energy for kWh, volume for m³).
   */
  @Sensor({
    featurePath: "heating.gas.consumption.heating",
    platform: "sensor",
    // deviceClass will be set dynamically based on unit
    valueTemplate: "{{ value_json.properties.day.value[0] }}",
    componentKey: "gas_consumption",
  })
  getGasConsumptionHeatingToday(): number | null {
    const feature = this.getProperty("heating.gas.consumption.heating");
    const days = this.getPropertyValue<number[]>(feature, "day.value");
    return days && days.length > 0 ? days[0] : null;
  }

  /**
   * Generate time-based sensors for gas consumption (week, month, year).
   * The decorator handles component generation - this property is never accessed.
   */
  @TimeBasedSensor({
    featurePath: "heating.gas.consumption.heating",
    baseComponentKey: "gas_consumption",
    dayValueTemplate: "{{ value_json.properties.day.value[0] }}",
  })
  declare _generateGasConsumptionTimeBased: Record<string, { platform: string; unique_id?: string; [key: string]: any }>;

  /**
   * Get gas consumption unit for heating.
   */
  @PropertyRetrieval({
    featurePath: "heating.gas.consumption.heating",
    propertyPath: "day.unit",
    returnType: "string",
  })
  declare getGasConsumptionHeatingUnit: string | null;

  /**
   * Get gas consumption for domestic hot water (today).
   */
  @PropertyRetrieval({
    featurePath: "heating.gas.consumption.dhw",
    propertyPath: "day.value[0]",
    returnType: "number",
  })
  declare getGasConsumptionDomesticHotWaterToday: number | null;

  /**
   * Get power consumption (today).
   */
  @Sensor({
    featurePath: "heating.power.consumption.total",
    platform: "sensor",
    deviceClass: "energy",
    valueTemplate: "{{ value_json.properties.day.value[0] }}",
    componentKey: "power_consumption",
  })
  @PropertyRetrieval({
    featurePath: "heating.power.consumption.total",
    propertyPath: "day.value[0]",
    returnType: "number",
  })
  declare getPowerConsumptionToday: number | null;

  /**
   * Generate time-based sensors for power consumption (week, month, year).
   * The decorator handles component generation - this property is never accessed.
   */
  @TimeBasedSensor({
    featurePath: "heating.power.consumption.total",
    baseComponentKey: "power_consumption",
    deviceClass: "energy",
    dayValueTemplate: "{{ value_json.properties.day.value[0] }}",
  })
  declare _generatePowerConsumptionTimeBased: Record<string, { platform: string; unique_id?: string; [key: string]: any }>;

  /**
   * Get power consumption unit.
   */
  @PropertyRetrieval({
    featurePath: "heating.power.consumption.total",
    propertyPath: "day.unit",
    returnType: "string",
  })
  declare getPowerConsumptionUnit: string | null;

  /**
   * Get supply pressure.
   */
  @Sensor({
    featurePath: "heating.sensors.pressure.supply",
    platform: "sensor",
    deviceClass: "pressure",
    componentKey: "supply_pressure",
  })
  @PropertyRetrieval({
    featurePath: "heating.sensors.pressure.supply",
    propertyPath: "value",
    returnType: "number",
  })
  declare getSupplyPressure: number | null;

  /**
   * Get supply pressure unit.
   */
  @PropertyRetrieval({
    featurePath: "heating.sensors.pressure.supply",
    propertyPath: "value.unit",
    returnType: "string",
  })
  declare getSupplyPressureUnit: string | null;

  /**
   * Get total burner modulation.
   */
  @Sensor({
    featurePath: "heating.burners.modulation.total",
    platform: "sensor",
    unitOfMeasurement: "%",
    componentKey: "burner_modulation_total",
  })
  @PropertyRetrieval({
    featurePath: "heating.burners.modulation.total",
    propertyPath: "value",
    returnType: "number",
  })
  declare getBurnerModulationTotal: number | null;

  /**
   * Generate burner statistics sensors (hours) (declarative decorator).
   * The decorator handles component generation - this property is never accessed.
   */
  @BurnerSensor({
    featurePathTemplate: "heating.burners.N.statistics",
    platform: "sensor",
    propertyPath: "hours.value",
    unitOfMeasurement: "h",
    componentKeyTemplate: "burner_{id}_hours",
    getAvailableItemsMethod: "getAvailableBurners",
    displayNameTemplate: "Burner {number} Operating Hours",
  })
  declare _generateBurnerHours: Record<string, { platform: string; unique_id?: string; [key: string]: any }>;

  /**
   * Generate burner statistics sensors (starts) (declarative decorator).
   * The decorator handles component generation - this property is never accessed.
   */
  @BurnerSensor({
    featurePathTemplate: "heating.burners.N.statistics",
    platform: "sensor",
    propertyPath: "starts.value",
    componentKeyTemplate: "burner_{id}_starts",
    getAvailableItemsMethod: "getAvailableBurners",
    displayNameTemplate: "Burner {number} Starts",
    valueTemplate: "{{ value_json.properties.starts.value | int }}",
  })
  declare _generateBurnerStarts: Record<string, { platform: string; unique_id?: string; [key: string]: any }>;

  /**
   * Generate burner modulation sensors (declarative decorator).
   * The decorator handles component generation - this property is never accessed.
   */
  @BurnerSensor({
    featurePathTemplate: "heating.burners.N.modulation",
    platform: "sensor",
    propertyPath: "value.value",
    unitOfMeasurement: "%",
    componentKeyTemplate: "burner_{id}_modulation",
    getAvailableItemsMethod: "getAvailableBurners",
    displayNameTemplate: "Burner {number} Modulation",
    valueTemplate: percentageValueTemplate("value.value"),
  })
  declare _generateBurnerModulation: Record<string, { platform: string; unique_id?: string; [key: string]: any }>;

  /**
   * Generate burner demand modulation sensors (declarative decorator).
   * The decorator handles component generation - this property is never accessed.
   */
  @BurnerSensor({
    featurePathTemplate: "heating.burners.N.demand.modulation",
    platform: "sensor",
    propertyPath: "value.value",
    unitOfMeasurement: "%",
    componentKeyTemplate: "burner_{id}_demand_modulation",
    getAvailableItemsMethod: "getAvailableBurners",
    displayNameTemplate: "Burner {number} Demand Modulation",
    valueTemplate: percentageValueTemplate("value.value"),
  })
  declare _generateBurnerDemandModulation: Record<string, { platform: string; unique_id?: string; [key: string]: any }>;



  /**
   * Generate Home Assistant component configurations for this device.
   * Automatically processes all decorators including burner sensors.
   */
  override generateHomeAssistantComponents(
    baseTopic: string,
    installationId: number,
    gatewayId: string,
    deviceId: string,
    decoratedFeaturePaths: Set<string>,
    features: Feature[],
  ): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
    const components = super.generateHomeAssistantComponents(baseTopic, installationId, gatewayId, deviceId, decoratedFeaturePaths, features);
    
    // Add burner sensor components
    Object.assign(components, this.generateBurnerSensorComponents(baseTopic, installationId, gatewayId, deviceId, features));
    
    return components;
  }

  /**
   * Generate burner sensor components for this device.
   * Uses the @BurnerSensor decorator metadata to generate sensors for each burner.
   */
  private generateBurnerSensorComponents(
    baseTopic: string,
    installationId: number,
    gatewayId: string,
    deviceId: string,
    features: Feature[],
  ): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
    const components: Record<string, { platform: string; unique_id?: string; [key: string]: any }> = {};
    const complexProperties = getComplexComponentProperties(this);

    for (const { metadata } of complexProperties.burnerSensors) {
      const getAvailableItems = (this as any)[metadata.getAvailableItemsMethod];
      const availableItems = typeof getAvailableItems === "function" 
        ? getAvailableItems.call(this) as string[]
        : (getAvailableItems as string[]);
      
      for (const itemId of availableItems) {
        const featurePath = metadata.featurePathTemplate.replace(/N/g, itemId);
        const feature = features.find((f: Feature) => f.feature === featurePath && f.isEnabled);
        if (!feature) continue;

        // Check if the property exists
        const propertyParts = metadata.propertyPath.split(".");
        let propertyValue: any = feature.properties;
        for (const part of propertyParts) {
          if (propertyValue === null || propertyValue === undefined || typeof propertyValue !== "object") {
            propertyValue = null;
            break;
          }
          propertyValue = propertyValue[part];
        }
        if (propertyValue === null || propertyValue === undefined) continue;

        const componentKey = metadata.componentKeyTemplate.replace(/{id}/g, itemId);
        const burnerNumber = parseInt(itemId, 10) + 1;
        let displayName = metadata.displayNameTemplate.replace(/{number}/g, burnerNumber.toString());
        
        // Try to get a better name from feature path if it contains modulation
        if (metadata.featurePathTemplate.includes("modulation")) {
          const normalizedPath = metadata.featurePathTemplate.replace(/N/g, "N");
          const baseName = getFeatureName(normalizedPath);
          if (baseName && baseName !== "Sensor") {
            displayName = `Burner ${burnerNumber} ${baseName}`;
          }
        }

        const valueTemplate = metadata.valueTemplate || safeValueTemplate(metadata.propertyPath);

        components[componentKey] = {
          platform: metadata.platform,
          unique_id: `viessmann_${installationId}_${gatewayId}_${deviceId}_${componentKey}`,
          name: displayName,
          state_topic: `${baseTopic}/installations/${installationId}/gateways/${gatewayId}/devices/${deviceId}/features/${featurePath}`,
          value_template: valueTemplate,
        };

        if (metadata.deviceClass) {
          components[componentKey].device_class = metadata.deviceClass;
        }
        if (metadata.unitOfMeasurement) {
          const normalizedUnit = normalizeUnit(metadata.unitOfMeasurement, metadata.deviceClass);
          if (normalizedUnit) {
            components[componentKey].unit_of_measurement = normalizedUnit;
          }
        }

        // Add state_class for total_increasing sensors (like starts)
        if (metadata.propertyPath.includes("starts")) {
          components[componentKey].state_class = "total_increasing";
        }
      }
    }

    return components;
  }
}
