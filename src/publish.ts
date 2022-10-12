import { AsyncMqttClient, connectAsync } from "async-mqtt";

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
        await this.client.reconnect();
      }
      return this.client;
    }
    this.client = await connectAsync(this.url, {
      clientId: this.clientId,
      username: this.username,
      password: this.password,
      keepalive: 10
    });
    return this.client;
  }

  async publish(topic: string, message: any) {
    await (await this.getClient()).publish(topic, JSON.stringify(message), { retain: this.retain });
  }
}