import asyncMqtt, { AsyncMqttClient } from "async-mqtt";
const { connectAsync } = asyncMqtt;

export class Publisher {

  private client: AsyncMqttClient | undefined;

  constructor(
    private readonly url: string,
    private readonly retain?: boolean,
    private readonly clientId?: string,
    private readonly username?: string,
    private readonly password?: string,
  ) {}

  private async getClient() {
    if (this.client) {
      if (!this.client.connected) {
        this.client.reconnect();
      }
      return this.client;
    }
    this.client = await connectAsync(this.url, {
      clientId: this.clientId,
      username: this.username,
      password: this.password,
      keepalive: 10,
    });
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