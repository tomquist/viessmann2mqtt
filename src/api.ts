import { URLSearchParams } from "url";
import fetch, { Response } from "node-fetch";
import ClientOAuth2, { Token } from "client-oauth2";
import pkceChallenge from "pkce-challenge";
import { FeatureResponse, InstallationsResponse } from "./models";
import { Logger } from "./logger";

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
      accessTokenUri: "https://iam.viessmann.com/idp/v2/token",
      authorizationUri: "https://iam.viessmann.com/idp/v2/authorize",
      scopes: ["IoT User", "offline_access"],
      ...options.auth,
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
    this.baseUrl = options.baseUrl ?? "https://api.viessmann.com/iot/v1/";
    this.logger = options.logger ?? console;
  }

  private async login(): Promise<Token> {
    const challenge = pkceChallenge();
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
      } catch (e) {
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

  public async getInstallations(): Promise<InstallationsResponse> {
    const response = await this.fetch("equipment/installations", {
      params: { includeGateways: true },
    });
    return (await response.json()) as InstallationsResponse;
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
      `equipment/installations/${encodeURI(
        installationId.toString(),
      )}/gateways/${encodeURI(gatewayId)}/devices/${encodeURI(
        deviceId,
      )}/features/`,
    );
    return (await response.json()) as FeatureResponse;
  }
}
