import asyncMqtt, { AsyncMqttClient } from "async-mqtt";
const { connectAsync } = asyncMqtt;

const STATUS_ONLINE = "online";
const STATUS_OFFLINE = "offline";

export class Publisher {

  private client: AsyncMqttClient | undefined;

  private presenceListenerAttached = false;

  constructor(
    private readonly url: string,
    private readonly retain?: boolean,
    private readonly clientId?: string,
    private readonly username?: string,
    private readonly password?: string,
    /** When set, MQTT Last Will + retained online/offline on `{baseTopic}/status` for Home Assistant availability. */
    private readonly mqttBaseTopic?: string,
  ) {}

  private publishPresenceOnline(): void {
    if (!this.client || !this.mqttBaseTopic) {
      return;
    }
    const topic = `${this.mqttBaseTopic}/status`;
    void this.client.publish(topic, STATUS_ONLINE, { qos: 1, retain: true });
  }

  private attachPresenceListener(): void {
    if (!this.client || !this.mqttBaseTopic || this.presenceListenerAttached) {
      return;
    }
    this.presenceListenerAttached = true;
    this.client.on("connect", () => {
      this.publishPresenceOnline();
    });
  }

  private async getClient() {
    if (this.client) {
      if (!this.client.connected) {
        this.client.reconnect();
      }
      return this.client;
    }
    const connectOptions: Parameters<typeof connectAsync>[1] = {
      clientId: this.clientId,
      username: this.username,
      password: this.password,
      keepalive: 10,
    };
    if (this.mqttBaseTopic) {
      connectOptions.will = {
        topic: `${this.mqttBaseTopic}/status`,
        payload: STATUS_OFFLINE,
        qos: 1,
        retain: true,
      };
    }
    this.client = await connectAsync(this.url, connectOptions);
    this.attachPresenceListener();
    this.publishPresenceOnline();
    return this.client;
  }

  async publish(topic: string, message: any, options?: { retain?: boolean }) {
    const retain = options?.retain !== undefined ? options.retain : this.retain;
    await (await this.getClient()).publish(topic, JSON.stringify(message), { retain });
  }

  /**
   * Delete a retained MQTT message by publishing an empty payload with retain: true.
   * This is the standard way to remove retained messages in MQTT.
   */
  async delete(topic: string) {
    await (await this.getClient()).publish(topic, "", { retain: true });
  }
}
