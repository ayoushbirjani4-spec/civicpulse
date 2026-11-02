import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export type User = {
  id: string;
  email: string;
  display_name: string;
  role: 'citizen' | 'admin';
  email_verified: boolean;
  created_at: string;
};

const ACCESS_TOKEN = 'civicpulse.access_token';
const REFRESH_TOKEN = 'civicpulse.refresh_token';
const USER = 'civicpulse.user';
const DEVICE_ID = 'civicpulse.device_id';

let deviceId: string | null = null;

/** Random id for this install. Survives logout, so rate limits follow the phone. */
export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  deviceId = await SecureStore.getItemAsync(DEVICE_ID);
  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_ID, deviceId);
  }
  return deviceId;
}

export const getAccessToken = () => SecureStore.getItemAsync(ACCESS_TOKEN);
export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_TOKEN);
export const setAccessToken = (token: string) => SecureStore.setItemAsync(ACCESS_TOKEN, token);

export async function saveSession(accessToken: string, refreshToken: string, user: User) {
  await SecureStore.setItemAsync(ACCESS_TOKEN, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN, refreshToken);
  await saveUser(user);
}

export const saveUser = (user: User) => SecureStore.setItemAsync(USER, JSON.stringify(user));

export async function loadUser(): Promise<User | null> {
  const stored = await SecureStore.getItemAsync(USER);
  return stored ? JSON.parse(stored) : null;
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(USER);
}
