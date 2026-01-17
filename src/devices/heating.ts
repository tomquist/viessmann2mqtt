import { Device } from "./base.js";
import { Feature } from "../models.js";
import { CircuitClimate, CircuitSensor, DependentProperty, HeatingCurve, PropertyRetrieval, Sensor, getComplexComponentProperties } from "./discovery.js";
import {
  generateModeMappingTemplate,
  getFeatureName,
  mapViessmannModesToHomeAssistant,
  normalizeUnit,
  safeValueTemplate,
} from "./homeassistant-utils.js";

/**
 * Base class for all heating devices.
 * Provides common heating-related functionality.
 */
export class HeatingDevice extends Device {
  /**
   * Get outside temperature sensor reading.
   */
  @Sensor({
    featurePath: "heating.sensors.temperature.outside",
    platform: "sensor",
    deviceClass: "temperature",
    unitOfMeasurement: "°C",
    componentKey: "outside_temp",
  })
  getOutsideTemperature(): number | null {
    const feature = this.getProperty(
      "heating.sensors.temperature.outside",
    );
    return this.getPropertyValue<number>(feature, "value");
  }

  /**
   * Get return temperature sensor reading.
   */
  @Sensor({
    featurePath: "heating.sensors.temperature.return",
    platform: "sensor",
    deviceClass: "temperature",
    unitOfMeasurement: "°C",
    componentKey: "return_temp",
  })
  getReturnTemperature(): number | null {
    const feature = this.getProperty(
      "heating.sensors.temperature.return",
    );
    return this.getPropertyValue<number>(feature, "value");
  }

  /**
   * Get available heating circuits.
   */
  getAvailableCircuits(): string[] {
    const feature = this.getProperty("heating.circuits");
    return this.getPropertyValue<string[]>(feature, "enabled") || [];
  }

  /**
   * Get domestic hot water storage temperature.
   */
  @Sensor({
    featurePath: "heating.dhw.sensors.temperature.dhwCylinder",
    platform: "sensor",
    deviceClass: "temperature",
    unitOfMeasurement: "°C",
    componentKey: "dhw_storage_temp",
  })
  getDomesticHotWaterStorageTemperature(): number | null {
    const feature = this.getProperty(
      "heating.dhw.sensors.temperature.dhwCylinder",
    );
    return this.getPropertyValue<number>(feature, "value");
  }

  /**
   * Get domestic hot water active status.
   */
  @Sensor({
    featurePath: "heating.dhw",
    platform: "binary_sensor",
    deviceClass: "heat",
    valueTemplate: "{{ value_json.properties.active.value }}",
    componentKey: "dhw",
  })
  getDomesticHotWaterActive(): boolean | null {
    const feature = this.getProperty("heating.dhw");
    const status = this.getPropertyValue<string>(feature, "status");
    return status === "on";
  }


  /**
   * Check if device has domestic hot water capability.
   */
  @PropertyRetrieval({
    featurePath: "heating.dhw",
    propertyPath: "active",
    returnType: "boolean",
  })
  declare isDomesticHotWaterDevice: boolean;

  /**
   * Check if device has solar thermal capability.
   */
  @PropertyRetrieval({
    featurePath: "heating.solar",
    propertyPath: "active",
    returnType: "boolean",
  })
  declare isSolarThermalDevice: boolean;

  /**
   * Circuit room temperature sensor (declarative decorator).
   * The decorator handles component generation - this property is never accessed.
   */
  @CircuitSensor({
    featurePathTemplate: "heating.circuits.N.sensors.temperature.room",
    platform: "sensor",
    deviceClass: "temperature",
    unitOfMeasurement: "°C",
    componentKeyTemplate: "circuit_{id}_room_temp",
    getAvailableItemsMethod: "getAvailableCircuits",
  })
  declare _generateCircuitRoomTemp: Record<string, { platform: string; unique_id?: string; [key: string]: any }>;

  /**
   * Circuit supply temperature sensor (declarative decorator).
   * The decorator handles component generation - this property is never accessed.
   */
  @CircuitSensor({
    featurePathTemplate: "heating.circuits.N.sensors.temperature.supply",
    platform: "sensor",
    deviceClass: "temperature",
    unitOfMeasurement: "°C",
    componentKeyTemplate: "circuit_{id}_supply_temp",
    getAvailableItemsMethod: "getAvailableCircuits",
  })
  declare _generateCircuitSupplyTemp: Record<string, { platform: string; unique_id?: string; [key: string]: any }>;

  /**
   * Circuit climate entity (declarative decorator).
   * The decorator handles component generation - this property is never accessed.
   */
  @CircuitClimate({
    featurePathTemplate: "heating.circuits.N.operating.modes.active",
    getAvailableItemsMethod: "getAvailableCircuits",
    getNameMethod: "getName",
    componentKeyTemplate: "circuit_{id}",
    componentBuilder: ({ itemId, featurePath, componentKey, baseTopic, installationId, gatewayId, deviceId, circuit }) => {
      // Check if we have modes and desired temperature
      const viessmannModes = circuit.getModes;
      const desiredTemp = circuit.getCurrentDesiredTemperature;
      if (viessmannModes.length === 0 || desiredTemp === null) return null;

      const haModes = mapViessmannModesToHomeAssistant(viessmannModes);
      if (haModes.length === 0) return null;

      const circuitName = circuit.getName;
      const circuitNumber = parseInt(itemId, 10) + 1;
      const displayName = circuitName || `Circuit ${circuitNumber}`;

      return {
        [componentKey]: {
          platform: "climate",
          unique_id: `viessmann_${installationId}_${gatewayId}_${deviceId}_${componentKey}`,
          name: displayName,
          state_topic: `${baseTopic}/installations/${installationId}/gateways/${gatewayId}/devices/${deviceId}/features/${featurePath}`,
          current_temperature_topic: `${baseTopic}/installations/${installationId}/gateways/${gatewayId}/devices/${deviceId}/features/heating.circuits.${itemId}.sensors.temperature.room`,
          current_temperature_template: safeValueTemplate("value.value"),
          mode_state_topic: `${baseTopic}/installations/${installationId}/gateways/${gatewayId}/devices/${deviceId}/features/${featurePath}`,
          mode_state_template: generateModeMappingTemplate(),
          modes: haModes,
        },
      };
    },
  })
  declare _generateCircuitClimate: Record<string, { platform: string; unique_id?: string; [key: string]: any }>;

  /**
   * Heating curve sensors (declarative decorator).
   * The decorator handles component generation - this property is never accessed.
   */
  @HeatingCurve({
    featurePathTemplate: "heating.circuits.N.heating.curve",
    getAvailableItemsMethod: "getAvailableCircuits",
    componentKeyTemplate: "circuit_{id}_heating_curve",
  })
  declare _generateHeatingCurve: Record<string, { platform: string; unique_id?: string; [key: string]: any }>;

  /**
   * Generate Home Assistant component configurations for this device.
   * Automatically processes all decorators (@CircuitSensor, @CircuitClimate, @HeatingCurve, @TimeBasedSensor)
   * to generate components declaratively.
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
    
    // Process heating-specific decorator-based components declaratively
    Object.assign(components, this.generateCircuitSensorComponents(baseTopic, installationId, gatewayId, deviceId, features));
    Object.assign(components, this.generateCircuitClimateComponents(baseTopic, installationId, gatewayId, deviceId, features));
    Object.assign(components, this.generateHeatingCurveComponents(baseTopic, installationId, gatewayId, deviceId, features));
    
    return components;
  }

  /**
   * Generic helper to generate components from metadata with item iteration.
   * Makes component generation declarative by separating iteration logic from component building.
   */
  private generateComponentsFromMetadata<T extends { featurePathTemplate: string; componentKeyTemplate: string; getAvailableItemsMethod: string }>(
    metadataList: Array<{ metadata: T }>,
    baseTopic: string,
    installationId: number,
    gatewayId: string,
    deviceId: string,
    features: Feature[],
    componentBuilder: (params: {
      metadata: T;
      itemId: string;
      featurePath: string;
      feature: Feature;
      componentKey: string;
      baseTopic: string;
      installationId: number;
      gatewayId: string;
      deviceId: string;
    }) => Record<string, { platform: string; unique_id?: string; [key: string]: any }> | null,
  ): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
    const components: Record<string, { platform: string; unique_id?: string; [key: string]: any }> = {};
    
    for (const { metadata } of metadataList) {
      const getAvailableItems = (this as any)[metadata.getAvailableItemsMethod];
      const availableItems = typeof getAvailableItems === "function" 
        ? getAvailableItems.call(this) as string[]
        : (getAvailableItems as string[]);
      
      for (const itemId of availableItems) {
        const featurePath = metadata.featurePathTemplate.replace(/N/g, itemId);
        const feature = features.find((f: Feature) => f.feature === featurePath && f.isEnabled);
        if (!feature) continue;

        const componentKey = metadata.componentKeyTemplate.replace(/{id}/g, itemId);
        const itemComponents = componentBuilder({
          metadata,
          itemId,
          featurePath,
          feature,
          componentKey,
          baseTopic,
          installationId,
          gatewayId,
          deviceId,
        });
        
        if (itemComponents) {
          Object.assign(components, itemComponents);
        }
      }
    }
    
    return components;
  }

  /**
   * Generate circuit climate components for this device.
   * Uses the @CircuitClimate decorator metadata to generate climate entities for each circuit.
   * Component generation is fully declarative - the builder function is stored in the decorator metadata.
   */
  private generateCircuitClimateComponents(
    baseTopic: string,
    installationId: number,
    gatewayId: string,
    deviceId: string,
    features: Feature[],
  ): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
    const complexProperties = getComplexComponentProperties(this);
    
    return this.generateComponentsFromMetadata(
      complexProperties.circuitClimates,
      baseTopic,
      installationId,
      gatewayId,
      deviceId,
      features,
      ({ metadata, itemId, featurePath, componentKey, baseTopic, installationId, gatewayId, deviceId }) => {
        const circuit = new HeatingCircuit(this, itemId);
        
        // Use the declarative component builder from metadata
        return metadata.componentBuilder({
          itemId,
          featurePath,
          componentKey,
          baseTopic,
          installationId,
          gatewayId,
          deviceId,
          circuit: {
            getName: circuit.getName,
            getModes: circuit.getModes,
            getCurrentDesiredTemperature: circuit.getCurrentDesiredTemperature,
          },
        });
      },
    );
  }

  /**
   * Generate circuit sensor components for this device.
   * Uses the @CircuitSensor decorator metadata to generate sensors for each circuit.
   */
  private generateCircuitSensorComponents(
    baseTopic: string,
    installationId: number,
    gatewayId: string,
    deviceId: string,
    features: Feature[],
  ): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
    const complexProperties = getComplexComponentProperties(this);
    
    return this.generateComponentsFromMetadata(
      complexProperties.circuitSensors,
      baseTopic,
      installationId,
      gatewayId,
      deviceId,
      features,
      ({ metadata, itemId, featurePath, feature, componentKey, baseTopic, installationId, gatewayId, deviceId }) => {
        // Check if value exists by examining the feature properties
        const valueProperty = feature.properties?.value as { value?: number } | undefined;
        if (!valueProperty || (valueProperty.value === undefined || valueProperty.value === null)) {
          return null;
        }

        const circuit = new HeatingCircuit(this, itemId);
        const circuitName = circuit.getName;
        const circuitNumber = parseInt(itemId, 10) + 1;
        const displayName = circuitName || `Circuit ${circuitNumber}`;
        const baseName = getFeatureName(metadata.featurePathTemplate.replace(/N/g, "N")) || "Sensor";

        const valueTemplate = metadata.valueTemplate || safeValueTemplate("value.value", metadata.platform === "binary_sensor");

        const component: { platform: string; unique_id?: string; [key: string]: any } = {
          platform: metadata.platform,
          unique_id: `viessmann_${installationId}_${gatewayId}_${deviceId}_${componentKey}`,
          name: `${displayName} ${baseName}`,
          state_topic: `${baseTopic}/installations/${installationId}/gateways/${gatewayId}/devices/${deviceId}/features/${featurePath}`,
          value_template: valueTemplate,
        };

        if (metadata.deviceClass) {
          component.device_class = metadata.deviceClass;
        }
        if (metadata.unitOfMeasurement) {
          const normalizedUnit = normalizeUnit(metadata.unitOfMeasurement, metadata.deviceClass);
          if (normalizedUnit) {
            component.unit_of_measurement = normalizedUnit;
          }
        }

        return { [componentKey]: component };
      },
    );
  }

  /**
   * Generate heating curve sensor components for this device.
   * Uses the @HeatingCurve decorator metadata to generate slope and shift sensors for each circuit.
   */
  private generateHeatingCurveComponents(
    baseTopic: string,
    installationId: number,
    gatewayId: string,
    deviceId: string,
    features: Feature[],
  ): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
    const complexProperties = getComplexComponentProperties(this);
    
    return this.generateComponentsFromMetadata(
      complexProperties.heatingCurves,
      baseTopic,
      installationId,
      gatewayId,
      deviceId,
      features,
      ({ metadata, itemId, featurePath, componentKey, baseTopic, installationId, gatewayId, deviceId }) => {
        const circuit = new HeatingCircuit(this, itemId);
        const circuitName = circuit.getName;
        const circuitNumber = parseInt(itemId, 10) + 1;
        const displayName = circuitName || `Circuit ${circuitNumber}`;
        const baseName = getFeatureName(metadata.featurePathTemplate.replace(/N/g, "N")) || "Heating Curve";

        const slopeKey = `${componentKey}_slope`;
        const shiftKey = `${componentKey}_shift`;

        return {
          [slopeKey]: {
            platform: "sensor",
            unique_id: `viessmann_${installationId}_${gatewayId}_${deviceId}_${slopeKey}`,
            name: `${displayName} ${baseName} Slope`,
            state_topic: `${baseTopic}/installations/${installationId}/gateways/${gatewayId}/devices/${deviceId}/features/${featurePath}`,
            value_template: "{{ value_json.properties.slope.value | float }}",
            state_class: "measurement",
          },
          [shiftKey]: {
            platform: "sensor",
            unique_id: `viessmann_${installationId}_${gatewayId}_${deviceId}_${shiftKey}`,
            name: `${displayName} ${baseName} Shift`,
            state_topic: `${baseTopic}/installations/${installationId}/gateways/${gatewayId}/devices/${deviceId}/features/${featurePath}`,
            value_template: "{{ value_json.properties.shift.value | int }}",
            state_class: "measurement",
          },
        };
      },
    );
  }


}

/**
 * Represents a heating circuit component.
 */
export class HeatingCircuit {
  private readonly device: HeatingDevice;

  private readonly circuitId: string;

  constructor(device: HeatingDevice, circuitId: string) {
    this.device = device;
    this.circuitId = circuitId;
  }

  /**
   * Internal helper to access device's protected getProperty method.
   */
  private getProperty(propertyName: string): Feature | null {
    // Access the protected method through the device instance
    // We need to cast to access protected members
    return (this.device as unknown as { getProperty: (name: string) => Feature | null }).getProperty(propertyName);
  }

  /**
   * Internal helper to access device's protected getPropertyValue method.
   */
  private getPropertyValue<U>(feature: Feature | null, propertyPath: string): U | null {
    // Access the protected method through the device instance
    return (this.device as unknown as { getPropertyValue: <T>(feature: Feature | null, path: string) => T | null }).getPropertyValue<U>(feature, propertyPath);
  }

  /**
   * Get circuit supply temperature.
   */
  @PropertyRetrieval({
    featurePath: "heating.circuits.N.sensors.temperature.supply",
    propertyPath: "value",
    returnType: "number",
  })
  declare getSupplyTemperature: number | null;

  /**
   * Get circuit room temperature.
   */
  @PropertyRetrieval({
    featurePath: "heating.circuits.N.sensors.temperature.room",
    propertyPath: "value",
    returnType: "number",
  })
  declare getRoomTemperature: number | null;

  /**
   * Get active mode.
   */
  @PropertyRetrieval({
    featurePath: "heating.circuits.N.operating.modes.active",
    propertyPath: "value",
    returnType: "string",
  })
  declare getActiveMode: string | null;

  /**
   * Get available modes.
   * Accesses command parameters to get mode constraints.
   */
  @PropertyRetrieval({
    featurePath: "heating.circuits.N.operating.modes.active",
    propertyPath: "setMode.params.mode.constraints.enum",
    returnType: "array",
    source: "commands",
  })
  declare getModes: string[];

  /**
   * Get active program.
   * The decorator handles the implementation - accessing features via device with circuitId replacement.
   */
  @PropertyRetrieval({
    featurePath: "heating.circuits.N.operating.programs.active",
    propertyPath: "value",
    returnType: "string",
  })
  declare getActiveProgram: string | null;

  /**
   * Get current desired temperature.
   * Depends on getActiveProgram and uses dynamic feature path.
   * The decorator handles the implementation.
   */
  @DependentProperty({
    dependsOn: "getActiveProgram",
    featurePathTemplate: "heating.circuits.N.operating.programs.{program}",
    propertyPath: "temperature",
    returnType: "number",
    condition: "(value) => value && value !== 'standby'",
    placeholder: "program",
  })
  declare getCurrentDesiredTemperature: number | null;

  /**
   * Get circuit name.
   */
  @PropertyRetrieval({
    featurePath: "heating.circuits.N",
    propertyPath: "name",
    returnType: "string",
  })
  declare getName: string | null;

  /**
   * Get circuit type.
   */
  @PropertyRetrieval({
    featurePath: "heating.circuits.N",
    propertyPath: "type",
    returnType: "string",
  })
  declare getType: string | null;

  /**
   * Get circuit ID.
   */
  getId(): string {
    return this.circuitId;
  }
}
