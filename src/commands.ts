import asyncMqtt, { AsyncMqttClient } from "async-mqtt";
import { ViessmannApi } from "./api.js";
import { Command, CommandParameter, Feature } from "./models.js";
import { Logger } from "./logger.js";

const { connectAsync } = asyncMqtt;

type CommandPayload = Record<string, unknown> | string | number | boolean | null;

export class CommandSubscriber {
  private client: AsyncMqttClient | undefined;

  constructor(
    private readonly url: string,
    private readonly baseTopic: string,
    private readonly api: ViessmannApi,
    private readonly logger: Logger,
    private readonly clientId?: string,
    private readonly username?: string,
    private readonly password?: string,
  ) {}

  async start(): Promise<void> {
    this.client = await connectAsync(this.url, {
      clientId: this.clientId,
      username: this.username,
      password: this.password,
      keepalive: 10,
    });

    const topic = `${this.baseTopic}/installations/+/gateways/+/devices/+/features/+/commands/+/set`;
    await this.client.subscribe(topic);
    this.logger.log(`Subscribed to command topics: ${topic}`);

    this.client.on("message", (messageTopic, payload) => {
      void this.handleMessage(messageTopic, payload.toString("utf-8"));
    });
  }

  private parseCommandTopic(topic: string): {
    installationId: number;
    gatewayId: string;
    deviceId: string;
    featurePath: string;
    commandName: string;
  } | null {
    const baseSegments = this.baseTopic.split("/").filter(Boolean);
    const segments = topic.split("/").filter(Boolean);
    if (segments.length < baseSegments.length + 10) {
      return null;
    }

    for (let i = 0; i < baseSegments.length; i += 1) {
      if (segments[i] !== baseSegments[i]) {
        return null;
      }
    }

    const rest = segments.slice(baseSegments.length);
    if (
      rest[0] !== "installations" ||
      rest[2] !== "gateways" ||
      rest[4] !== "devices" ||
      rest[6] !== "features" ||
      rest[8] !== "commands" ||
      rest[10] !== "set"
    ) {
      return null;
    }

    const installationId = Number.parseInt(rest[1], 10);
    if (Number.isNaN(installationId)) {
      return null;
    }

    return {
      installationId,
      gatewayId: rest[3],
      deviceId: rest[5],
      featurePath: rest[7],
      commandName: rest[9],
    };
  }

  private parsePayload(payloadText: string): CommandPayload {
    const trimmed = payloadText.trim();
    if (trimmed.length === 0) {
      return null;
    }
    try {
      return JSON.parse(trimmed) as CommandPayload;
    } catch {
      if (trimmed === "true") return true;
      if (trimmed === "false") return false;
      const num = Number(trimmed);
      if (!Number.isNaN(num)) {
        return num;
      }
      return trimmed;
    }
  }

  private coerceValue(
    parameter: CommandParameter,
    value: unknown,
  ): { value?: unknown; error?: string } {
    if (parameter.type === "number") {
      if (typeof value === "number" && Number.isFinite(value)) {
        return { value };
      }
      if (typeof value === "string" && value.length > 0) {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          return { value: num };
        }
      }
      return { error: "Expected number" };
    }

    if (parameter.type === "boolean") {
      if (typeof value === "boolean") {
        return { value };
      }
      if (typeof value === "string") {
        if (value === "true") return { value: true };
        if (value === "false") return { value: false };
      }
      return { error: "Expected boolean" };
    }

    if (parameter.type === "string") {
      if (typeof value === "string") {
        return { value };
      }
      return { error: "Expected string" };
    }

    if (parameter.type === "Schedule" || typeof value === "object") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return { value };
      }
      return { error: "Expected object" };
    }

    return { value };
  }

  private validateConstraints(
    parameter: CommandParameter,
    value: unknown,
  ): string | null {
    const constraints = parameter.constraints as Record<string, unknown> | undefined;
    if (!constraints) {
      return null;
    }

    const enumValues = constraints.enum as unknown[] | undefined;
    if (enumValues && !enumValues.includes(value)) {
      return `Value must be one of ${enumValues.join(", ")}`;
    }

    if (typeof value === "number") {
      const min = constraints.min as number | undefined;
      const max = constraints.max as number | undefined;
      const stepping = constraints.stepping as number | undefined;
      if (min !== undefined && value < min) {
        return `Value must be >= ${min}`;
      }
      if (max !== undefined && value > max) {
        return `Value must be <= ${max}`;
      }
      if (stepping !== undefined && stepping > 0) {
        const base = min ?? 0;
        const offset = value - base;
        const remainder = Math.abs(offset % stepping);
        if (remainder > 1e-6 && Math.abs(remainder - stepping) > 1e-6) {
          return `Value must align with step ${stepping}`;
        }
      }
    }

    return null;
  }

  private buildParams(
    command: Command,
    payload: CommandPayload,
  ): { params?: Record<string, unknown>; error?: string } {
    const entries = Object.entries(command.params ?? {});
    if (entries.length === 0) {
      return { params: {} };
    }

    if (entries.length === 1) {
      const [paramName, paramDef] = entries[0];
      let rawValue: unknown = payload;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        if (paramName in payload) {
          rawValue = payload[paramName];
        }
      }
      const coerced = this.coerceValue(paramDef, rawValue);
      if (coerced.error) {
        return { error: `${paramName}: ${coerced.error}` };
      }
      const constraintError = this.validateConstraints(paramDef, coerced.value);
      if (constraintError) {
        return { error: `${paramName}: ${constraintError}` };
      }
      return { params: { [paramName]: coerced.value } };
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { error: "Expected JSON object payload for multi-parameter command" };
    }

    const params: Record<string, unknown> = {};
    for (const [paramName, paramDef] of entries) {
      const hasValue = paramName in payload;
      if (!hasValue) {
        if (paramDef.required) {
          return { error: `Missing required parameter ${paramName}` };
        }
        continue;
      }

      const rawValue = payload[paramName];
      const coerced = this.coerceValue(paramDef, rawValue);
      if (coerced.error) {
        return { error: `${paramName}: ${coerced.error}` };
      }
      const constraintError = this.validateConstraints(paramDef, coerced.value);
      if (constraintError) {
        return { error: `${paramName}: ${constraintError}` };
      }
      params[paramName] = coerced.value;
    }

    return { params };
  }

  private async handleMessage(topic: string, payloadText: string): Promise<void> {
    const parsed = this.parseCommandTopic(topic);
    if (!parsed) {
      return;
    }

    const payload = this.parsePayload(payloadText);
    try {
      const featureResponse = await this.api.getFeatures({
        installationId: parsed.installationId,
        gatewayId: parsed.gatewayId,
        deviceId: parsed.deviceId,
      });
      const feature = featureResponse.data.find(
        (item: Feature) => item.feature === parsed.featurePath,
      );
      if (!feature || !feature.commands) {
        this.logger.warn(
          `Command feature not found: ${parsed.featurePath} (${parsed.commandName})`,
        );
        return;
      }

      const command = feature.commands[parsed.commandName];
      if (!command) {
        this.logger.warn(
          `Command not available: ${parsed.featurePath} (${parsed.commandName})`,
        );
        return;
      }
      if (!command.isExecutable) {
        this.logger.warn(
          `Command not executable: ${parsed.featurePath} (${parsed.commandName})`,
        );
        return;
      }

      const { params, error } = this.buildParams(command, payload);
      if (error) {
        this.logger.warn(
          `Invalid command payload for ${parsed.commandName}: ${error}`,
        );
        return;
      }

      await this.api.executeCommand({
        installationId: parsed.installationId,
        gatewayId: parsed.gatewayId,
        deviceId: parsed.deviceId,
        featurePath: parsed.featurePath,
        commandName: parsed.commandName,
        params: params ?? {},
      });
      this.logger.log(
        `Executed command ${parsed.commandName} for ${parsed.featurePath}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to execute command ${parsed.commandName} for ${parsed.featurePath}`,
        error,
      );
    }
  }
}
