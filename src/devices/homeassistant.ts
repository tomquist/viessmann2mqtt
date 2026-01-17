import { Device } from "./base.js";
import { getDiscoverableMethods } from "./discovery.js";
import { Feature as ApiFeature, Command } from "../models.js";

// Re-export utility functions from homeassistant-utils for backward compatibility
export {
  normalizeUnit,
  mapViessmannModesToHomeAssistant,
  generateModeMappingTemplate,
  safeValueTemplate,
  percentageValueTemplate,
  getFeatureName,
  generateTimeBasedComponents,
} from "./homeassistant-utils.js";

// Import utility functions for use in this file
import {
  generateTimeBasedComponents,
  getFeatureName,
  normalizeUnit,
  percentageValueTemplate,
  safeValueTemplate,
} from "./homeassistant-utils.js";

/**
 * Home Assistant MQTT Device Discovery configuration.
 * Groups all components under a single device entry.
 */
export interface HomeAssistantDeviceDiscoveryConfig {
  device: {
    identifiers: string[];
    name: string;
    manufacturer: string;
    model: string;
    via_device?: string;
  };
  origin: {
    name: string;
    sw_version?: string;
    support_url?: string;
  };
  components: Record<string, {
    platform: string;
    unique_id?: string;
    [key: string]: any;
  }>;
  state_topic?: string;
  availability?: Array<{
    topic: string;
    payload_available?: string;
    payload_not_available?: string;
    value_template?: string;
  }>;
  availability_topic?: string;
  availability_mode?: string;
  availability_template?: string;
  payload_available?: string;
  payload_not_available?: string;
  qos?: number;
  encoding?: string;
  command_topic?: string;
  [key: string]: any;
}

/**
 * Generate Home Assistant discovery payloads for a device.
 */
export class HomeAssistantDiscovery {
  private readonly baseTopic: string;

  private readonly deviceId: string;

  private readonly installationId: number;

  private readonly gatewayId: string;

  constructor(
    baseTopic: string,
    installationId: number,
    gatewayId: string,
    deviceId: string,
  ) {
    this.baseTopic = baseTopic;
    this.installationId = installationId;
    this.gatewayId = gatewayId;
    this.deviceId = deviceId;
  }

  /**
   * Generate single device discovery config for a device.
   * All components are grouped under one device entry.
   * Features must be fetched externally and passed here.
   */
  generateDeviceDiscoveryConfig(
    device: Device,
    features: ApiFeature[],
  ): HomeAssistantDeviceDiscoveryConfig {
    // Base device info
    // ViCare integration uses format: {gateway_serial}_{device_serial} (with dashes replaced by underscores)
    // Or: {gateway_serial}_{device_id} if device_serial is not available
    // Try to get device serial from device model (boilerSerial) first, then from features
    const deviceSerialFromModel = (device as any).deviceModel?.boilerSerial;
    const deviceSerialFromFeature = device.getSerial();
    const deviceSerial = deviceSerialFromModel || deviceSerialFromFeature;
    
    // Match ViCare identifier format exactly
    // Format: {gateway_serial}_{device_serial} with dashes replaced by underscores
    // Or: {gateway_serial}_{device_id} if no device serial
    const vicareIdentifier = deviceSerial
      ? `${this.gatewayId}_${deviceSerial.replace(/-/g, "_")}`
      : `${this.gatewayId}_${this.deviceId}`;
    
    const identifiers = [vicareIdentifier];
    
    // Include our composite identifier for backwards compatibility
    identifiers.push(`viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}`);
    
    const deviceInfo = {
      identifiers,
      name: `${device.getModelId()} (${this.deviceId})`,
      manufacturer: "Viessmann",
      model: device.getModelId(),
      // Include serial number if available (ViCare uses this)
      ...(deviceSerial && { serial_number: deviceSerial }),
    };

    const origin = {
      name: "viessmann2mqtt",
      sw_version: "1.0.0",
    };

    const components: Record<string, {
      platform: string;
      unique_id?: string;
      [key: string]: any;
    }> = {};

    // First, get components from decorated methods to know which features are already handled
    const decoratedComponents = this.generateComponentsFromDecorators(
      device,
      features,
    );
    const decoratedFeaturePaths = new Set<string>();
    for (const component of Object.values(decoratedComponents)) {
      // Extract feature path from state_topic
       
      const stateTopic = component.state_topic as string;
      if (stateTopic) {
        const match = stateTopic.match(/\/features\/(.+)$/);
        if (match) {
          const featurePath = match[1];
          // Don't track circuit container features or list features
          if (!HomeAssistantDiscovery.isCircuitContainerFeature(featurePath) && !Device.isListFeature(featurePath)) {
            decoratedFeaturePaths.add(featurePath);
          }
        }
      }
    }
    Object.assign(components, decoratedComponents);

    // Complex components (circuit sensors, climate, heating curves, time-based, burner sensors)
    // are now generated declaratively via device.generateHomeAssistantComponents()

    // Enhance existing components with generic feature-based enhancement (unit normalization, device classes, etc.)
    this.enhanceComponentsFromFeatures(device, components, features);

    // Generate device-specific components
    const deviceComponents = device.generateHomeAssistantComponents(
      this.baseTopic,
      this.installationId,
      this.gatewayId,
      this.deviceId,
      decoratedFeaturePaths,
      features,
    );
    
    // Track features handled by device-specific components
    // Exclude circuit container features (heating.circuits.{id}) - these are only used internally
    // Exclude list features (heating.burners, heating.circuits) - these are containers
    for (const component of Object.values(deviceComponents)) {
       
      const stateTopic = component.state_topic as string;
      if (stateTopic) {
        const match = stateTopic.match(/\/features\/(.+)$/);
        if (match) {
          const featurePath = match[1];
          // Don't track circuit container features or list features
          if (!HomeAssistantDiscovery.isCircuitContainerFeature(featurePath) && !Device.isListFeature(featurePath)) {
            decoratedFeaturePaths.add(featurePath);
          }
        }
      }
    }
    Object.assign(components, deviceComponents);

    // Generate components for all other enabled features that don't have decorators
    const autoComponents = this.generateComponentsFromAllFeatures(
      device,
      decoratedFeaturePaths,
      features,
    );
    Object.assign(components, autoComponents);

    // Generate command-enabled components for features with executable commands
    const commandComponents = this.generateCommandComponentsFromFeatures(
      components,
      features,
    );
    Object.assign(components, commandComponents);

    // Enhance components with command topics where applicable
    this.enhanceComponentsWithCommands(components, features);

    // Final safety check: Remove any components for circuit container features or list features that might have slipped through
    const filteredComponents: Record<string, { platform: string; unique_id?: string; [key: string]: any }> = {};
    for (const [componentKey, component] of Object.entries(components)) {
      const featurePath = HomeAssistantDiscovery.extractFeaturePath(
        component.state_topic as string | undefined,
      );
      // Skip circuit container features
      if (featurePath && HomeAssistantDiscovery.isCircuitContainerFeature(featurePath)) {
        continue;
      }
      // Skip list features (heating.burners, heating.circuits) - these are containers
      // and shouldn't create entities, but data should still be published to MQTT
      if (featurePath && Device.isListFeature(featurePath)) {
        continue;
      }
      filteredComponents[componentKey] = component;
    }

    return {
      device: deviceInfo,
      origin,
      components: filteredComponents,
    };
  }


  /**
   * Generate component configs from decorated methods.
   */
  private generateComponentsFromDecorators(
    device: Device,
    features: ApiFeature[],
  ): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
    const components: Record<string, { platform: string; unique_id?: string; [key: string]: any }> = {};
    const discoverableMethods = getDiscoverableMethods(device as unknown as Record<string, unknown>);

    // Use provided features instead of fetching again
    const featureNames = features.filter((f: ApiFeature) => f.isEnabled).map((f: ApiFeature) => f.feature);
     
    const availableFeatures = new Set<string>(featureNames);

    for (const { methodName, metadata } of discoverableMethods) {
      // Check if the feature is available instead of calling the method
      if (!availableFeatures.has(metadata.featurePath)) {
        continue;
      }

      // Generate component key
      const componentKey = metadata.componentKey || methodName.replace(/^get/, "").replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");

      // Get feature name (always returns a string)
      let featureName = getFeatureName(metadata.featurePath);
      
      // If this is a circuit feature, try to get the circuit name and prepend it
      const circuitName = this.getCircuitNameForFeature(metadata.featurePath, features);
      if (circuitName) {
        featureName = `${circuitName} ${featureName}`;
      }

      // Build component config
      // Extract property path from value template if provided, otherwise default to "value.value"
      let propertyPath = "value.value";
      let valueTemplate: string;
      if (metadata.valueTemplate) {
        // Extract property path from template like "{{ value_json.properties.day.value[0] }}"
        const match = metadata.valueTemplate.match(/properties\.([^}]+)/);
        if (match) {
          propertyPath = match[1].trim();
        }
        // Convert custom template to safe template
        valueTemplate = safeValueTemplate(propertyPath, metadata.platform === "binary_sensor");
      } else {
        // Use percentage template for modulation features, otherwise use safe template
        if (metadata.featurePath.includes("modulation")) {
          valueTemplate = percentageValueTemplate(propertyPath);
        } else {
          valueTemplate = safeValueTemplate(propertyPath, metadata.platform === "binary_sensor");
        }
      }
      
      const componentConfig: { platform: string; unique_id?: string; [key: string]: any } = {
        platform: metadata.platform,
        unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${componentKey}`,
        name: featureName,
        state_topic: `${this.baseTopic}/installations/${this.installationId}/gateways/${this.gatewayId}/devices/${this.deviceId}/features/${metadata.featurePath}`,
        value_template: valueTemplate,
      };

      if (metadata.deviceClass) {
        componentConfig.device_class = metadata.deviceClass;
      }

      // Normalize unit of measurement for Home Assistant
      if (metadata.unitOfMeasurement) {
        const normalizedUnit = normalizeUnit(metadata.unitOfMeasurement, metadata.deviceClass);
        if (normalizedUnit) {
          componentConfig.unit_of_measurement = normalizedUnit;
        }
      }

      // Set entity_category for diagnostic/config sensors
      // Get feature properties for category determination
      const feature = features.find((f: ApiFeature) => f.feature === metadata.featurePath);
      if (feature && feature.properties) {
        const entityCategory = HomeAssistantDiscovery.determineEntityCategory(
          metadata.featurePath,
          metadata.platform,
          metadata.deviceClass,
          feature.properties as Record<string, unknown>,
        );
        if (entityCategory) {
          componentConfig.entity_category = entityCategory;
          componentConfig.ent_cat = entityCategory; // Abbreviation
        }
      }

      components[componentKey] = componentConfig;
    }

    return components;
  }


  /**
   * Rule-based device class detection configuration.
   * Rules are evaluated in order - first match wins.
   */
  private static readonly DEVICE_CLASS_RULES: Array<{
    match: (featurePath: string, unit: string) => boolean;
    deviceClass: string;
    removeDeviceClass?: boolean; // If true, removes existing device class instead of setting
  }> = [
    // Gas consumption: energy if kWh, volume otherwise (remove energy class)
      {
        match: (path, unit) =>
          path.includes("gas") &&
        path.includes("consumption") &&
        !/kilowatthour|watthour|megawatthour/i.test(unit),
        deviceClass: "",
        removeDeviceClass: true,
      },
      {
        match: (path, unit) =>
          path.includes("gas") &&
        path.includes("consumption") &&
        /kilowatthour|watthour|megawatthour/i.test(unit),
        deviceClass: "energy",
      },
      // Power production: power device class
      {
        match: (path) => path.includes("production") && path.includes("power"),
        deviceClass: "power",
      },
      // Energy units: energy device class
      {
        match: (_path, unit) =>
          /kilowatthour|watthour|megawatthour|gigawatthour|joule|calorie|btu/i.test(unit),
        deviceClass: "energy",
      },
      // Power units: power device class
      {
        match: (_path, unit) =>
          /kilowatt|watt|megawatt/i.test(unit) && !/hour/i.test(unit),
        deviceClass: "power",
      },
    ];

  /**
   * Property keys to check for units, in priority order.
   */
  private static readonly UNIT_PROPERTY_PRIORITY = [
    "day",
    "currentDay",
    "value",
    "week",
    "month",
    "year",
  ] as const;

  /**
   * Extract feature path from component state topic.
   */
  private static extractFeaturePath(
    stateTopic: string | undefined,
  ): string | null {
    if (!stateTopic) {
      return null;
    }
    const match = stateTopic.match(/\/features\/(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * Extract property path from value template.
   */
  private static extractPropertyPath(
    valueTemplate: string | undefined,
  ): string {
    if (!valueTemplate) {
      return "value.value";
    }
    const propMatch = valueTemplate.match(/properties\.([^}]+)/);
    return propMatch ? propMatch[1].trim() : "value.value";
  }

  /**
   * Find unit from feature properties using priority order.
   */
  private static findUnit(
    properties: Record<string, unknown>,
    propertyKey: string,
  ): string | undefined {
    const searchKeys = [propertyKey, ...this.UNIT_PROPERTY_PRIORITY];
    for (const key of searchKeys) {
      const prop = properties[key] as Record<string, unknown> | undefined;
      if (
        prop &&
        typeof prop === "object" &&
        "unit" in prop &&
        typeof prop.unit === "string"
      ) {
        return prop.unit;
      }
    }
    return undefined;
  }

  /**
   * Determine device class using rule-based matching.
   */
  private static determineDeviceClass(
    featurePath: string,
    unit: string,
  ): { deviceClass?: string; removeDeviceClass: boolean } {
    const unitLower = unit.toLowerCase();
    const rule = this.DEVICE_CLASS_RULES.find((r) =>
      r.match(featurePath, unitLower),
    );

    if (!rule) {
      return { removeDeviceClass: false };
    }

    return {
      deviceClass: rule.deviceClass || undefined,
      removeDeviceClass: rule.removeDeviceClass ?? false,
    };
  }

  /**
   * Enhance a single component based on its feature data.
   */
  private enhanceComponent(
    componentKey: string,
    component: { platform: string; unique_id?: string; [key: string]: any },
    feature: ApiFeature,
    components: Record<string, { platform: string; unique_id?: string; [key: string]: any }>,
    features: ApiFeature[],
  ): void {
    const featurePath = HomeAssistantDiscovery.extractFeaturePath(
      component.state_topic as string | undefined,
    );
    if (!featurePath || !feature.properties) {
      return;
    }

    const propertyPath = HomeAssistantDiscovery.extractPropertyPath(
      component.value_template as string | undefined,
    );
    const propertyKey = propertyPath.split(".")[0];
    const properties = feature.properties as Record<string, unknown>;

    // Find and apply unit
    const unit = HomeAssistantDiscovery.findUnit(properties, propertyKey);
    if (unit) {
      const existingDeviceClass = component.device_class as string | undefined;
      const { deviceClass, removeDeviceClass } =
        HomeAssistantDiscovery.determineDeviceClass(
          featurePath,
          unit,
        );

      // Remove device class if rule says so
      if (removeDeviceClass && existingDeviceClass) {
         
        delete component.device_class;
      }

      // Normalize and set unit
      const normalizedUnit = normalizeUnit(
        unit,
        deviceClass || existingDeviceClass,
      );
      if (normalizedUnit) {
         
        component.unit_of_measurement = normalizedUnit;
      }

      // Set device class if determined
      if (deviceClass) {
         
        component.device_class = deviceClass;
      }
    }

    // Add time-based components for day/currentDay properties
    const timeBasedPropertyKeys = ["day", "currentDay"] as const;
    if (timeBasedPropertyKeys.includes(propertyKey as typeof timeBasedPropertyKeys[number])) {
      const timeBasedComponents = generateTimeBasedComponents(
        featurePath,
        feature,
        componentKey,
        {
           
          device_class: component.device_class as string | undefined,
           
          unit_of_measurement: component.unit_of_measurement as string | undefined,
        },
        this.installationId,
        this.gatewayId,
        this.deviceId,
        this.baseTopic,
        features as Array<{ feature: string; properties?: Record<string, unknown> }>,
      );

      Object.assign(components, timeBasedComponents);
    }
  }

  /**
   * Generic component enhancement based on actual feature data.
   * This replaces device-specific enhancement logic by analyzing features
   * and enhancing components based on their actual properties.
   */
  private enhanceComponentsFromFeatures(
    device: Device,
    components: Record<string, { platform: string; unique_id?: string; [key: string]: any }>,
    features: ApiFeature[],
  ): void {
    // Use provided features instead of fetching again

    // Create feature map: featurePath -> feature
    const featureMap = new Map(
      features
        .filter((f) => f.isEnabled)
        .map((f) => [f.feature, f] as [string, ApiFeature]),
    );

    // Enhance each component
    Object.entries(components).forEach(([componentKey, component]) => {
      const featurePath = HomeAssistantDiscovery.extractFeaturePath(
        component.state_topic as string | undefined,
      );
      const feature = featurePath ? featureMap.get(featurePath) : undefined;

      if (feature) {
        this.enhanceComponent(componentKey, component, feature, components, features);
      }
    });
  }

  /**
   * Platform detection rules - determine if feature should be binary_sensor or sensor.
   */
  private static readonly PLATFORM_DETECTION_RULES: Array<{
    match: (
      featurePath: string,
      properties: Record<string, unknown>,
    ) => boolean;
    platform: "sensor" | "binary_sensor";
  }> = [
    // Active property with boolean type
      {
        match: (_path, props) => {
          const active = props.active as { type?: string } | undefined;
          return (
            active !== undefined &&
          typeof active === "object" &&
          active.type === "boolean"
          );
        },
        platform: "binary_sensor",
      },
      // Status property: boolean OR (on/off string AND no value property AND not temp/pressure)
      {
        match: (path, props) => {
          const status = props.status as
          | { type?: string; value?: unknown }
          | undefined;
          const hasValue = props.value !== undefined;
          const isTempPressure = path.includes("temperature") || path.includes("pressure");
          const isBinaryState = path.includes("pump") || path.includes("valve") || path.includes("circulation");

          if (
            !status ||
          typeof status !== "object" ||
          !("type" in status) ||
          !("value" in status)
          ) {
            return false;
          }

          const statusType = status.type;
          const statusValue = status.value;

          return (
            statusType === "boolean" ||
          (statusType === "string" &&
            typeof statusValue === "string" &&
            (statusValue.toLowerCase() === "on" ||
              statusValue.toLowerCase() === "off") &&
            !hasValue &&
            !isTempPressure) ||
          (isBinaryState &&
            statusType === "string" &&
            typeof statusValue === "string" &&
            (statusValue.toLowerCase() === "on" ||
              statusValue.toLowerCase() === "off"))
          );
        },
        platform: "binary_sensor",
      },
    ];

  /**
   * Property path priority rules for different feature types.
   */
  private static readonly PROPERTY_PATH_PRIORITY: Record<
  string,
  string[]
  > = {
      temperature: ["value", "strength", "day", "week", "month", "year"],
      pressure: ["value", "strength", "day", "week", "month", "year"],
      summary: [
        "value",
        "currentDay",
        "strength",
        "day",
        "week",
        "month",
        "year",
        "status",
      ],
      default: ["value", "strength", "status", "day", "week", "month", "year"],
    };

  /**
   * Binary sensor property paths and device classes.
   */
  private static readonly BINARY_SENSOR_PATHS: Array<{
    property: string;
    deviceClass?: string;
    pathMatch?: (featurePath: string) => boolean;
  }> = [
      { property: "active", deviceClass: "heat" },
      {
        property: "status",
        deviceClass: "running",
        pathMatch: (path) => path.includes("pump") || path.includes("circulation"),
      },
      {
        property: "status",
        deviceClass: "opening",
        pathMatch: (path) => path.includes("valve"),
      },
      { property: "status" },
    ];

  /**
   * Determine platform type (sensor vs binary_sensor).
   */
  private static determinePlatform(
    featurePath: string,
    properties: Record<string, unknown>,
  ): "sensor" | "binary_sensor" {
    const rule = this.PLATFORM_DETECTION_RULES.find((r) =>
      r.match(featurePath, properties),
    );
    return rule?.platform ?? "sensor";
  }

  /**
   * Find property path for binary sensors.
   */
  private static findBinarySensorPropertyPath(
    featurePath: string,
    properties: Record<string, unknown>,
  ): { path: string; deviceClass?: string } | null {
    for (const config of this.BINARY_SENSOR_PATHS) {
      const prop = properties[config.property] as
        | Record<string, unknown>
        | undefined;
      if (
        prop &&
        typeof prop === "object" &&
        "value" in prop &&
        (!config.pathMatch || config.pathMatch(featurePath))
      ) {
        return {
          path: `${config.property}.value`,
          deviceClass: config.deviceClass,
        };
      }
    }
    return null;
  }

  /**
   * Find property path for regular sensors using priority rules.
   * Prioritizes numeric properties when a unit is present to avoid type mismatches.
   */
  private static findSensorPropertyPath(
    featurePath: string,
    properties: Record<string, unknown>,
  ): string {
    // Check if any property has a unit (indicates numeric value expected)
    const hasUnitProperty = Object.values(properties).some(
      (prop) =>
        prop &&
        typeof prop === "object" &&
        "unit" in prop &&
        prop.unit !== undefined,
    );

    // Determine priority list based on feature path
    let priority: string[];
    if (featurePath.includes("temperature") || featurePath.includes("pressure")) {
      priority = this.PROPERTY_PATH_PRIORITY.temperature;
    } else if (featurePath.includes("summary")) {
      priority = this.PROPERTY_PATH_PRIORITY.summary;
    } else {
      priority = this.PROPERTY_PATH_PRIORITY.default;
    }

    // If a unit is present, prioritize numeric properties over arrays
    if (hasUnitProperty) {
      // First, try to find a numeric property with a unit
      for (const key of Object.keys(properties)) {
        const prop = properties[key] as
          | { value?: unknown; unit?: string; type?: string }
          | undefined;
        if (
          prop &&
          typeof prop === "object" &&
          "value" in prop &&
          prop.unit !== undefined &&
          (prop.type === "number" ||
            typeof prop.value === "number")
        ) {
          return `${key}.value`;
        }
      }
    }

    // Try priority keys first
    for (const key of priority) {
      const prop = properties[key] as Record<string, unknown> | undefined;
      if (!prop || typeof prop !== "object" || !("value" in prop)) {
        continue;
      }

      // Skip status for temperature/pressure if value exists
      if (
        (featurePath.includes("temperature") ||
          featurePath.includes("pressure")) &&
        key === "status" &&
        properties.value &&
        typeof properties.value === "object" &&
        "value" in properties.value
      ) {
        continue;
      }

      // Skip array properties if we have a unit (expect numeric)
      if (hasUnitProperty && Array.isArray(prop.value)) {
        continue;
      }

      // Handle array values (only if no unit expected)
      if (
        (key === "day" ||
          key === "week" ||
          key === "month" ||
          key === "year") &&
        Array.isArray(prop.value)
      ) {
        return `${key}.value[0]`;
      }
      return `${key}.value`;
    }

    // Fallback: use first property with value
    for (const key of Object.keys(properties)) {
      // Skip status for temperature/pressure if value exists
      if (
        (featurePath.includes("temperature") ||
          featurePath.includes("pressure")) &&
        key === "status" &&
        properties.value &&
        typeof properties.value === "object" &&
        "value" in properties.value
      ) {
        continue;
      }

      const prop = properties[key] as Record<string, unknown> | undefined;
      if (prop && typeof prop === "object" && "value" in prop) {
        // Skip array properties if we have a unit (expect numeric)
        if (hasUnitProperty && Array.isArray(prop.value)) {
          continue;
        }
        if (Array.isArray(prop.value)) {
          return `${key}.value[0]`;
        }
        return `${key}.value`;
      }
    }

    return "value.value"; // Default fallback
  }

  /**
   * Generate component key from feature path.
   */
  private static generateComponentKey(featurePath: string): string {
    return featurePath
      .replace(/^heating\./, "")
      .replace(/\./g, "_")
      .replace(/\d+/g, (match) => `_${match}_`)
      .replace(/__+/g, "_")
      .replace(/^_|_$/g, "");
  }

  private static getExecutableCommands(
    feature: ApiFeature,
  ): Array<[string, Command]> {
    return Object.entries(feature.commands ?? {}).filter(
      ([, command]) => command.isExecutable,
    );
  }

  private generateCommandTopic(featurePath: string, commandName: string): string {
    return `${this.baseTopic}/installations/${this.installationId}/gateways/${this.gatewayId}/devices/${this.deviceId}/features/${featurePath}/commands/${commandName}/set`;
  }

  private static buildSingleParamCommandTemplate(
    paramName: string,
    paramType: string,
  ): string {
    if (paramType === "number") {
      return `{"${paramName}": {{ value | float }}}`;
    }
    return `{"${paramName}": {{ value | tojson }}}`;
  }

  private static buildModeCommandTemplate(
    paramName: string,
    allowedModes?: string[],
  ): string {
    const hasStandby = allowedModes?.includes("standby");
    const hasHeating = allowedModes?.includes("heating");
    return `{% set mode = value %}{% if mode == "off" %}{% set mode = "${hasStandby ? "standby" : "off"}" %}{% elif mode == "heat" %}{% set mode = "${hasHeating ? "heating" : "heat"}" %}{% elif mode == "auto" %}{% set mode = "${hasHeating ? "heating" : "auto"}" %}{% endif %}{"${paramName}": "{{ mode }}"}`;
  }

  private static buildCommandComponentName(
    featureName: string,
    commandName: string,
    paramName?: string,
  ): string {
    const commandLabel = commandName
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
    if (paramName) {
      const paramLabel = paramName
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
      return `${featureName} ${commandLabel} ${paramLabel}`.trim();
    }
    return `${featureName} ${commandLabel}`.trim();
  }

  private static getCommandStateConfig(
    feature: ApiFeature,
    paramName: string,
    featurePath: string,
    baseTopic: string,
    installationId: number,
    gatewayId: string,
    deviceId: string,
  ): {
    state_topic: string;
    value_template: string;
    unit_of_measurement?: string;
  } | null {
    const properties = feature.properties as Record<string, unknown> | undefined;
    
    // Try exact match first
    let prop = properties?.[paramName] as
      | { value?: unknown; unit?: string; type?: string }
      | undefined;
    let propertyName = paramName;
    
    // If no exact match, try semantic matching (e.g., targetTemperature -> temperature)
    if (!prop || typeof prop !== "object" || !("value" in prop)) {
      const semanticMatches: Record<string, string[]> = {
        // Temperature-related
        targetTemperature: ["temperature", "temp", "value"],
        targetTemp: ["temperature", "temp", "value"],
        temperature: ["temperature", "temp", "value"],
        temp: ["temperature", "temp", "value"],
        // Mode-related (mode parameter -> value property)
        mode: ["value", "mode"],
        // Gas type (gasType parameter -> value property)
        gasType: ["value", "type"],
        // Active/boolean state
        active: ["active", "value", "enabled"],
        // Schedule-related (newSchedule parameter -> entries property)
        newSchedule: ["entries", "schedule", "value"],
        // Weekday-related (weekday parameter -> weekdays property)
        weekday: ["weekdays", "weekday", "value"],
      };
      
      const candidates = semanticMatches[paramName] ?? [];
      // Also try "value" as a fallback for enum/string properties
      if (!candidates.includes("value")) {
        candidates.push("value");
      }
      
      for (const candidate of candidates) {
        prop = properties?.[candidate] as
          | { value?: unknown; unit?: string; type?: string }
          | undefined;
        if (prop && typeof prop === "object" && "value" in prop) {
          propertyName = candidate;
          break;
        }
      }
    }
    
    if (!prop || typeof prop !== "object" || !("value" in prop)) {
      return null;
    }
    
    const unit = prop.unit;
    const normalizedUnit = unit ? normalizeUnit(unit) : undefined;
    
    // Handle array properties (like weekdays) - extract first element for state
    // For select components with enum, we want the first element of the array
    const isArrayProperty = prop.type === "array" && Array.isArray(prop.value);
    const valueTemplate = isArrayProperty
      ? `{% if value_json.properties.${propertyName}.value is defined and value_json.properties.${propertyName}.value|length > 0 %}{{ value_json.properties.${propertyName}.value[0] }}{% endif %}`
      : safeValueTemplate(`${propertyName}.value`, prop.type === "boolean");
    
    return {
      state_topic: `${baseTopic}/installations/${installationId}/gateways/${gatewayId}/devices/${deviceId}/features/${featurePath}`,
      value_template: valueTemplate,
      ...(normalizedUnit ? { unit_of_measurement: normalizedUnit } : {}),
    };
  }

  private enhanceComponentsWithCommands(
    components: Record<string, { platform: string; unique_id?: string; [key: string]: any }>,
    features: ApiFeature[],
  ): void {
    const featureMap = new Map(
      features.map((feature) => [feature.feature, feature] as [string, ApiFeature]),
    );

    for (const component of Object.values(components)) {
      const platform = component.platform;
      if (platform !== "climate") {
        continue;
      }

      const featurePath = HomeAssistantDiscovery.extractFeaturePath(
        component.state_topic as string | undefined,
      );
      if (!featurePath) {
        continue;
      }
      const feature = featureMap.get(featurePath);
      if (!feature || !feature.commands) {
        continue;
      }

      if (!component.mode_command_topic) {
        const modeCommand =
          feature.commands.setMode ??
          Object.values(feature.commands).find((command) =>
            Object.keys(command.params ?? {}).includes("mode"),
          );
        if (modeCommand?.isExecutable) {
          const [paramName, paramDef] =
            Object.entries(modeCommand.params ?? {})[0] ?? ["mode", { type: "string" }];
          const allowedModes =
            (paramDef.constraints as { enum?: string[] } | undefined)?.enum ??
            undefined;
          component.mode_command_topic = this.generateCommandTopic(
            featurePath,
            modeCommand.name,
          );
          component.mode_command_template =
            HomeAssistantDiscovery.buildModeCommandTemplate(
              paramName,
              allowedModes,
            );
        }
      }

      if (!component.temperature_command_topic) {
        const temperatureCommand = Object.values(feature.commands).find((command) => {
          const params = Object.entries(command.params ?? {});
          if (params.length !== 1) {
            return false;
          }
          const [paramName, paramDef] = params[0];
          return (
            command.isExecutable &&
            paramDef.type === "number" &&
            paramName.toLowerCase().includes("temperature")
          );
        });
        if (temperatureCommand) {
          const [paramName, paramDef] =
            Object.entries(temperatureCommand.params ?? {})[0] ?? [
              "targetTemperature",
              { type: "number" },
            ];
          component.temperature_command_topic = this.generateCommandTopic(
            featurePath,
            temperatureCommand.name,
          );
          component.temperature_command_template =
            HomeAssistantDiscovery.buildSingleParamCommandTemplate(
              paramName,
              paramDef.type,
            );
        }
      }
    }
  }

  /**
   * Add service command properties to a component config if it's a service technician command.
   * Sets enabled_by_default to false and entity_category to config so entities are disabled by default in Home Assistant.
   * Only sets entity_category for command/control components (number, select, switch, button, text), not sensors.
   */
  private static addServiceCommandProperties(
    component: { platform: string; unique_id?: string; [key: string]: any },
    isServiceCommand: boolean,
  ): void {
    if (isServiceCommand) {
      // Use both full name and abbreviation for compatibility
      component.enabled_by_default = false;
      component.en = false; // Abbreviation for MQTT discovery
      // entity_category: "config" marks command/control entities as configuration-only
      // Only set for non-sensor platforms to avoid hiding sensor components
      const isCommandComponent = ["number", "select", "switch", "button", "text", "climate"].includes(component.platform);
      if (isCommandComponent) {
        component.entity_category = "config";
        component.ent_cat = "config"; // Abbreviation for MQTT discovery
      }
    }
  }

  /**
   * Check if a feature path is a service technician feature.
   * These features are for calibration, configuration, and device management
   * and should be disabled by default.
   */
  private static isServiceTechnicianFeature(featurePath: string): boolean {
    // Configuration features are service-only
    if (featurePath.includes(".configuration.")) {
      return true;
    }

    // Screed drying programs (construction/renovation only)
    // These programs can cause excessive heating and should be supervised by professionals
    if (featurePath.includes(".screedDrying")) {
      return true;
    }

    // Calibration features (hysteresis, limits, etc.) are service-only
    // These are fine-tuning parameters that should be adjusted by professionals
    if (featurePath.includes(".hysteresis")) {
      return true;
    }
    if (featurePath.includes(".minimumLimit") || featurePath.includes(".maximumLimit") || featurePath.includes(".defaultLimit")) {
      return true;
    }
    if (featurePath.includes(".normalRange")) {
      return true;
    }

    return false;
  }

  /**
   * Determine entity category based on feature path and properties.
   * Returns "diagnostic" for diagnostic sensors, "config" for configuration command components,
   * or undefined for primary entities.
   * Note: Sensors cannot have entity_category: "config" - only command/control components can.
   */
  private static determineEntityCategory(
    featurePath: string,
    platform: string,
    deviceClass: string | undefined,
    properties: Record<string, unknown>,
  ): "diagnostic" | "config" | undefined {
    // Service technician configuration features should be diagnostic category for sensors
    // Only command/control components can use "config" category
    if (HomeAssistantDiscovery.isServiceTechnicianFeature(featurePath)) {
      // Service technician sensors should use "diagnostic" category, not "config"
      if (platform === "sensor" || platform === "binary_sensor") {
        return "diagnostic";
      }
    }

    // Diagnostic sensors: connection status, error codes, signal strength
    if (
      featurePath.includes(".status") ||
      featurePath.includes(".error") ||
      featurePath.includes(".signal") ||
      featurePath.includes(".rssi") ||
      featurePath.includes("connection") ||
      featurePath.includes("firmware") ||
      featurePath.includes("software") ||
      featurePath.includes("version")
    ) {
      return "diagnostic";
    }

    // Historical/time-based data (week/month/year) is diagnostic
    if (
      featurePath.includes("consumption") ||
      featurePath.includes("production") ||
      featurePath.includes("statistics")
    ) {
      // Check if this is historical data (has week/month/year properties)
      const hasHistoricalData =
        "week" in properties ||
        "month" in properties ||
        "year" in properties ||
        "currentMonth" in properties ||
        "currentYear" in properties ||
        "lastMonth" in properties ||
        "lastYear" in properties;
      if (hasHistoricalData) {
        return "diagnostic";
      }
    }

    // Count sensors (diagnostic counters) are diagnostic
    if (
      Object.keys(properties).some((key) =>
        /^count(One|Two|Three|Four|Five|Six|Seven)$/.test(key),
      )
    ) {
      return "diagnostic";
    }

    // Primary entities (temperature, active status, current consumption) have no category
    return undefined;
  }

  /**
   * Check if a command should be filtered out as service technician only.
   * These commands are for calibration, configuration, and device management
   * and should not be exposed to end users.
   */
  private static isServiceTechnicianCommand(
    commandName: string,
    featurePath: string,
  ): boolean {
    // Commands in service technician features are service-only
    if (HomeAssistantDiscovery.isServiceTechnicianFeature(featurePath)) {
      return true;
    }

    // Service technician command names
    const serviceCommandNames = [
      "setAltitude", // House location configuration
      "reset", // Reset to defaults (but resetSchedule is user-facing)
      "setOrientation", // House orientation configuration
      "setNormalRange", // Pressure calibration
      "setHysteresis", // Calibration
      "setHysteresisSwitchOnValue", // Calibration
      "setHysteresisSwitchOffValue", // Calibration
      "setMinimumLimit", // Limit configuration
      "setMaximumLimit", // Limit configuration
      "setDefaultLimit", // Limit configuration
      "removeController", // Device management
      "removeZigbeeController", // Device management
    ];

    // Exclude resetSchedule from service commands (it's user-facing)
    if (commandName === "reset" && featurePath.includes(".schedule")) {
      return false;
    }

    return serviceCommandNames.includes(commandName);
  }

  private generateCommandComponentsFromFeatures(
    components: Record<string, { platform: string; unique_id?: string; [key: string]: any }>,
    features: ApiFeature[],
  ): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
    const commandComponents: Record<
      string,
      { platform: string; unique_id?: string; [key: string]: any }
    > = {};

    const componentsByFeature = new Map<
      string,
      Array<{ key: string; component: { platform: string; [key: string]: any } }>
    >();

    Object.entries(components).forEach(([componentKey, component]) => {
      const featurePath = HomeAssistantDiscovery.extractFeaturePath(
        component.state_topic as string | undefined,
      );
      if (!featurePath) {
        return;
      }
      const list = componentsByFeature.get(featurePath) ?? [];
      list.push({ key: componentKey, component });
      componentsByFeature.set(featurePath, list);
    });

    for (const feature of features) {
      // Skip circuit container features (heating.circuits.{id}) - these are only used internally
      // to get circuit names for other entities and shouldn't create command components
      if (HomeAssistantDiscovery.isCircuitContainerFeature(feature.feature)) {
        continue;
      }
      // Skip list features (heating.burners, heating.circuits) - these are containers
      // and shouldn't create entities, but data should still be published to MQTT
      if (Device.isListFeature(feature.feature)) {
        continue;
      }
      
      const executableCommands = HomeAssistantDiscovery.getExecutableCommands(
        feature,
      );
      if (executableCommands.length === 0) {
        continue;
      }

      const featureComponents = componentsByFeature.get(feature.feature) ?? [];
      const hasClimate = featureComponents.some(
        ({ component }) => component.platform === "climate",
      );
      let featureName = getFeatureName(feature.feature);
      
      // If this is a circuit feature, try to get the circuit name and prepend it
      const circuitName = this.getCircuitNameForFeature(feature.feature, features);
      if (circuitName) {
        featureName = `${circuitName} ${featureName}`;
      }
      
      const baseKey = HomeAssistantDiscovery.generateComponentKey(feature.feature);

      for (const [commandName, command] of executableCommands) {
        if (commandName === "setMode" && hasClimate) {
          continue;
        }

        // Check if this is a service technician command
        const isServiceCommand = HomeAssistantDiscovery.isServiceTechnicianCommand(
          commandName,
          feature.feature,
        );

        const params = Object.entries(command.params ?? {});
        if (params.length === 0) {
          const componentKey = `${baseKey}_${commandName}`.toLowerCase();
          if (components[componentKey] || commandComponents[componentKey]) {
            continue;
          }
          const component: { platform: string; unique_id?: string; [key: string]: any } = {
            platform: "button",
            unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${componentKey}`,
            name: HomeAssistantDiscovery.buildCommandComponentName(
              featureName,
              commandName,
            ),
            command_topic: this.generateCommandTopic(feature.feature, commandName),
            payload_press: "{}",
          };
          HomeAssistantDiscovery.addServiceCommandProperties(component, isServiceCommand);
          commandComponents[componentKey] = component;
          continue;
        }

        if (commandName === "setCurve") {
          const slopeParam = params.find(([name]) => name === "slope");
          const shiftParam = params.find(([name]) => name === "shift");
          if (slopeParam && shiftParam) {
            for (const [paramName, paramDef] of [slopeParam, shiftParam]) {
              const componentKey = `${baseKey}_${commandName}_${paramName}`.toLowerCase();
              if (components[componentKey] || commandComponents[componentKey]) {
                continue;
              }
              const stateConfig =
                HomeAssistantDiscovery.getCommandStateConfig(
                  feature,
                  paramName,
                  feature.feature,
                  this.baseTopic,
                  this.installationId,
                  this.gatewayId,
                  this.deviceId,
                );
              
              // Skip creating component if we can't get a value (no matching property)
              if (!stateConfig) {
                continue;
              }
              
              const constraints = paramDef.constraints as {
                min?: number;
                max?: number;
                stepping?: number;
              } | undefined;
              const component: { platform: string; unique_id?: string; [key: string]: any } = {
                platform: "number",
                unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${componentKey}`,
                name: HomeAssistantDiscovery.buildCommandComponentName(
                  featureName,
                  commandName,
                  paramName,
                ),
                command_topic: this.generateCommandTopic(
                  feature.feature,
                  commandName,
                ),
                command_template:
                  HomeAssistantDiscovery.buildSingleParamCommandTemplate(
                    paramName,
                    paramDef.type,
                  ),
                mode: "box",
                ...(constraints?.min !== undefined ? { min: constraints.min } : {}),
                ...(constraints?.max !== undefined ? { max: constraints.max } : {}),
                ...(constraints?.stepping !== undefined
                  ? { step: constraints.stepping }
                  : {}),
                ...stateConfig,
              };
              HomeAssistantDiscovery.addServiceCommandProperties(component, isServiceCommand);
              commandComponents[componentKey] = component;
            }
            continue;
          }
        }

        // Special handling for Schedule-type commands
        // Check BEFORE single-param handling to prevent Schedule commands from being processed as regular single-param commands
        if (params.length === 1) {
          const [_paramName, paramDef] = params[0];
          if (paramDef.type === "Schedule") {
            const properties = feature.properties as Record<string, unknown> | undefined;
            const entriesProp = properties?.entries as { type?: string; value?: unknown } | undefined;
            
            // Only create sensor if we have a matching property with a meaningful value
            // Check that value exists, is not null, and if it's an object, has at least one key
            const hasValue = entriesProp?.value !== undefined && 
                           entriesProp.value !== null &&
                           (typeof entriesProp.value !== "object" || Object.keys(entriesProp.value as Record<string, unknown>).length > 0);
            
            if (entriesProp && entriesProp.type === "Schedule" && hasValue) {
              // Create a sensor to display the current schedule (read-only)
              // Use a simple state value (count of configured days) instead of full JSON
              const scheduleSensorKey = `${baseKey}_schedule`.toLowerCase();
              if (!components[scheduleSensorKey] && !commandComponents[scheduleSensorKey]) {
                const component: { platform: string; unique_id?: string; [key: string]: any } = {
                  platform: "sensor",
                  unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${scheduleSensorKey}`,
                  name: `${featureName} Schedule`,
                  state_topic: `${this.baseTopic}/installations/${this.installationId}/gateways/${this.gatewayId}/devices/${this.deviceId}/features/${feature.feature}`,
                  // Use a simple state: count of days with entries, or "configured" if schedule exists
                  // Home Assistant sensors require simple string states (max 255 chars), not JSON objects
                  // Extract a simple summary instead of the full JSON to avoid exceeding state length limit
                  // Use a very simple template that always returns a short string (max ~20 chars)
                  // Check if entries.value exists and is a dict, then count keys, otherwise show "configured"
                  // Simplified to avoid template errors - always returns a short string
                  value_template: "{% if value_json.properties.entries.value is defined %}{% set sched = value_json.properties.entries.value %}{% if sched is mapping %}{{ sched.keys() | list | length }} days{% else %}configured{% endif %}{% else %}not configured{% endif %}",
                  json_attributes_topic: `${this.baseTopic}/installations/${this.installationId}/gateways/${this.gatewayId}/devices/${this.deviceId}/features/${feature.feature}`,
                  json_attributes_template: "{{ value_json.properties.entries.value | tojson }}",
                };
                // Schedule commands are not service commands, but if setSchedule is service, mark sensor as disabled
                HomeAssistantDiscovery.addServiceCommandProperties(component, isServiceCommand);
                commandComponents[scheduleSensorKey] = component;
              }
            }
            
            // Skip creating any component for Schedule commands (with or without values)
            // Schedule commands should be triggered via MQTT service calls in automations
            // Command topic: {baseTopic}/installations/{id}/gateways/{gw}/devices/{dev}/features/{feature}/commands/{commandName}/set
            continue;
          }
        }

        if (params.length === 1) {
          const [paramName, paramDef] = params[0];
          const componentKey = `${baseKey}_${commandName}_${paramName}`.toLowerCase();
          if (components[componentKey] || commandComponents[componentKey]) {
            continue;
          }

          const stateConfig =
            HomeAssistantDiscovery.getCommandStateConfig(
              feature,
              paramName,
              feature.feature,
              this.baseTopic,
              this.installationId,
              this.gatewayId,
              this.deviceId,
            );

          // Check if there's already a sensor component for this feature that we can enhance
          const existingFeatureComponents = featureComponents.filter(
            ({ component }) => component.platform === "sensor",
          );
          
          // If there's a sensor component for this feature and the command parameter matches a property,
          // enhance the existing sensor instead of creating a new component
          if (existingFeatureComponents.length > 0 && stateConfig) {
            const properties = feature.properties as Record<string, unknown> | undefined;
            const semanticMatches: Record<string, string[]> = {
              // Temperature-related
              targetTemperature: ["temperature", "temp", "value"],
              targetTemp: ["temperature", "temp", "value"],
              temperature: ["temperature", "temp", "value"],
              temp: ["temperature", "temp", "value"],
              // Mode-related (mode parameter -> value property)
              mode: ["value", "mode"],
              // Gas type (gasType parameter -> value property)
              gasType: ["value", "type"],
              // Active/boolean state
              active: ["active", "value", "enabled"],
              // Schedule-related (newSchedule parameter -> entries property)
              newSchedule: ["entries", "schedule", "value"],
              // Weekday-related (weekday parameter -> weekdays property)
              weekday: ["weekdays", "weekday", "value"],
            };
            const candidates = [paramName, ...(semanticMatches[paramName] ?? [])];
            
            // Check if any property matches semantically
            let hasMatchingProperty = false;
            for (const candidate of candidates) {
              const prop = properties?.[candidate] as
                | { value?: unknown; unit?: string; type?: string }
                | undefined;
              if (prop && typeof prop === "object" && "value" in prop) {
                hasMatchingProperty = true;
                break;
              }
            }
            
            if (hasMatchingProperty) {
              // Enhance the first sensor component for this feature with command capability
              const existingComponent = existingFeatureComponents[0].component;
              if (!existingComponent.command_topic) {
                existingComponent.command_topic = this.generateCommandTopic(
                  feature.feature,
                  commandName,
                );
                if (paramDef.type === "number") {
                  existingComponent.command_template =
                    HomeAssistantDiscovery.buildSingleParamCommandTemplate(
                      paramName,
                      paramDef.type,
                    );
                  const constraints = paramDef.constraints as {
                    min?: number;
                    max?: number;
                    stepping?: number;
                  } | undefined;
                  if (constraints?.min !== undefined) {
                    existingComponent.min = constraints.min;
                  }
                  if (constraints?.max !== undefined) {
                    existingComponent.max = constraints.max;
                  }
                  if (constraints?.stepping !== undefined) {
                    existingComponent.step = constraints.stepping;
                  }
                }
                // Mark as disabled if this is a service technician command
                HomeAssistantDiscovery.addServiceCommandProperties(existingComponent, isServiceCommand);
              }
              // Skip creating a new component since we enhanced the existing one
              continue;
            }
          }

          // Skip creating components if we can't get a value (no matching property)
          if (!stateConfig) {
            continue;
          }

          if (
            (paramDef.constraints as { enum?: string[] } | undefined)?.enum &&
            paramDef.type === "string"
          ) {
            const enumValues =
              (paramDef.constraints as { enum?: string[] }).enum ?? [];
            const component: { platform: string; unique_id?: string; [key: string]: any } = {
              platform: "select",
              unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${componentKey}`,
              name: HomeAssistantDiscovery.buildCommandComponentName(
                featureName,
                commandName,
                paramName,
              ),
              options: enumValues,
              command_topic: this.generateCommandTopic(
                feature.feature,
                commandName,
              ),
              command_template:
                HomeAssistantDiscovery.buildSingleParamCommandTemplate(
                  paramName,
                  paramDef.type,
                ),
              ...stateConfig,
            };
            HomeAssistantDiscovery.addServiceCommandProperties(component, isServiceCommand);
            commandComponents[componentKey] = component;
            continue;
          }

          if (paramDef.type === "boolean") {
            const component: { platform: string; unique_id?: string; [key: string]: any } = {
              platform: "switch",
              unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${componentKey}`,
              name: HomeAssistantDiscovery.buildCommandComponentName(
                featureName,
                commandName,
                paramName,
              ),
              command_topic: this.generateCommandTopic(
                feature.feature,
                commandName,
              ),
              payload_on: `{"${paramName}": true}`,
              payload_off: `{"${paramName}": false}`,
              ...stateConfig,
            };
            HomeAssistantDiscovery.addServiceCommandProperties(component, isServiceCommand);
            commandComponents[componentKey] = component;
            continue;
          }

          if (paramDef.type === "number") {
            const constraints = paramDef.constraints as {
              min?: number;
              max?: number;
              stepping?: number;
            } | undefined;
            const component: { platform: string; unique_id?: string; [key: string]: any } = {
              platform: "number",
              unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${componentKey}`,
              name: HomeAssistantDiscovery.buildCommandComponentName(
                featureName,
                commandName,
                paramName,
              ),
              command_topic: this.generateCommandTopic(
                feature.feature,
                commandName,
              ),
              command_template:
                HomeAssistantDiscovery.buildSingleParamCommandTemplate(
                  paramName,
                  paramDef.type,
                ),
              mode: "box",
              ...(constraints?.min !== undefined ? { min: constraints.min } : {}),
              ...(constraints?.max !== undefined ? { max: constraints.max } : {}),
              ...(constraints?.stepping !== undefined
                ? { step: constraints.stepping }
                : {}),
              ...stateConfig,
            };
            HomeAssistantDiscovery.addServiceCommandProperties(component, isServiceCommand);
            commandComponents[componentKey] = component;
            continue;
          }

          const component: { platform: string; unique_id?: string; [key: string]: any } = {
            platform: "text",
            unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${componentKey}`,
            name: HomeAssistantDiscovery.buildCommandComponentName(
              featureName,
              commandName,
              paramName,
            ),
            command_topic: this.generateCommandTopic(
              feature.feature,
              commandName,
            ),
            command_template:
              HomeAssistantDiscovery.buildSingleParamCommandTemplate(
                paramName,
                paramDef.type,
              ),
            ...stateConfig,
          };
          HomeAssistantDiscovery.addServiceCommandProperties(component, isServiceCommand);
          commandComponents[componentKey] = component;
          continue;
        }

        // For multi-param commands, try to create individual components for each parameter
        // if they have matching properties
        let createdComponents = false;
        for (const [paramName, paramDef] of params) {
          const stateConfig =
            HomeAssistantDiscovery.getCommandStateConfig(
              feature,
              paramName,
              feature.feature,
              this.baseTopic,
              this.installationId,
              this.gatewayId,
              this.deviceId,
            );
          
          if (stateConfig) {
            // Create individual component for this parameter
            const paramComponentKey = `${baseKey}_${commandName}_${paramName}`.toLowerCase();
            if (components[paramComponentKey] || commandComponents[paramComponentKey]) {
              continue;
            }
            
            if (
              (paramDef.constraints as { enum?: string[] } | undefined)?.enum &&
              paramDef.type === "string"
            ) {
              const enumValues =
                (paramDef.constraints as { enum?: string[] }).enum ?? [];
              const component: { platform: string; unique_id?: string; [key: string]: any } = {
                platform: "select",
                unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${paramComponentKey}`,
                name: HomeAssistantDiscovery.buildCommandComponentName(
                  featureName,
                  commandName,
                  paramName,
                ),
                options: enumValues,
                command_topic: this.generateCommandTopic(
                  feature.feature,
                  commandName,
                ),
                command_template:
                  HomeAssistantDiscovery.buildSingleParamCommandTemplate(
                    paramName,
                    paramDef.type,
                  ),
                ...stateConfig,
              };
              HomeAssistantDiscovery.addServiceCommandProperties(component, isServiceCommand);
              commandComponents[paramComponentKey] = component;
              createdComponents = true;
            } else if (paramDef.type === "number") {
              const constraints = paramDef.constraints as {
                min?: number;
                max?: number;
                stepping?: number;
              } | undefined;
              const component: { platform: string; unique_id?: string; [key: string]: any } = {
                platform: "number",
                unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${paramComponentKey}`,
                name: HomeAssistantDiscovery.buildCommandComponentName(
                  featureName,
                  commandName,
                  paramName,
                ),
                command_topic: this.generateCommandTopic(
                  feature.feature,
                  commandName,
                ),
                command_template:
                  HomeAssistantDiscovery.buildSingleParamCommandTemplate(
                    paramName,
                    paramDef.type,
                  ),
                mode: "box",
                ...(constraints?.min !== undefined ? { min: constraints.min } : {}),
                ...(constraints?.max !== undefined ? { max: constraints.max } : {}),
                ...(constraints?.stepping !== undefined
                  ? { step: constraints.stepping }
                  : {}),
                ...stateConfig,
              };
              HomeAssistantDiscovery.addServiceCommandProperties(component, isServiceCommand);
              commandComponents[paramComponentKey] = component;
              createdComponents = true;
            } else if (paramDef.type === "boolean") {
              const component: { platform: string; unique_id?: string; [key: string]: any } = {
                platform: "switch",
                unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${paramComponentKey}`,
                name: HomeAssistantDiscovery.buildCommandComponentName(
                  featureName,
                  commandName,
                  paramName,
                ),
                command_topic: this.generateCommandTopic(
                  feature.feature,
                  commandName,
                ),
                payload_on: `{"${paramName}": true}`,
                payload_off: `{"${paramName}": false}`,
                ...stateConfig,
              };
              HomeAssistantDiscovery.addServiceCommandProperties(component, isServiceCommand);
              commandComponents[paramComponentKey] = component;
              createdComponents = true;
            }
          }
        }
        
        // If we created individual components, skip creating a text component
        if (createdComponents) {
          continue;
        }
        
        // Skip creating components for commands without matching properties
        // (no value to display)
        continue;
      }
    }

    return commandComponents;
  }

  /**
   * Check if a feature path is a circuit container feature (heating.circuits.{id}).
   * These features are only used internally to get circuit names and shouldn't create entities.
   */
  private static isCircuitContainerFeature(featurePath: string): boolean {
    // Match exactly "heating.circuits.{number}" with no additional path segments
    return /^heating\.circuits\.\d+$/.test(featurePath);
  }

  /**
   * Extract circuit ID from a circuit feature path and get the circuit name.
   * Returns the circuit name if available, or null if not a circuit feature or name not found.
   */
  private getCircuitNameForFeature(
    featurePath: string,
    features: ApiFeature[],
  ): string | null {
    // Check if this is a circuit feature (pattern: heating.circuits.\d+)
    const circuitMatch = featurePath.match(/^heating\.circuits\.(\d+)/);
    if (!circuitMatch) {
      return null;
    }

    const circuitId = circuitMatch[1];
    const circuitFeaturePath = `heating.circuits.${circuitId}`;
    
    // Find the circuit feature to get its name
    const circuitFeature = features.find((f) => f.feature === circuitFeaturePath);
    if (!circuitFeature || !circuitFeature.properties) {
      return null;
    }

    // Get the name property from the circuit feature
    const nameProperty = circuitFeature.properties.name as
      | { value?: string }
      | undefined;
    
    if (nameProperty && typeof nameProperty === "object" && "value" in nameProperty) {
      const circuitName = nameProperty.value;
      return typeof circuitName === "string" && circuitName.trim() !== ""
        ? circuitName
        : null;
    }

    return null;
  }

  /**
   * Generate component configs for all enabled features automatically.
   * This generates sensors for features that don't have decorators.
   */
  private generateComponentsFromAllFeatures(
    device: Device,
    decoratedFeaturePaths: Set<string>,
    features: ApiFeature[],
  ): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
    const components: Record<string, { platform: string; unique_id?: string; [key: string]: any }> = {};

    // Use provided features instead of fetching again
    // Filter enabled features that aren't already handled by decorators
    // Exclude circuit container features (heating.circuits.{id}) - these are only used internally
    // to get circuit names for other entities and shouldn't create their own entities
    // Exclude list features (heating.burners, heating.circuits) - these are containers for lists
    // and shouldn't create entities, but data should still be published to MQTT
    const enabledFeatures = features.filter(
      (f: ApiFeature) => {
        // Exclude circuit container features (heating.circuits.{id}) - these are only used internally
        // to get circuit names for other entities and shouldn't create their own entities
        if (HomeAssistantDiscovery.isCircuitContainerFeature(f.feature)) {
          return false;
        }
        // Exclude list features (heating.burners, heating.circuits) - these are containers
        // and shouldn't create entities, but data should still be published to MQTT
        if (Device.isListFeature(f.feature)) {
          return false;
        }
        return (
          f.isEnabled &&
          f.properties &&
          Object.keys(f.properties).length > 0 &&
          !decoratedFeaturePaths.has(f.feature)
        );
      },
    );

    for (const feature of enabledFeatures) {
       
      const featurePath = feature.feature;
       
      const properties = feature.properties as Record<string, unknown>;

      // Determine platform using rules
      const platform = HomeAssistantDiscovery.determinePlatform(
        featurePath,
        properties,
      );

      // Generate component key and name
      const componentKey =
        HomeAssistantDiscovery.generateComponentKey(featurePath);
      let featureName = getFeatureName(featurePath);
      
      // If this is a circuit feature, try to get the circuit name and prepend it
      const circuitName = this.getCircuitNameForFeature(featurePath, features);
      if (circuitName) {
        featureName = `${circuitName} ${featureName}`;
      }

       
      const propsKeys = Object.keys(properties);

      // Check for timeseries pattern (countOne-countSeven with timestampOne-timestampSeven)
      const countProperties = propsKeys.filter(
        (key) =>
          key.startsWith("count") &&
          /^count(One|Two|Three|Four|Five|Six|Seven)$/.test(key),
      );
      const hasCountTimestampPattern =
        countProperties.length > 0 &&
        countProperties.every((countKey) => {
          const timestampKey = countKey.replace("count", "timestamp");
          return propsKeys.includes(timestampKey);
        });

      // Handle timeseries features (create individual sensors for each count)
      if (hasCountTimestampPattern && platform === "sensor") {
        // Extract unit from first count property
        const firstCountProp = properties[
          countProperties[0]
        ] as Record<string, unknown> | undefined;
        const unit = firstCountProp?.unit as string | undefined;
        const unitOfMeasurement = unit ? normalizeUnit(unit) : undefined;

        // Create sensors for each count
        const countNumbers = [
          "One",
          "Two",
          "Three",
          "Four",
          "Five",
          "Six",
          "Seven",
        ];
        for (const countKey of countProperties.sort()) {
          const countNumber = countKey.replace("count", "");
          const countIndex = countNumbers.indexOf(countNumber) + 1;

          const countComponent: { platform: string; unique_id?: string; [key: string]: any } = {
            platform: "sensor",
            unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${componentKey}_count_${countIndex}`,
            name: `${featureName} Count ${countIndex}`,
            state_topic: `${this.baseTopic}/installations/${this.installationId}/gateways/${this.gatewayId}/devices/${this.deviceId}/features/${featurePath}`,
            value_template: `{{ value_json.properties.${countKey}.value | int }}`,
            // Count sensors are numeric, so state_class is safe
            state_class: "measurement",
            ...(unitOfMeasurement && { unit_of_measurement: unitOfMeasurement }),
          };
          // Mark service technician features as disabled
          // Don't set entity_category for sensors - just disable them
          if (HomeAssistantDiscovery.isServiceTechnicianFeature(featurePath)) {
            countComponent.enabled_by_default = false;
            countComponent.en = false; // Abbreviation
          }
          // Count sensors are diagnostic (historical data)
          countComponent.entity_category = "diagnostic";
          countComponent.ent_cat = "diagnostic"; // Abbreviation
          components[`${componentKey}_count_${countIndex}`] = countComponent;
        }
        continue; // Skip rest of loop - timeseries handled
      }

      // Handle device.configuration - create individual entities for each property
      if (featurePath === "device.configuration") {
        const baseFeatureName = getFeatureName(featurePath);
        
        for (const [propKey, propValue] of Object.entries(properties)) {
          if (!propValue || typeof propValue !== "object" || !("type" in propValue) || !("value" in propValue)) {
            continue;
          }
          
          const prop = propValue as { type: string; value: unknown };
          const propType = prop.type;
          
          // Determine platform based on property type
          let propPlatform: "sensor" | "binary_sensor";
          let valueTemplate: string;
          let deviceClass: string | undefined;
          
          if (propType === "boolean") {
            propPlatform = "binary_sensor";
            deviceClass = propKey.toLowerCase().includes("active") ? "heat" : undefined;
            valueTemplate = safeValueTemplate(`${propKey}.value`, true);
          } else if (propType === "array") {
            propPlatform = "sensor";
            // For arrays, show as comma-separated list
            valueTemplate = `{% if value_json is defined %}{% if value_json.properties is defined %}{% if value_json.properties.${propKey} is defined %}{% if value_json.properties.${propKey}.value is defined %}{% if value_json.properties.${propKey}.value is iterable %}{{ value_json.properties.${propKey}.value|join(', ') }}{% else %}{{ value_json.properties.${propKey}.value }}{% endif %}{% endif %}{% endif %}{% endif %}{% endif %}`;
          } else {
            // string or other types
            propPlatform = "sensor";
            valueTemplate = safeValueTemplate(`${propKey}.value`, false);
          }
          
          // Generate component key and name
          const propComponentKey = `${componentKey}_${propKey}`;
          const propName = propKey
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (str) => str.toUpperCase())
            .trim();
          
          const componentConfig: { platform: string; unique_id?: string; [key: string]: any } = {
            platform: propPlatform,
            unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${propComponentKey}`,
            name: `${baseFeatureName} ${propName}`,
            state_topic: `${this.baseTopic}/installations/${this.installationId}/gateways/${this.gatewayId}/devices/${this.deviceId}/features/${featurePath}`,
            value_template: valueTemplate,
          };
          
          if (deviceClass) {
            componentConfig.device_class = deviceClass;
          }
          
          // Mark as diagnostic/configuration entity
          componentConfig.entity_category = "diagnostic";
          componentConfig.ent_cat = "diagnostic"; // Abbreviation
          
          components[propComponentKey] = componentConfig;
        }
        
        // Skip rest of loop - device.configuration handled
        continue;
      }

      // Check for time-based properties (day/week/month/year or currentDay/etc.)
      const timeBasedKeys = [
        "day",
        "week",
        "month",
        "year",
        "currentDay",
        "lastSevenDays",
        "currentMonth",
        "lastMonth",
        "currentYear",
        "lastYear",
      ];
      const timeBasedProperties = timeBasedKeys.filter((key) => {
        const prop = properties[key] as Record<string, unknown> | undefined;
        return (
          prop !== undefined &&
          typeof prop === "object" &&
          "value" in prop &&
          (Array.isArray(prop.value) || typeof prop.value === "number")
        );
      });

      // Create separate sensors for multiple time-based properties
      if (timeBasedProperties.length > 1 && platform === "sensor") {
        // Find unit from time-based properties
        const rawUnit = timeBasedProperties
          .map((key) => properties[key] as Record<string, unknown> | undefined)
          .find((prop) => prop?.unit !== undefined)?.unit as string | undefined;

        // Determine device class and unit using existing rules
        const { deviceClass: timeBasedDeviceClass } = rawUnit
          ? HomeAssistantDiscovery.determineDeviceClass(featurePath, rawUnit)
          : { deviceClass: undefined };
        const timeBasedUnit = rawUnit
          ? normalizeUnit(rawUnit, timeBasedDeviceClass)
          : undefined;

        // Fallback defaults for common patterns
        const finalTimeDeviceClass =
          timeBasedDeviceClass ||
          (featurePath.includes("consumption") &&
            featurePath.includes("power") &&
            "energy") ||
          (featurePath.includes("production") &&
            featurePath.includes("heat") &&
            "energy") ||
          (featurePath.includes("production") &&
            featurePath.includes("power") &&
            "power") ||
          undefined;
        const finalTimeUnit =
          timeBasedUnit ||
          (finalTimeDeviceClass === "energy" && "kWh") ||
          (finalTimeDeviceClass === "power" && "W") ||
          undefined;

        // Create a sensor for each time-based property
        for (const timeKey of timeBasedProperties) {
           
          const timeProp = properties[timeKey] as Record<string, unknown> | undefined;
          const isArrayValue = timeProp && typeof timeProp === "object" && "value" in timeProp && Array.isArray(timeProp.value);
          
          // Use array access for array values, direct value access for numeric values
          const timePropertyPath = isArrayValue ? `${timeKey}.value[0]` : `${timeKey}.value`;
          const timeValueTemplate = safeValueTemplate(timePropertyPath, false);
          
          // Create component key with time unit suffix
          const timeComponentKey = `${componentKey}_${timeKey}`;
          
          // Create sensor name with time unit (format: "Current Day", "Last Seven Days", etc.)
          const formattedTimeKey = timeKey
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (str) => str.toUpperCase())
            .trim();
          const timeFeatureName = `${featureName} (${formattedTimeKey})`;

          const timeComponentConfig: { platform: string; unique_id?: string; [key: string]: any } = {
            platform,
            unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${timeComponentKey}`,
            name: timeFeatureName,
            state_topic: `${this.baseTopic}/installations/${this.installationId}/gateways/${this.gatewayId}/devices/${this.deviceId}/features/${featurePath}`,
            value_template: timeValueTemplate,
          };

          if (finalTimeDeviceClass && finalTimeUnit) {
            timeComponentConfig.device_class = finalTimeDeviceClass;
            timeComponentConfig.unit_of_measurement = finalTimeUnit;
          } else if (finalTimeUnit) {
            timeComponentConfig.unit_of_measurement = finalTimeUnit;
          }

          // Mark service technician features as disabled
          // Don't set entity_category for sensors - just disable them
          if (HomeAssistantDiscovery.isServiceTechnicianFeature(featurePath)) {
            timeComponentConfig.enabled_by_default = false;
            timeComponentConfig.en = false; // Abbreviation
          }
          // Time-based sensors (week/month/year) are diagnostic (historical data)
          timeComponentConfig.entity_category = "diagnostic";
          timeComponentConfig.ent_cat = "diagnostic"; // Abbreviation

          components[timeComponentKey] = timeComponentConfig;
        }

        // Skip the rest of the loop since we've created all sensors for this feature
        continue;
      }

      // Find property path using rules
      let propertyPath: string;
      let initialDeviceClass: string | undefined;

      if (platform === "binary_sensor") {
        const binaryPath = HomeAssistantDiscovery.findBinarySensorPropertyPath(
          featurePath,
          properties,
        );
        if (!binaryPath) {
          continue; // Can't determine binary sensor path
        }
        propertyPath = binaryPath.path;
        initialDeviceClass = binaryPath.deviceClass;
      } else {
        propertyPath = HomeAssistantDiscovery.findSensorPropertyPath(
          featurePath,
          properties,
        );

        // Skip temperature/pressure sensors if only status exists without numeric value
        if (
          (featurePath.includes("temperature") ||
            featurePath.includes("pressure")) &&
          propertyPath === "status.value"
        ) {
          const statusProp = properties.status as
            | { value?: unknown }
            | undefined;
          const statusValue = statusProp?.value;
          const hasValue = properties.value !== undefined;
          if (!hasValue && typeof statusValue !== "number") {
            continue; // Skip - no numeric value
          }
        }
      }

      // Use device-specific detection logic (can be overridden by device subclasses)
       
      const detection = device.detectDeviceClassAndUnit(
        featurePath,
        propertyPath,
        properties,
      );
       
      const deviceClass = detection.deviceClass || initialDeviceClass;
       
      let unitOfMeasurement = detection.unitOfMeasurement;

      // Use percentage template if unit is percent or feature path includes modulation
      // Use numeric template for numeric values to ensure they're treated as numbers
      let valueTemplate: string;
      if (unitOfMeasurement === "%" || featurePath.includes("modulation")) {
        valueTemplate = percentageValueTemplate(propertyPath);
      } else if (platform === "sensor") {
        // Check if the property is numeric by inspecting the property structure
        const propKey = propertyPath.split(".")[0];
        const prop = properties[propKey] as Record<string, unknown> | undefined;
        const isNumericProperty = prop && typeof prop === "object" && "type" in prop && prop.type === "number";
        
        if (isNumericProperty && propertyPath.includes(".value") && !propertyPath.includes("[")) {
          // Use direct template with float filter to ensure numeric output
          // Handle both "value.value" and "prop.value" paths
          if (propertyPath === "value.value") {
            valueTemplate = "{{ value_json.properties.value.value | float }}";
          } else {
            const propPathWithoutValue = propertyPath.replace(".value", "");
            valueTemplate = `{{ value_json.properties.${propPathWithoutValue}.value | float }}`;
          }
        } else {
          valueTemplate = safeValueTemplate(propertyPath, false);
        }
      } else {
        // Binary sensor
        valueTemplate = safeValueTemplate(propertyPath, true);
      }

      const componentConfig: { platform: string; unique_id?: string; [key: string]: any } = {
        platform,
        unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${componentKey}`,
        name: featureName,
        state_topic: `${this.baseTopic}/installations/${this.installationId}/gateways/${this.gatewayId}/devices/${this.deviceId}/features/${featurePath}`,
        value_template: valueTemplate,
      };

      // Only set device_class if we have a valid unit_of_measurement
      // Home Assistant requires a valid unit for device classes like energy and pressure
      // For pressure and energy sensors, ensure we always have a unit (use defaults if needed)
      if (deviceClass === "pressure") {
        // Validate that we have a valid Home Assistant pressure unit
        const validPressureUnits = ["Pa", "kPa", "hPa", "bar", "cbar", "mbar", "mmHg", "inHg", "psi", "inH₂O", "dbar"];
        if (!unitOfMeasurement || !validPressureUnits.includes(unitOfMeasurement)) {
          unitOfMeasurement = "bar"; // Default unit for pressure
        }
      } else if (deviceClass === "energy") {
        // Validate that we have a valid Home Assistant energy unit
        const validEnergyUnits = ["Wh", "kWh", "MWh", "GWh", "J", "kJ", "MJ", "GJ", "cal", "kcal", "Mcal", "Gcal", "BTU"];
        if (!unitOfMeasurement || !validEnergyUnits.includes(unitOfMeasurement)) {
          unitOfMeasurement = "kWh"; // Default unit for energy
        }
      }
      
      if (deviceClass && unitOfMeasurement) {
        componentConfig.device_class = deviceClass;
        componentConfig.unit_of_measurement = unitOfMeasurement;
      } else if (unitOfMeasurement) {
        // If we have a unit but no device class, just set the unit
        componentConfig.unit_of_measurement = unitOfMeasurement;
      }

      // Add state_class for numeric sensors to help Home Assistant recognize them as numbers
      // Only set if we're certain the value will be numeric (not an array or object)
      if (platform === "sensor" && !deviceClass) {
        // Check if this is a numeric sensor (has a numeric value property)
        const propKey = propertyPath.split(".")[0];
        const prop = properties[propKey] as Record<string, unknown> | undefined;
        if (
          prop &&
          typeof prop === "object" &&
          "type" in prop &&
          prop.type === "number" &&
          "value" in prop &&
          typeof prop.value === "number" &&
          !Array.isArray(prop.value) &&
          !propertyPath.includes("[") // Don't set state_class for array access paths
        ) {
          // Only set state_class if the actual value is numeric (not an array or object)
          componentConfig.state_class = "measurement";
        }
      }

      // Mark service technician features as disabled
      if (HomeAssistantDiscovery.isServiceTechnicianFeature(featurePath)) {
        componentConfig.enabled_by_default = false;
        componentConfig.en = false; // Abbreviation
        // Service technician sensors should use "diagnostic" category, not "config"
        // Only command/control components can use "config" category
        componentConfig.entity_category = "diagnostic";
        componentConfig.ent_cat = "diagnostic"; // Abbreviation
      } else {
        // Set entity_category for diagnostic sensors (non-service technician)
        const entityCategory = HomeAssistantDiscovery.determineEntityCategory(
          featurePath,
          platform,
          deviceClass,
          properties,
        );
        if (entityCategory) {
          componentConfig.entity_category = entityCategory;
          componentConfig.ent_cat = entityCategory; // Abbreviation
        }
      }

      components[componentKey] = componentConfig;
    }

    return components;
  }

}
