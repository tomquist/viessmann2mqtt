import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load data-points.json for feature name/description lookup
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const dataPointsPath = join(currentDir, "../data-points.json");

interface Feature {
  name: string;
  description: string;
  title?: string;
  groups: string[];
}

interface FeatureSection {
  _id: string;
  section: string;
  features: Feature[];
}

interface DataPoints {
  sections: FeatureSection[];
}

let dataPointsCache: Map<string, Feature> | null = null;

/**
 * Load and cache data points for feature name/description lookup.
 */
function getDataPoints(): Map<string, Feature> {
  if (dataPointsCache === null) {
     
    const data = JSON.parse(readFileSync(dataPointsPath, "utf-8")) as DataPoints;
    dataPointsCache = new Map();
    for (const section of data.sections) {
      for (const feature of section.features) {
        dataPointsCache.set(feature.name, feature);
      }
    }
  }
  return dataPointsCache;
}

/**
 * Mapping table from API unit format to Home Assistant unit format.
 * Home Assistant expects specific unit formats (e.g., "kWh" not "kilowattHour").
 */
const UNIT_MAP: Record<string, string> = {
  // Energy units
  kilowatthour: "kWh",
  "kilowatthour/year": "kWh",
  
  // Volume units
  cubicmeter: "m³",
  "m³": "m³",
  liter: "L",
  
  // Pressure units
  bar: "bar",
  
  // Temperature units
  celsius: "°C",
  fahrenheit: "°F",
  kelvin: "K",
  
  // Time units
  hour: "h",
  minute: "min",
  second: "s",
  
  // Power units
  watt: "W",
  kilowatt: "kW",
  megawatt: "MW",
  
  // Volumetric flow units
  "liter/hour": "L/h",
  
  // Distance/length units
  meter: "m",
  
  // Angle units
  degree: "°",
  
  // Percentage units
  percent: "%",
  
  // Energy density units
  kilowatthourpercubicmeter: "kWh/m³",
};

/**
 * Normalize unit from API format to Home Assistant format.
 * Home Assistant expects specific unit formats (e.g., "kWh" not "kilowattHour").
 */
export function normalizeUnit(unit: string | null | undefined, deviceClass?: string): string | undefined {
  if (!unit) {
    return undefined;
  }

  const unitLower = unit.toLowerCase();
  
  // For energy device class, validate that the unit is a valid energy unit
  if (deviceClass === "energy") {
    const normalized = UNIT_MAP[unitLower];
    // Only return if it's a valid energy unit (kWh, Wh, etc.)
    if (normalized && (normalized.endsWith("Wh") || normalized.endsWith("h"))) {
      return normalized;
    }
    // If unit is not a valid energy unit (e.g., cubicMeter), return undefined
    // This signals that the unit shouldn't be used with energy device class
    return undefined;
  }
  
  // For pressure device class, validate that the unit is a valid pressure unit
  if (deviceClass === "pressure") {
    const normalized = UNIT_MAP[unitLower];
    // Only return if it's a valid pressure unit
    if (normalized && (normalized === "bar" || normalized.endsWith("bar") || normalized.endsWith("Pa") || normalized.endsWith("Hg") || normalized === "psi")) {
      return normalized;
    }
    // If unit is not a valid pressure unit, return undefined
    return undefined;
  }

  // Look up unit in mapping table
  return UNIT_MAP[unitLower] ?? unit;
}

/**
 * Map a single Viessmann mode value to Home Assistant climate mode.
 * Home Assistant expects: "off", "heat", "cool", "auto", "dry", "fan_only"
 */
function mapViessmannModeToHomeAssistant(mode: string): string {
  // Map Viessmann modes to Home Assistant modes
  if (mode === "Nothing" || mode.toLowerCase().includes("off")) {
    return "off";
  }
  if (mode.includes("Weather") && !mode.includes("Room")) {
    return "auto"; // Weather-controlled can be considered auto
  }
  // All other modes are heating-related for heating systems
  return "heat";
}

/**
 * Map Viessmann API modes to Home Assistant climate modes.
 * Home Assistant expects: "off", "heat", "cool", "auto", "dry", "fan_only"
 */
export function mapViessmannModesToHomeAssistant(modes: string[]): string[] {
  const validModes = new Set<string>();

  for (const mode of modes) {
    validModes.add(mapViessmannModeToHomeAssistant(mode));
  }

  // Always include "off" if we have any modes
  if (validModes.size > 0 && !validModes.has("off")) {
    validModes.add("off");
  }

  // Return as array, sorted for consistency
  return Array.from(validModes).sort();
}

/**
 * Generate a Jinja2 template that maps Viessmann mode values to Home Assistant modes.
 */
export function generateModeMappingTemplate(): string {
  // Create a template that maps Viessmann mode names to Home Assistant modes
  // This uses Jinja2's conditional logic to map the values
  // Add safety checks for undefined values
  return `{% if value_json is defined and value_json.properties is defined and value_json.properties.value is defined and value_json.properties.value.value is defined %}
{% set mode = value_json.properties.value.value %}
{% if mode == "Nothing" or "off" in mode|lower %}off
{% elif "Weather" in mode and "Room" not in mode %}auto
{% else %}heat
{% endif %}
{% else %}off{% endif %}`;
}

/**
 * Generate a safe value template that handles missing properties gracefully.
 * @param propertyPath - Path like "value.value", "day.value[0]", "active.value"
 */
export function safeValueTemplate(propertyPath: string, isBinarySensor = false): string {
  // Simple case: just "value.value"
  if (propertyPath === "value.value") {
    // Use a more robust template that handles nested properties correctly
    const template = "{% if value_json is defined %}{% if value_json.properties is defined %}{% if value_json.properties.value is defined %}{% if value_json.properties.value.value is defined %}{{ value_json.properties.value.value }}{% endif %}{% endif %}{% endif %}{% endif %}";
    // For binary sensors, convert on/off strings and true/false booleans to ON/OFF
    if (isBinarySensor) {
      return "{% if value_json is defined %}{% if value_json.properties is defined %}{% if value_json.properties.value is defined %}{% if value_json.properties.value.value is defined %}{% if value_json.properties.value.value == true %}ON{% elif value_json.properties.value.value == false %}OFF{% elif value_json.properties.value.value|lower == \"on\" %}ON{% elif value_json.properties.value.value|lower == \"off\" %}OFF{% else %}{{ value_json.properties.value.value }}{% endif %}{% endif %}{% endif %}{% endif %}{% endif %}";
    }
    return template;
  }
  
  // Handle array access like "day.value[0]"
  if (propertyPath.includes("[") && propertyPath.includes("]")) {
    const match = propertyPath.match(/^(\w+)\.(\w+)\[(\d+)\]$/);
    if (match) {
      const [, prop, subProp, index] = match;
      return `{% if value_json is defined %}{% if value_json.properties is defined %}{% if value_json.properties.${prop} is defined %}{% if value_json.properties.${prop}.${subProp} is defined %}{% if value_json.properties.${prop}.${subProp} is iterable %}{% if value_json.properties.${prop}.${subProp}|length > ${index} %}{{ value_json.properties.${prop}.${subProp}[${index}] }}{% endif %}{% endif %}{% endif %}{% endif %}{% endif %}{% endif %}`;
    }
  }
  
  // Handle simple nested paths like "active.value" or "status.value"
  const parts = propertyPath.split(".");
  if (parts.length === 2) {
    const [prop, subProp] = parts;
    const baseTemplate = `{% if value_json is defined %}{% if value_json.properties is defined %}{% if value_json.properties.${prop} is defined %}{% if value_json.properties.${prop}.${subProp} is defined %}{{ value_json.properties.${prop}.${subProp} }}{% endif %}{% endif %}{% endif %}{% endif %}`;
    // For binary sensors, convert on/off strings and true/false booleans to ON/OFF
    if (isBinarySensor) {
      return `{% if value_json is defined %}{% if value_json.properties is defined %}{% if value_json.properties.${prop} is defined %}{% if value_json.properties.${prop}.${subProp} is defined %}{% if value_json.properties.${prop}.${subProp} == true %}ON{% elif value_json.properties.${prop}.${subProp} == false %}OFF{% elif value_json.properties.${prop}.${subProp}|lower == "on" %}ON{% elif value_json.properties.${prop}.${subProp}|lower == "off" %}OFF{% else %}{{ value_json.properties.${prop}.${subProp} }}{% endif %}{% endif %}{% endif %}{% endif %}{% endif %}`;
    }
    return baseTemplate;
  }
  
  // Fallback to default
  const fallbackTemplate = "{% if value_json is defined %}{% if value_json.properties is defined %}{% if value_json.properties.value is defined %}{% if value_json.properties.value.value is defined %}{{ value_json.properties.value.value }}{% endif %}{% endif %}{% endif %}{% endif %}";
  if (isBinarySensor) {
    return "{% if value_json is defined %}{% if value_json.properties is defined %}{% if value_json.properties.value is defined %}{% if value_json.properties.value.value is defined %}{% if value_json.properties.value.value == true %}ON{% elif value_json.properties.value.value == false %}OFF{% elif value_json.properties.value.value|lower == \"on\" %}ON{% elif value_json.properties.value.value|lower == \"off\" %}OFF{% else %}{{ value_json.properties.value.value }}{% endif %}{% endif %}{% endif %}{% endif %}{% endif %}";
  }
  return fallbackTemplate;
}

/**
 * Generate a value template for percentage values.
 * Converts values from 0-1 range to 0-100 range if needed, without modifying original data.
 * @param propertyPath - Path like "value.value"
 */
export function percentageValueTemplate(propertyPath: string): string {
  // Extract the value extraction part and wrap it with percentage conversion
  // If value is between 0 and 1 (exclusive), multiply by 100, otherwise use as-is
  if (propertyPath === "value.value") {
    return "{% if value_json is defined %}{% if value_json.properties is defined %}{% if value_json.properties.value is defined %}{% if value_json.properties.value.value is defined %}{% set val = value_json.properties.value.value %}{% if val > 0 and val <= 1 %}{{ (val * 100) | round(1) }}{% else %}{{ val }}{% endif %}{% endif %}{% endif %}{% endif %}{% endif %}";
  }
  
  // For other paths, use safe template (assume already in percentage format)
  return safeValueTemplate(propertyPath);
}

/**
 * Transform a feature path into a user-friendly name.
 * Examples:
 * "heating.sensors.temperature.outside" -> "Outside Temperature"
 * "heating.gas.consumption.heating" -> "Gas Consumption"
 * "heating.circuits.1.sensors.temperature.room" -> "Room Temperature"
 */
function transformFeaturePathToName(featurePath: string): string {
  // Extract a user-friendly name from the feature path
  const parts = featurePath.split(".");
  const relevantParts: string[] = [];
  
  // Skip "heating" prefix and common words, collect meaningful parts
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    // Skip common words that don't add meaning
    if (!["sensors", "temperature", "main", "value", "active", "status", "total", "heating", "dhw", "circuits", "operating", "modes", "programs"].includes(part)) {
      // Skip circuit numbers
      if (!/^\d+$/.test(part)) {
        relevantParts.push(part);
      }
    }
  }
  
  // Build name from relevant parts
  if (relevantParts.length > 0) {
    const name = relevantParts
      .map((part) => part
        .replace(/([A-Z])/g, " $1")
        .replace(/^\w/, (c) => c.toUpperCase())
        .trim())
      .join(" ");
    
    // Add "Temperature" if it's a temperature sensor
    if (featurePath.includes("temperature") && !name.toLowerCase().includes("temperature")) {
      return `${name} Temperature`;
    }
    
    // Add "Consumption" if it's a consumption sensor
    if (featurePath.includes("consumption") && !name.toLowerCase().includes("consumption")) {
      return `${name} Consumption`;
    }
    
    // Add "Pressure" if it's a pressure sensor
    if (featurePath.includes("pressure") && !name.toLowerCase().includes("pressure")) {
      return `${name} Pressure`;
    }
    
    return name;
  }
  
  // Final fallback: use meaningful parts from the path
  // Try to find a meaningful part from the end
  for (let i = parts.length - 1; i >= 1; i--) {
    const part = parts[i];
    if (!["main", "value", "active", "status", "total", "heating", "dhw", "current", "N"].includes(part) && !/^\d+$/.test(part)) {
      const name = part
        .replace(/([A-Z])/g, " $1")
        .replace(/^\w/, (c) => c.toUpperCase())
        .trim();
      
      // Add context if needed
      if (featurePath.includes("temperature") && !name.toLowerCase().includes("temperature")) {
        return `${name} Temperature`;
      }
      if (featurePath.includes("consumption") && !name.toLowerCase().includes("consumption")) {
        return `${name} Consumption`;
      }
      if (featurePath.includes("pressure") && !name.toLowerCase().includes("pressure")) {
        return `${name} Pressure`;
      }
      return name;
    }
  }
  
  // Absolute fallback: use the last part
  const lastPart = parts[parts.length - 1];
  return lastPart
    .replace(/([A-Z])/g, " $1")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim() || "Sensor";
}

/**
 * Get a user-friendly name from a feature path.
 * Looks up the feature in data-points.json and uses the title field if available.
 * Falls back to transforming the feature path if title is not available.
 */
export function getFeatureName(featurePath: string): string {
  const dataPoints = getDataPoints();
  
  // Try exact match first
  let feature = dataPoints.get(featurePath);
  
  // If not found, try replacing circuit numbers with N
  if (!feature) {
    const normalizedPath = featurePath.replace(/\.circuits\.\d+\./g, ".circuits.N.");
    feature = dataPoints.get(normalizedPath);
  }
  
  // If feature found in data-points.json, use its title field if available
  if (feature) {
    if (feature.title && typeof feature.title === "string") {
      return feature.title;
    }
    // Fallback: if no title, transform the name (feature path)
    return transformFeaturePathToName(feature.name);
  }
  
  // Fallback: transform the provided featurePath
  return transformFeaturePathToName(featurePath);
}

/**
 * Extract circuit ID from a circuit feature path and get the circuit name.
 * Returns the circuit name if available, or null if not a circuit feature or name not found.
 */
function getCircuitNameForFeaturePath(
  featurePath: string,
  features?: Array<{ feature: string; properties?: Record<string, unknown> }>,
): string | null {
  if (!features) {
    return null;
  }

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
 * Generate time-based sensor components for a feature that has multiple time periods.
 * @param featurePath - The feature path (e.g., "heating.gas.consumption.heating")
 * @param feature - The feature object with properties
 * @param baseComponentKey - Base component key (e.g., "gas_consumption")
 * @param baseComponent - The base component config to use as a template
 * @param installationId - Installation ID
 * @param gatewayId - Gateway ID
 * @param deviceId - Device ID
 * @param baseTopic - MQTT base topic
 * @param features - Optional array of all features (used to extract circuit names)
 * @returns Record of additional time-based components
 */
export function generateTimeBasedComponents(
  featurePath: string,
  feature: { properties?: Record<string, unknown> },
  baseComponentKey: string,
  baseComponent: { device_class?: string; unit_of_measurement?: string },
  installationId: number,
  gatewayId: string,
  deviceId: string,
  baseTopic: string,
  features?: Array<{ feature: string; properties?: Record<string, unknown> }>,
): Record<string, { platform: string; unique_id?: string; [key: string]: any }> {
  const components: Record<string, { platform: string; unique_id?: string; [key: string]: any }> = {};
  
  if (!feature.properties) {
    return components;
  }

  const timeBasedKeys = ["week", "month", "year"].filter(
    (key) => {
      const prop = feature.properties![key] as Record<string, unknown> | undefined;
      return prop && typeof prop === "object" && "value" in prop && Array.isArray(prop.value);
    },
  );

  const unit = baseComponent.unit_of_measurement;
  const deviceClass = baseComponent.device_class;
  let featureName = getFeatureName(featurePath);
  
  // If this is a circuit feature, try to get the circuit name and prepend it
  const circuitName = getCircuitNameForFeaturePath(featurePath, features);
  if (circuitName) {
    featureName = `${circuitName} ${featureName}`;
  }

  for (const timeKey of timeBasedKeys) {
    const timePropertyPath = `${timeKey}.value[0]`;
    const timeValueTemplate = safeValueTemplate(timePropertyPath, false);
    const timeComponentKey = `${baseComponentKey}_${timeKey}`;
    const timeFeatureName = `${featureName} (${timeKey.charAt(0).toUpperCase() + timeKey.slice(1)})`;

    const timeComponentConfig: { platform: string; unique_id?: string; [key: string]: any } = {
      platform: "sensor",
      unique_id: `viessmann_${installationId}_${gatewayId}_${deviceId}_${timeComponentKey}`,
      name: timeFeatureName,
      state_topic: `${baseTopic}/installations/${installationId}/gateways/${gatewayId}/devices/${deviceId}/features/${featurePath}`,
      value_template: timeValueTemplate,
    };

    if (deviceClass && unit) {
      timeComponentConfig.device_class = deviceClass;
      timeComponentConfig.unit_of_measurement = unit;
    } else if (unit) {
      timeComponentConfig.unit_of_measurement = unit;
    }

    components[timeComponentKey] = timeComponentConfig;
  }

  return components;
}
