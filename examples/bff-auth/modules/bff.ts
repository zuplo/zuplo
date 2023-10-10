import { HttpProblems, ZuploContext, ZuploRequest, environment } from "@zuplo/runtime";
import { parse } from "cookie";

// Identity Provider Config
const ISSUER_URL = `https://${environment.AUTH0_URL}`;
const TOKEN_URL = `${ISSUER_URL}/oauth/token`;
const AUTHORIZATION_URL = `${ISSUER_URL}/authorize`;
const USERINFO_URL = `${ISSUER_URL}/userinfo`;
const SCOPE = "openid profile email"


// App Config
const APP_URL = "/app";
const COOKIE_NAME = "app-session";

// Cache expire offset
const EXPIRE_OFFSET = 180;

/**
 * OAuth token response
 */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
}

/**
 * OAuth token error
 */
interface TokenResponseError {
  error:
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "invalid_scope"
  | "unauthorized_client"
  | "unsupported_grant_type";
  error_description: string;
}

/**
 * OAuth user info response
 */
interface UserInfoResponse {
  [key: string]: string | boolean | number | undefined;
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

/**
 * The session object that is saved to session storage
 */
interface SessionState extends TokenResponse {
  expires_on: number;
  info: UserInfoResponse;
}

/**
 * Custom error
 */
class BffError extends Error { }

/**
 * Get the access token from session storage
 *
 * See: https://www.ietf.org/archive/id/draft-bertocci-oauth2-tmi-bff-01.html#name-the-bff-token-endpoint
 */
export async function bffToken(request: ZuploRequest, context: ZuploContext) {
  let sessionState: SessionState;
  try {
    sessionState = await getSessionState(request);
  } catch (err) {
    if (err instanceof BffError) {
      return HttpProblems.unauthorized(request, context, {
        detail: err.message,
      });
    }
    throw err;
  }

  const body = {
    access_token: sessionState.access_token,
    expires_in: sessionState.expires_in,
    scope: sessionState.scope,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/**
 * Get the session info from session storage
 *
 * See: https://www.ietf.org/archive/id/draft-bertocci-oauth2-tmi-bff-01.html#name-the-bff-sessioninfo-endpoin
 */
export async function bffSessionInfo(
  request: ZuploRequest,
  context: ZuploContext
) {
  let sessionState: SessionState;
  try {
    sessionState = await getSessionState(request);
  } catch (err) {
    if (err instanceof BffError) {
      return HttpProblems.unauthorized(request, context, {
        detail: err.message,
      });
    }
    throw err;
  }

  return new Response(JSON.stringify(sessionState.info, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/**
 * Login the user by redirecting to the identity provider
 */
export async function login(request: ZuploRequest, context: ZuploContext) {
  const authUrl = new URL(AUTHORIZATION_URL);
  authUrl.searchParams.set("client_id", environment.CLIENT_ID!);
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "redirect_uri",
    new URL("/auth/callback", request.url).toString()
  );
  //state
  //prompt=none
  return Response.redirect(authUrl.toString(), 307);
}

/**
 * Logout the user by deleting the cookie and clearing the session storage
 */
export async function logout(request: ZuploRequest, context: ZuploContext) {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return Response.redirect(APP_URL, 307);
  }
  try {
    await storageApi(`/delete/${sessionId}`);
  } catch (err) {
    // No need to throw here, just log the error
    context.log.error("Error deleting session", err);
  }

  // Set the cookie to be expired now
  return redirectWithCookieResponse(sessionId, 0);
}

/**
 * OAuth redirect URL
 */
export async function authCallback(
  request: ZuploRequest,
  context: ZuploContext
) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return HttpProblems.badRequest(request, context, {
      detail: "Callback must contain a code query parameter",
    });
  }

  const data = {
    grant_type: "authorization_code",
    client_id: environment.CLIENT_ID!,
    client_secret: environment.CLIENT_SECRET!,
    code,
    redirect_uri: new URL("/auth/callback", request.url).toString(),
  };

  const tokenResponse = await fetchToken(data);

  const userInfoResponse = await fetch(USERINFO_URL, {
    headers: {
      authorization: `Bearer ${tokenResponse.access_token}`,
    },
  });
  if (userInfoResponse.status !== 200) {
    let error: string | undefined;
    try {
      error = await userInfoResponse.text();
    } catch (err) {
      // Ignore
    }
    context.log.error("Error getting user info", error);
    return HttpProblems.internalServerError(request, context, {
      detail: "Error retrieving user info from identity provider",
    });
  }

  const userInfoResult: UserInfoResponse = await userInfoResponse.json();

  const sessionId = crypto.randomUUID();
  const sessionInfo: SessionState = {
    ...tokenResponse,
    expires_on: Date.now() + tokenResponse.expires_in * 1000,
    info: userInfoResult,
  };

  await storageApi(
    `/set/${sessionId}?EX=${tokenResponse.expires_in - EXPIRE_OFFSET}`,
    sessionInfo
  );
  return redirectWithCookieResponse(
    sessionId,
    sessionInfo.expires_in - EXPIRE_OFFSET
  );
}

/**
 * Redirect response that sets a cookie
 */
function redirectWithCookieResponse(sessionId: string, maxAge: number) {
  const cookie = `${COOKIE_NAME}=${sessionId}; path=/; secure; HttpOnly; SameSite=Strict; Max-age=${maxAge}`;

  const response = new Response("OK", {
    headers: {
      location: APP_URL,
      "set-cookie": cookie,
    },
    status: 307,
  });
  return response;
}

/**
 * Gets the session ID from the cookie
 */
function getSessionId(request: Request) {
  const cookie = parse(request.headers.get("cookie")!);

  const sessionId = cookie[COOKIE_NAME];
  if (!sessionId) {
    throw new BffError("No session cookie");
  }
  return sessionId;
}

/**
 * OAuth token fetch from identity provider
 */
async function fetchToken(
  data: Record<string, string>
): Promise<TokenResponse> {
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment.CLIENT_SECRET}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(data),
  });

  const result: TokenResponseError | TokenResponse = await tokenResponse.json();
  if ("error" in result) {
    throw new BffError(result.error_description);
  }

  return result;
}

/**
 * Gets the stored session state
 */
async function getSessionState(request: Request): Promise<SessionState> {
  const sessionId = getSessionId(request);

  const sessionState = await storageApi(`/get/${sessionId}`).then(
    (result) => JSON.parse(result) as SessionState
  );
  if (!sessionState) {
    throw new BffError("No seession");
  }

  // Check if session is expired
  if (sessionState.expires_on > Date.now()) {
    if (sessionState.refresh_token) {
      // If we have a refresh token, we can renew the session
      const data = {
        grant_type: "refresh_token",
        client_id: environment.CLIENT_ID!,
        refresh_token: sessionState.refresh_token,
      };
      const tokenResponse = await fetchToken(data);
      const newSessionState = {
        ...sessionState,
        expires_on: Date.now() + tokenResponse.expires_in * 1000,
        tokenResponse,
      };
      await storageApi(
        `/set/${sessionId}?EX=${tokenResponse.expires_in - EXPIRE_OFFSET}`,
        newSessionState
      );
    } else {
      await storageApi(`/delete/${sessionId}`);
      throw new BffError("Session expired");
    }
  }

  return sessionState;
}

/**
 * Upstash storage API
 */
async function storageApi(pathname: string, body?: any) {
  const response = await fetch(new URL(pathname, environment.UPSTASH_URL).toString(), {
    method: "POST",
    headers: {
      authorization: environment.UPSTASH_TOKEN!,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (response.status !== 200) {
    throw new Error(data.error);
  }

  return data.result;
}
