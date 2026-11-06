import * as SecureStore from 'expo-secure-store';

import * as session from '../auth/sessionStore';

const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
const API_URL_KEY = 'civicpulse.api_url';

// The laptop running the server gets a new Wi-Fi address now and then, so the
// installed app lets the user change it instead of needing a new build.
let apiUrl = DEFAULT_API_URL;
const apiUrlLoaded = SecureStore.getItemAsync(API_URL_KEY)
  .then((saved) => {
    if (saved) apiUrl = saved;
  })
  .catch(() => {});

/** The address in use right now, for messages. May still be the default for a moment at start-up. */
export function currentApiUrl() {
  return apiUrl;
}

export async function getApiUrl() {
  await apiUrlLoaded;
  return apiUrl;
}

/** Saves the server address after checking that a CivicPulse server answers there. */
export async function setApiUrl(input: string) {
  const url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+$/.test(url)) throw new ApiError(0, 'bad_server_address');
  try {
    const response = await fetch(`${url}/health`);
    if (!response.ok) throw new Error();
  } catch {
    throw new NetworkError('network_error');
  }
  await SecureStore.setItemAsync(API_URL_KEY, url);
  apiUrl = url;
}

/** The server answered with an error. `code` is the server's `detail` string. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** The server could not be reached. The session is still valid; try again later. */
export class NetworkError extends Error {}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  auth?: boolean;
};

let onSessionExpired: () => void = () => {};
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

async function send(path: string, { method = 'GET', body }: Options, token: string | null) {
  const headers: Record<string, string> = { 'X-Device-Id': await session.getDeviceId() };
  const isForm = body instanceof FormData;
  // fetch sets the multipart boundary itself, so a form must not get a Content-Type here.
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = await getApiUrl();
  try {
    return await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError('network_error');
  }
}

async function toError(response: Response): Promise<ApiError> {
  const data = await response.json().catch(() => null);
  // FastAPI sends a string for our errors and a list for validation (422) errors.
  const code = typeof data?.detail === 'string' ? data.detail : 'invalid_input';
  return new ApiError(response.status, code);
}

// Screens can fire several requests at once when the access token has just expired;
// they all wait on one refresh.
let refreshing: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    const refreshToken = await session.getRefreshToken();
    if (!refreshToken) return null;
    const response = await send(
      '/auth/refresh',
      { method: 'POST', body: { refresh_token: refreshToken } },
      null,
    );
    if (response.status === 401) return null;
    if (!response.ok) throw await toError(response);
    // The old refresh token stops working, so the new one must be kept before anything else.
    const { access_token, refresh_token } = await response.json();
    await session.saveTokens(access_token, refresh_token);
    return access_token as string;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T = void>(path: string, options: Options = {}): Promise<T> {
  const auth = options.auth ?? true;
  let response = await send(path, options, auth ? await session.getAccessToken() : null);

  if (auth && response.status === 401) {
    const token = await refreshAccessToken();
    if (!token) {
      onSessionExpired();
      throw new ApiError(401, 'session_expired');
    }
    response = await send(path, options, token);
  }

  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return response.json();
}
