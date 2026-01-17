import { HeatingDevice } from "./heating.js";
import { PropertyRetrieval, Sensor } from "./discovery.js";



/**
 * Heat pump device.
 */
export class HeatPump extends HeatingDevice {
  /**
   * Get available compressors.
   */
  @PropertyRetrieval({
    featurePath: "heating.compressors",
    propertyPath: "enabled",
    returnType: "array",
  })
  declare getAvailableCompressors: string[];

  /**
   * Get buffer main temperature.
   */
  @Sensor({
    featurePath: "heating.bufferCylinder.sensors.temperature.main",
    platform: "sensor",
    deviceClass: "temperature",
    unitOfMeasurement: "°C",
    componentKey: "buffer_temp",
  })
  @PropertyRetrieval({
    featurePath: "heating.bufferCylinder.sensors.temperature.main",
    propertyPath: "value",
    returnType: "number",
  })
  declare getBufferMainTemperature: number | null;

  /**
   * Get buffer top temperature.
   */
  @PropertyRetrieval({
    featurePath: "heating.bufferCylinder.sensors.temperature.top",
    propertyPath: "value",
    returnType: "number",
  })
  declare getBufferTopTemperature: number | null;

  /**
   * Get power consumption for heating (today).
   */
  @Sensor({
    featurePath: "heating.power.consumption.summary.heating",
    platform: "sensor",
    deviceClass: "energy",
    valueTemplate: "{{ value_json.properties.currentDay.value }}",
    componentKey: "power_consumption",
  })
  @PropertyRetrieval({
    featurePath: "heating.power.consumption.summary.heating",
    propertyPath: "currentDay.value",
    returnType: "number",
  })
  declare getPowerConsumptionHeatingToday: number | null;

  /**
   * Get power consumption unit for heating.
   */
  @PropertyRetrieval({
    featurePath: "heating.power.consumption.summary.heating",
    propertyPath: "currentDay.unit",
    returnType: "string",
  })
  declare getPowerConsumptionHeatingUnit: string | null;

  /**
   * Get power consumption for cooling (today).
   */
  @PropertyRetrieval({
    featurePath: "heating.power.consumption.cooling",
    propertyPath: "day.value[0]",
    returnType: "number",
  })
  declare getPowerConsumptionCoolingToday: number | null;

  /**
   * Get seasonal performance factor for heating.
   */
  @Sensor({
    featurePath: "heating.spf.heating",
    platform: "sensor",
    componentKey: "spf_heating",
  })
  @PropertyRetrieval({
    featurePath: "heating.spf.heating",
    propertyPath: "value",
    returnType: "number",
  })
  declare getSeasonalPerformanceFactorHeating: number | null;

  /**
   * Get seasonal performance factor for domestic hot water.
   */
  @PropertyRetrieval({
    featurePath: "heating.spf.dhw",
    propertyPath: "value",
    returnType: "number",
  })
  declare getSeasonalPerformanceFactorDHW: number | null;

  /**
   * Get seasonal performance factor total.
   */
  @PropertyRetrieval({
    featurePath: "heating.spf.total",
    propertyPath: "value",
    returnType: "number",
  })
  declare getSeasonalPerformanceFactorTotal: number | null;

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

}
