import { ViessmannApi } from "./api";
import { anonymizeConfig, getConfig } from "./config";
import { consoleLogger } from "./logger";
import { chunk, isEqual } from "lodash";
import { Property } from "./models";
import { sleep } from "./utils";
import { Publisher } from "./publish";

const config = getConfig();
const logger = consoleLogger(config.verbose);

async function run(): Promise<void> {
  logger.log(JSON.stringify(anonymizeConfig(config)));
  const api = new ViessmannApi({
    credentials: { username: config.username, password: config.password },
    auth: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      scopes: config.scopes,
    },
    logger,
  });
  logger.log("Getting installations...");
  const installations = await api.getInstallations();

  const previousMap: Map<
  string,
  { timestamp: string; properties: Record<string, Property> }
  > = new Map();

  const publisher = new Publisher(config.mqttUrl, config.mqttRetain, config.mqttClientId.length > 0 ? config.mqttClientId : undefined, config.mqttUsername, config.mqttPassword);
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
        (feature) =>
          feature.isEnabled && Object.values(feature.properties).length > 0,
      )
      .map((feature) => {
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
      .filter(({ topic, ...newData }) => {
        const previousData = previousMap.get(topic);
        return previousData == null || !isEqual(previousData, newData);
      });

    const chunks = chunk(enabledFeatures, config.publishChunkSize);
    logger.log(
      `Publishing ${enabledFeatures.length} changed data-points to MQTT`,
    );
    for (const c of chunks) {
      await Promise.all(
        c.map(async (f) => {
          const { topic, ...data } = f;
          await publisher.publish(topic, data);
        }),
      );
      c.forEach(({ topic, ...data }) => previousMap.set(topic, data));
    }
    logger.log("Published.");
  }

  for (;;) {
    const start = new Date().getTime();
    for (const installation of installations.data) {
      const installationId = installation.id;
      for (const gateway of installation.gateways) {
        const gatewaySerial = gateway.serial;
        const deviceId = "0";

        try {
          await fetchAndPublish(installationId, gatewaySerial, deviceId);
        } catch (e) {
          logger.warn("Failed fetching or publishing features", e);
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
