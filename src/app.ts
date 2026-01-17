import { ViessmannApi } from "./api.js";
import { anonymizeConfig, getConfig } from "./config.js";
import { consoleLogger } from "./logger.js";
import { Feature, Property } from "./models.js";
import { isEqual, sleep } from "./utils.js";
import { Publisher } from "./publish.js";
import { DeviceFactory } from "./devices/factory.js";
import { Device as DeviceBase } from "./devices/base.js";
import {
  HomeAssistantDiscovery,
} from "./devices/homeassistant.js";

const config = getConfig();
const logger = consoleLogger(config.verbose);


async function run(): Promise<void> {
  logger.log(JSON.stringify(anonymizeConfig(config)));
  const auth = {
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scopes: config.scopes,
    ...(config.clientSecret != null
      ? { clientSecret: config.clientSecret }
      : {}),
    ...(config.accessTokenUri != null
      ? { accessTokenUri: config.accessTokenUri }
      : {}),
    ...(config.authorizationUri != null
      ? { authorizationUri: config.authorizationUri }
      : {}),
  };
  const api = new ViessmannApi({
    credentials: { username: config.username, password: config.password },
    ...(config.baseUrl != null ? { baseUrl: config.baseUrl } : {}),
    auth,
    logger,
  });
  logger.log("Getting installations...");
  const installations = await api.getInstallations();

  const previousMap: Map<
  string,
  { timestamp: string; properties: Record<string, Property> }
  > = new Map();

  const publisher = new Publisher(config.mqttUrl, config.mqttRetain, config.mqttClientId.length > 0 ? config.mqttClientId : undefined, config.mqttUsername, config.mqttPassword);

  // Publish Home Assistant device discovery configs if enabled
  const discoveryDevicesPublished = new Set<string>();
  if (config.mqttDiscovery) {
    logger.log("Publishing Home Assistant device discovery configs...");
    for (const installation of installations.data) {
      for (const gateway of installation.gateways) {
        for (const device of gateway.devices) {
          try {
            const discovery = new HomeAssistantDiscovery(
              config.mqttTopic,
              installation.id,
              gateway.serial,
              device.id,
            );

            // CENTRAL FEATURE FETCHING: Fetch features once for this device
            // This is the central place where features are fetched from the API.
            const featuresResponse = await api.getFeatures({
              installationId: installation.id,
              gatewayId: gateway.serial,
              deviceId: device.id,
            });
            const features = featuresResponse.data;

            // Create device instance with injected features
            const deviceInstance = DeviceFactory.createDevice(
              {
                installationId: installation.id,
                gatewayId: gateway.serial,
                deviceId: device.id,
              },
              device.roles,
              device,
              features,
            );

            const deviceDiscoveryConfig =
              await discovery.generateDeviceDiscoveryConfig(deviceInstance, features);

            // Only publish if device has components
            if (
              Object.keys(deviceDiscoveryConfig.components).length > 0
            ) {
              const deviceId = `viessmann_${installation.id}_${gateway.serial}_${device.id}`;
              const topic = `homeassistant/device/${deviceId}/config`;

              // Only publish each device discovery config once
              if (!discoveryDevicesPublished.has(deviceId)) {
                await publisher.publish(topic, deviceDiscoveryConfig);
                discoveryDevicesPublished.add(deviceId);
                logger.log(
                  `Published device discovery config: ${topic} with ${Object.keys(deviceDiscoveryConfig.components).length} components`,
                );
              }
            }
          } catch (e) {
            logger.warn(
              `Failed to generate discovery configs for device ${device.id}`,
              e,
            );
          }
        }
      }
    }
    logger.log(
      `Published ${discoveryDevicesPublished.size} Home Assistant device discovery configs`,
    );
  }

  async function fetchAndPublish(
    installationId: number,
    gatewaySerial: string,
    deviceId: string,
  ): Promise<void> {
    logger.log(
      `Fetching data for ${JSON.stringify({
        installationId,
        gatewaySerial,
        deviceId,
      })}`,
    );
    const features = await api.getFeatures({
      installationId,
      gatewayId: gatewaySerial,
      deviceId,
    });
    logger.log(`Fetched ${features.data.length} features`);
    const enabledFeatures = features.data
      .filter(
        (feature: Feature) => {
          if (!feature.isEnabled || Object.values(feature.properties).length === 0) {
            return false;
          }
          // Static method check - safe to call
          const isList = (DeviceBase.isListFeature as (path: string) => boolean)(feature.feature);
          return !isList;
        },
      )
      .map((feature: Feature) => {
        return {
          topic: `${
            config.mqttTopic
          }/installations/${installationId.toString()}/gateways/${
            feature.gatewayId
          }/devices/${feature.deviceId}/features/${feature.feature}`,
          timestamp: feature.timestamp,
          properties: feature.properties,
        };
      })
      .filter(({ topic, ...newData }: { topic: string; timestamp: string; properties: Record<string, Property> }) => {
        const previousData = previousMap.get(topic);
        return previousData == null || !isEqual(previousData, newData);
      });

    logger.log(
      `Publishing ${enabledFeatures.length} changed data-points to MQTT`,
    );
    for (const f of enabledFeatures) {
      const { topic, ...data } = f;
      await publisher.publish(topic, data);
    }
    logger.log("Published.");
    enabledFeatures.forEach(({ topic, ...data }: { topic: string; timestamp: string; properties: Record<string, Property> }) => previousMap.set(topic, data));
  }

  for (;;) {
    const start = new Date().getTime();
    for (const installation of installations.data) {
      const installationId = installation.id;
      for (const gateway of installation.gateways) {
        const gatewaySerial = gateway.serial;
        for (const device of gateway.devices) {
          try {
            await fetchAndPublish(installationId, gatewaySerial, device.id);
          } catch (e) {
            logger.warn(`Failed fetching or publishing features for device ${device.id}`, e);
          }
        }
      }
    }
    const end = new Date().getTime() - start;
    const sleepInterval = config.pollInterval * 1000 - end;
    logger.log(`Sleeping for ${sleepInterval}ms...`);
    await sleep(sleepInterval);
  }
}

run()
  .then(() => {
    logger.log("Done");
  })
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });
