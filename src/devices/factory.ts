import { Device } from "./base.js";
import { HeatingDevice } from "./heating.js";
import { GazBoiler } from "./gaz-boiler.js";
import { HeatPump } from "./heat-pump.js";
import { FuelCell } from "./fuel-cell.js";
import { Hybrid } from "./hybrid.js";
import { DeviceAccessor, DeviceModel } from "./base.js";
import { Feature } from "../models.js";

/**
 * Device factory that creates device instances based on model and roles.
 */
export class DeviceFactory {
  /**
   * Auto-detect device type and create appropriate device instance.
   * Features must be fetched externally and passed here.
   */
  static createDevice(
    accessor: DeviceAccessor,
    roles: string[],
    deviceModel: DeviceModel,
    features: Feature[],
  ): Device {
    const modelId = deviceModel.modelId;

    // Check roles first, then model name patterns
    const deviceTypes: Array<{
      creator: (
        accessorParam: DeviceAccessor,
        rolesParam: string[],
        deviceModelParam: DeviceModel,
        featuresParam: Feature[],
      ) => Device;
      modelPattern: RegExp;
      rolePatterns: string[][];
    }> = [
      {
        creator: (accessorParam, rolesParam, deviceModelParam, featuresParam) =>
          new FuelCell(accessorParam, rolesParam, deviceModelParam, featuresParam),
        modelPattern: /Vitovalor|Vitocharge|Vitoblo/i,
        rolePatterns: [],
      },
      {
        creator: (accessorParam, rolesParam, deviceModelParam, featuresParam) =>
          new GazBoiler(accessorParam, rolesParam, deviceModelParam, featuresParam),
        modelPattern: /Vitodens|VScotH|Vitocrossal|VDensH|Vitopend|VPendH|OT_Heating_System/i,
        rolePatterns: [["type:boiler"]],
      },
      {
        creator: (accessorParam, rolesParam, deviceModelParam, featuresParam) =>
          new HeatPump(accessorParam, rolesParam, deviceModelParam, featuresParam),
        modelPattern: /Vitocal|VBC70|V200WO1A|CU401B/i,
        rolePatterns: [["type:heatpump"]],
      },
      {
        creator: (accessorParam, rolesParam, deviceModelParam, featuresParam) =>
          new Hybrid(accessorParam, rolesParam, deviceModelParam, featuresParam),
        modelPattern: /.*/i, // Hybrid detection might need more specific patterns
        rolePatterns: [],
      },
    ];

    // Check for hybrid devices (has both boiler and heatpump roles)
    const hasBoilerRole = roles.some((r) => r.includes("type:boiler"));
    const hasHeatPumpRole = roles.some((r) => r.includes("type:heatpump"));
    if (hasBoilerRole && hasHeatPumpRole) {
      return new Hybrid(accessor, roles, deviceModel, features);
    }

    // Try to match device types
    for (const deviceType of deviceTypes) {
      // Check role patterns
      const matchesRole = deviceType.rolePatterns.some((rolePattern) =>
        rolePattern.every((role) => roles.includes(role)),
      );

      // Check model pattern
      const matchesModel = deviceType.modelPattern.test(modelId);

      if (matchesRole || matchesModel) {
        return deviceType.creator(accessor, roles, deviceModel, features);
      }
    }

    // Default to generic heating device
    return new HeatingDevice(accessor, roles, deviceModel, features) as Device;
  }

}
