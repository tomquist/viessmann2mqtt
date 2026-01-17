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
 * Fuel cell device.
 */
export class FuelCell extends HeatingDevice {
  /**
   * Get available burners.
   */
  getAvailableBurners(): string[] {
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
   * Get fuel cell operating mode.
   */
  @PropertyRetrieval({
    featurePath: "heating.fuelCell.operating.modes.active",
    propertyPath: "value",
    returnType: "string",
  })
  declare getFuelCellOperatingModeActive: string | null;

  /**
   * Get fuel cell power production (today).
   */
  @PropertyRetrieval({
    featurePath: "heating.fuelCell.power.production",
    propertyPath: "day.value[0]",
    returnType: "number",
  })
  declare getFuelCellPowerProductionToday: number | null;

  /**
   * Get fuel cell power production unit.
   */
  @PropertyRetrieval({
    featurePath: "heating.fuelCell.power.production",
    propertyPath: "day.unit",
    returnType: "string",
  })
  declare getFuelCellPowerProductionUnit: string | null;

  /**
   * Get fuel cell current power production.
   */
  @Sensor({
    featurePath: "heating.power.production.current",
    platform: "sensor",
    deviceClass: "power",
    componentKey: "power_production",
  })
  getFuelCellPowerProductionCurrent(): number | null {
    const feature = this.getProperty("heating.power.production.current");
    return this.getPropertyValue<number>(feature, "value");
  }

  /**
   * Get fuel cell current power production unit.
   */
  @PropertyRetrieval({
    featurePath: "heating.power.production.current",
    propertyPath: "value.unit",
    returnType: "string",
  })
  declare getFuelCellPowerProductionCurrentUnit: string | null;

  /**
   * Get fuel cell gas consumption (today).
   */
  @Sensor({
    featurePath: "heating.gas.consumption.fuelCell",
    platform: "sensor",
    deviceClass: "gas",
    valueTemplate: "{{ value_json.properties.day.value[0] }}",
    componentKey: "fuelcell_gas_consumption",
  })
  getFuelCellGasConsumptionToday(): number | null {
    const feature = this.getProperty(
      "heating.gas.consumption.fuelCell",
    );
    const days = this.getPropertyValue<number[]>(feature, "day.value");
    return days && days.length > 0 ? days[0] : null;
  }

  /**
   * Generate time-based sensors for fuel cell gas consumption (week, month, year).
   * The decorator handles component generation - this property is never accessed.
   */
  @TimeBasedSensor({
    featurePath: "heating.gas.consumption.fuelCell",
    baseComponentKey: "fuelcell_gas_consumption",
    deviceClass: "gas",
    dayValueTemplate: "{{ value_json.properties.day.value[0] }}",
  })
  declare _generateFuelCellGasConsumptionTimeBased: Record<string, { platform: string; unique_id?: string; [key: string]: any }>;

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
   * Get fuel cell gas consumption unit.
   */
  @PropertyRetrieval({
    featurePath: "heating.gas.consumption.fuelCell",
    propertyPath: "day.unit",
    returnType: "string",
  })
  declare getFuelCellGasConsumptionUnit: string | null;

  /**
   * Get power consumption (today).
   */
  @PropertyRetrieval({
    featurePath: "heating.power.consumption.total",
    propertyPath: "day.value[0]",
    returnType: "number",
  })
  declare getPowerConsumptionToday: number | null;

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
