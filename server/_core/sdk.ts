import { AXIOS_TIMEOUT_MS, COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { randomUUID } from "node:crypto";
import { isSessionRevoked, revokeSession } from "./sessions";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  authLevel?: "aal1" | "aal2";
};

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    // SA-42: never echo OAuth provider URLs to prod logs — Railway / Render
    // log streams are often shared with support/ops who shouldn't see the
    // upstream identity-provider endpoint. Dev still logs.
    if (!ENV.isProduction) {
      console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl || "(not configured)");
    }
    if (!ENV.oAuthServerUrl && ENV.isProduction) {
      console.error("[OAuth] OAUTH_SERVER_URL is not configured.");
    }
  }

  async getTokenByCode(
    code: string,
    redirectUri: string,
  ): Promise<ExchangeTokenResponse> {
    // SA-02: redirectUri is computed server-side from the request's own
    // host. We no longer accept it from the OAuth `state` param — that was
    // attacker-controllable and let `state` double as an open-redirect.
    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri,
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(
      EXCHANGE_TOKEN_PATH,
      payload
    );

    return data;
  }

  async getUserInfoByToken(
    token: ExchangeTokenResponse
  ): Promise<GetUserInfoResponse> {
    const { data } = await this.client.post<GetUserInfoResponse>(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken,
      }
    );

    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(
      platforms.filter((p): p is string => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (
      set.has("REGISTERED_PLATFORM_MICROSOFT") ||
      set.has("REGISTERED_PLATFORM_AZURE")
    )
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  /**
   * Exchange OAuth authorization code for access token.
   * @param code         Authorization code from the portal redirect.
   * @param redirectUri  The exact same redirectUri sent to the portal in
   *                     /api/oauth/start. Must come from the request, NOT
   *                     from the OAuth `state` param (SA-02).
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, redirectUri);
  }

  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);
    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; authLevel?: "aal1" | "aal2" } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "",
        authLevel: options.authLevel ?? "aal1",
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = Math.min(options.expiresInMs ?? SESSION_TTL_MS, payload.authLevel === "aal2" ? 60 * 60_000 : SESSION_TTL_MS);
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      authLevel: payload.authLevel ?? "aal1",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("irb-platform")
      .setAudience(ENV.appId || "irb-platform")
      .setJti(randomUUID())
      .setIssuedAt(Math.floor(issuedAt / 1000))
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string; jti: string; exp: number; authLevel: "aal1" | "aal2" } | null> {
    if (!cookieValue) {
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
        issuer: "irb-platform",
        audience: ENV.appId || "irb-platform",
        requiredClaims: ["exp", "iat", "jti"],
        maxTokenAge: Math.floor(SESSION_TTL_MS / 1000),
      });
      const { openId, appId, name, iss, aud, jti, exp } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(appId) ||
        typeof name !== "string" || appId !== ENV.appId || !isNonEmptyString(jti) || typeof exp !== "number"
      ) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      // Reject tokens that DO carry iss/aud but with the wrong values —
      // prevents cross-tenant token reuse if you run multiple deployments
      // against the same shared secret (you shouldn't, but belt+braces).
      const expectedAud = ENV.appId || "irb-platform";
      if (iss !== undefined && iss !== "irb-platform") {
        console.warn("[Auth] Session iss mismatch", iss);
        return null;
      }
      if (aud !== undefined && aud !== expectedAud) {
        console.warn("[Auth] Session aud mismatch", aud);
        return null;
      }

      if (await isSessionRevoked(jti)) return null;
      return { openId, appId, name, jti, exp, authLevel: payload.authLevel === "aal2" ? "aal2" : "aal1" };
    } catch (error) {
      // Invalid or revoked credentials fail closed without noisy token-bearing logs.
      return null;
    }
  }

  async getUserInfoWithJwt(
    jwtToken: string
  ): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  async revokeRequestSession(req: Request): Promise<void> {
    const token = this.parseCookies(req.headers.cookie).get(COOKIE_NAME);
    const session = await this.verifySession(token);
    if (session) await revokeSession(session.jti, session.exp * 1000);
  }

  async authenticateRequest(req: Request): Promise<User & { authLevel: "aal1" | "aal2" }> {
    // Regular authentication flow
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = session.openId;
    const user = await db.getUserByOpenId(sessionUserId);
    if (!user) throw ForbiddenError("User not found");
    // Login updates lastSignedIn. Ordinary reads must not generate database writes.

    return { ...user, authLevel: session.authLevel };
  }
}

export const sdk = new SDKServer();
