import { URLSearchParams } from "url";
import fetch, { Response } from "node-fetch";
import ClientOAuth2, { Token } from "client-oauth2";
import pkceChallenge from "pkce-challenge";
import { FeatureResponse, Installation, InstallationsResponse } from "./models.js";
import { Logger } from "./logger.js";

export interface Auth {
  clientId: string;
  clientSecret?: string;
  accessTokenUri?: string;
  authorizationUri?: string;
  redirectUri: string;
  scopes?: string[];
}

export interface Credentials {
  username: string;
  password: string;
}

export interface Options {
  baseUrl?: string;
  auth: Auth;
  credentials: Credentials;
  logger?: Logger;
}

export class ViessmannApi {
  private readonly credentials: Credentials;

  private readonly oAuthClient: ClientOAuth2;

  private readonly baseUrl: string;

  private token: Promise<Token> | null = null;

  private readonly logger: Logger;

  constructor(options: Options) {
    const auth = {
      accessTokenUri: options.auth.accessTokenUri ?? "https://iam.viessmann-climatesolutions.com/idp/v3/token",
      authorizationUri: options.auth.authorizationUri ?? "https://iam.viessmann-climatesolutions.com/idp/v3/authorize",
      scopes: options.auth.scopes ?? ["IoT User", "offline_access"],
      clientId: options.auth.clientId,
      clientSecret: options.auth.clientSecret,
      redirectUri: options.auth.redirectUri ?? "https://localhost/redirect",
    };
    this.oAuthClient = new ClientOAuth2({
      clientId: auth.clientId,
      clientSecret: auth.clientSecret,
      accessTokenUri: auth.accessTokenUri,
      authorizationUri: auth.authorizationUri,
      redirectUri: auth.redirectUri,
      scopes: auth.scopes,
    });
    this.credentials = options.credentials;
    this.baseUrl = options.baseUrl ?? "https://api.viessmann-climatesolutions.com";
    this.logger = options.logger ?? console;
  }

  private async login(): Promise<Token> {
    const challenge = await pkceChallenge();
    const url = this.oAuthClient.code.getUri({
      query: {
        code_challenge: challenge.code_challenge,
        code_challenge_method: "S256",
      },
    });
    const body = new URLSearchParams();
    body.append("isiwebuserid", this.credentials.username);
    body.append("isiwebpasswd", this.credentials.password);

    this.logger.log("Logging in...");
    const response = await fetch(url, {
      headers: { "content-type": " application/x-www-form-urlencoded" },
      body: body.toString(),
      method: "post",
      redirect: "manual",
    });
    const locationUri = response.headers.get("location");
    if (response.status !== 302 || locationUri == null) {
      throw new Error(`Login failed: ${await response.text()}`);
    }
    this.logger.log("Getting token...");
    return this.oAuthClient.code.getToken(locationUri, {
      query: { code_verifier: challenge.code_verifier },
    });
  }

  private async ensureToken(): Promise<Token> {
    if (this.token != null) {
      try {
        let token = await this.token;
        if (token.expired()) {
          if (token.refreshToken != null && token.refreshToken.length > 0) {
            this.token = token.refresh();
          } else {
            // In case we don't have offline_access scope
            this.token = this.login();
          }
          token = await this.token;
        }
        return token;
      } catch {
        // Previous login failed.
      }
    }
    this.token = this.login();
    return this.token;
  }

  private async fetch(
    endpoint: string,
    options: { params?: Record<string, string | boolean | number> } = {},
  ): Promise<Response> {
    const urlBuilder = new URL(endpoint, this.baseUrl);
    if (options.params != null) {
      for (const [name, value] of Object.entries(options.params)) {
        urlBuilder.searchParams.append(name, value.toString());
      }
    }
    const token = await this.ensureToken();
    const url = urlBuilder.href;
    this.logger.log(`Fetching ${url}`);
    return fetch(url, token.sign({ method: "get", url }));
  }

  private async request(
    method: "post",
    endpoint: string,
    body: unknown,
  ): Promise<Response> {
    const urlBuilder = new URL(endpoint, this.baseUrl);
    const token = await this.ensureToken();
    const url = urlBuilder.href;
    this.logger.log(`Requesting ${method.toUpperCase()} ${url}`);
    const signed = token.sign({ method, url }) as { headers?: Record<string, string> };
    return fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        ...(signed.headers ?? {}),
      },
      body: JSON.stringify(body ?? {}),
    });
  }

  public async getInstallations(): Promise<InstallationsResponse> {
    const allInstallations: Installation[] = [];
    let cursor: string | undefined;

    do {
      const params: Record<string, string | boolean | number> = {
        includeGateways: true,
        limit: 1000,
      };
      if (cursor != null && cursor.length > 0) {
        params.cursor = cursor;
      }

      const response = await this.fetch("iot/v2/equipment/installations", {
        params,
      });
      const result = (await response.json()) as InstallationsResponse;
      allInstallations.push(...result.data);
      cursor = result.cursor?.next;
    } while (cursor != null && cursor.length > 0);

    return {
      data: allInstallations,
    };
  }

  public async getFeatures({
    installationId,
    gatewayId,
    deviceId,
  }: {
    installationId: number;
    gatewayId: string;
    deviceId: string;
  }): Promise<FeatureResponse> {
    const response = await this.fetch(
      `iot/v2/features/installations/${encodeURI(
        installationId.toString(),
      )}/gateways/${encodeURI(gatewayId)}/devices/${encodeURI(
        deviceId,
      )}/features`,
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch features: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
    const text = await response.text();
    if (!text || text.trim().length === 0) {
      this.logger.warn("Empty response from features endpoint, returning empty data");
      return { data: [] };
    }
    try {
      return JSON.parse(text) as FeatureResponse;
    } catch (error) {
      this.logger.error(`Failed to parse JSON response: ${text.substring(0, 200)}`);
      throw new Error(`Invalid JSON response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async executeCommand({
    installationId,
    gatewayId,
    deviceId,
    featurePath,
    commandName,
    params,
  }: {
    installationId: number;
    gatewayId: string;
    deviceId: string;
    featurePath: string;
    commandName: string;
    params: Record<string, unknown>;
  }): Promise<void> {
    const endpoint = `iot/v2/features/installations/${encodeURI(
      installationId.toString(),
    )}/gateways/${encodeURI(gatewayId)}/devices/${encodeURI(
      deviceId,
    )}/features/${encodeURI(featurePath)}/commands/${encodeURI(commandName)}`;
    const response = await this.request("post", endpoint, params);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to execute command ${commandName}: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
  }
}
