import { Device } from "./base.js";
import { getDiscoverableMethods } from "./discovery.js";
import { Feature as ApiFeature } from "../models.js";

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
  async generateDeviceDiscoveryConfig(
    device: Device,
    features: ApiFeature[],
  ): Promise<HomeAssistantDeviceDiscoveryConfig> {
    // Base device info
    const deviceInfo = {
      identifiers: [
        `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}`,
      ],
      name: `${device.getModelId()} (${this.deviceId})`,
      manufacturer: "Viessmann",
      model: device.getModelId(),
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
    const decoratedComponents = await this.generateComponentsFromDecorators(device, features);
    const decoratedFeaturePaths = new Set<string>();
    for (const component of Object.values(decoratedComponents)) {
      // Extract feature path from state_topic
       
      const stateTopic = component.state_topic as string;
      if (stateTopic) {
        const match = stateTopic.match(/\/features\/(.+)$/);
        if (match) {
          decoratedFeaturePaths.add(match[1]);
        }
      }
    }
    Object.assign(components, decoratedComponents);

    // Complex components (circuit sensors, climate, heating curves, time-based, burner sensors)
    // are now generated declaratively via device.generateHomeAssistantComponents()

    // Enhance existing components with generic feature-based enhancement (unit normalization, device classes, etc.)
    await this.enhanceComponentsFromFeatures(device, components, features);

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
    for (const component of Object.values(deviceComponents)) {
       
      const stateTopic = component.state_topic as string;
      if (stateTopic) {
        const match = stateTopic.match(/\/features\/(.+)$/);
        if (match) {
          decoratedFeaturePaths.add(match[1]);
        }
      }
    }
    Object.assign(components, deviceComponents);

    // Generate components for all other enabled features that don't have decorators
    const autoComponents = await this.generateComponentsFromAllFeatures(device, decoratedFeaturePaths, features);
    Object.assign(components, autoComponents);

    return {
      device: deviceInfo,
      origin,
      components,
    };
  }


  /**
   * Generate component configs from decorated methods.
   */
  private async generateComponentsFromDecorators(
    device: Device,
    features: ApiFeature[],
  ): Promise<Record<string, { platform: string; unique_id?: string; [key: string]: any }>> {
    const components: Record<string, { platform: string; unique_id?: string; [key: string]: any }> = {};
    const discoverableMethods = getDiscoverableMethods(device);

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
      const featureName = getFeatureName(metadata.featurePath);

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
      );

      Object.assign(components, timeBasedComponents);
    }
  }

  /**
   * Generic component enhancement based on actual feature data.
   * This replaces device-specific enhancement logic by analyzing features
   * and enhancing components based on their actual properties.
   */
  private async enhanceComponentsFromFeatures(
    device: Device,
    components: Record<string, { platform: string; unique_id?: string; [key: string]: any }>,
    features: ApiFeature[],
  ): Promise<void> {
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
        this.enhanceComponent(componentKey, component, feature, components);
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
   */
  private static findSensorPropertyPath(
    featurePath: string,
    properties: Record<string, unknown>,
  ): string {
    // Determine priority list based on feature path
    let priority: string[];
    if (featurePath.includes("temperature") || featurePath.includes("pressure")) {
      priority = this.PROPERTY_PATH_PRIORITY.temperature;
    } else if (featurePath.includes("summary")) {
      priority = this.PROPERTY_PATH_PRIORITY.summary;
    } else {
      priority = this.PROPERTY_PATH_PRIORITY.default;
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

      // Handle array values
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

  /**
   * Generate component configs for all enabled features automatically.
   * This generates sensors for features that don't have decorators.
   */
  private async generateComponentsFromAllFeatures(
    device: Device,
    decoratedFeaturePaths: Set<string>,
    features: ApiFeature[],
  ): Promise<Record<string, { platform: string; unique_id?: string; [key: string]: any }>> {
    const components: Record<string, { platform: string; unique_id?: string; [key: string]: any }> = {};

    // Use provided features instead of fetching again
    // Filter enabled features that aren't already handled by decorators
     
    const enabledFeatures = features.filter(
      (f: ApiFeature) =>
        f.isEnabled &&
        f.properties &&
        Object.keys(f.properties).length > 0 &&
        !decoratedFeaturePaths.has(f.feature),
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
      const featureName = getFeatureName(featurePath);

       
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

          components[`${componentKey}_count_${countIndex}`] = {
            platform: "sensor",
            unique_id: `viessmann_${this.installationId}_${this.gatewayId}_${this.deviceId}_${componentKey}_count_${countIndex}`,
            name: `${featureName} Count ${countIndex}`,
            state_topic: `${this.baseTopic}/installations/${this.installationId}/gateways/${this.gatewayId}/devices/${this.deviceId}/features/${featurePath}`,
            value_template: `{{ value_json.properties.${countKey}.value | int }}`,
            state_class: "measurement",
            ...(unitOfMeasurement && { unit_of_measurement: unitOfMeasurement }),
          };
        }
        continue; // Skip rest of loop - timeseries handled
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
      if (platform === "sensor" && !deviceClass) {
        // Check if this is a numeric sensor (has a numeric value property)
        const propKey = propertyPath.split(".")[0];
        const prop = properties[propKey] as Record<string, unknown> | undefined;
        if (prop && typeof prop === "object" && "type" in prop && prop.type === "number") {
          componentConfig.state_class = "measurement";
        }
      }

      components[componentKey] = componentConfig;
    }

    return components;
  }

}
