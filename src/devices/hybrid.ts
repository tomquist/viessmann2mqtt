import { GazBoiler } from "./gaz-boiler.js";
import { PropertyRetrieval } from "./discovery.js";

/**
 * Hybrid device (combines gas boiler and heat pump).
 * Inherits functionality from both GazBoiler and HeatPump.
 */
export class Hybrid extends GazBoiler {
  // Inherits all methods from GazBoiler
  // HeatPump methods are available through multiple inheritance simulation

  /**
   * Get available compressors (from HeatPump).
   */
  @PropertyRetrieval({
    featurePath: "heating.compressors",
    propertyPath: "enabled",
    returnType: "array",
  })
  declare getAvailableCompressors: string[];

  /**
   * Get buffer main temperature (from HeatPump).
   */
  @PropertyRetrieval({
    featurePath: "heating.bufferCylinder.sensors.temperature.main",
    propertyPath: "value",
    returnType: "number",
  })
  declare getBufferMainTemperature: number | null;

  /**
   * Get seasonal performance factor for heating (from HeatPump).
   */
  @PropertyRetrieval({
    featurePath: "heating.spf.heating",
    propertyPath: "value",
    returnType: "number",
  })
  declare getSeasonalPerformanceFactorHeating: number | null;
}
