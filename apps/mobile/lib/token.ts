import { Platform } from "react-native";

const REFRESH_KEY = "zegbot_refresh_token";

async function webGet(key: string): Promise<string | null> {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(key);
}

async function webSet(key: string, token: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, token);
}

async function webClear(key: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(key);
}

async function read(key: string): Promise<string | null> {
  if (Platform.OS === "web") return webGet(key);
  try {
    const SecureStore = await import("expo-secure-store");
    return await SecureStore.getItemAsync(key);
  } catch {
    try {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

async function write(key: string, token: string): Promise<void> {
  if (Platform.OS === "web") {
    await webSet(key, token);
    return;
  }
  try {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(key, token);
  } catch {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorage.setItem(key, token);
  }
}

async function remove(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await webClear(key);
    return;
  }
  try {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.deleteItemAsync(key);
  } catch {
    try {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Only the refresh token is persisted. Access tokens are short-lived and held
 * in memory by lib/session, so nothing long-lived sits on disk in plain form.
 */
export const getRefreshToken = () => read(REFRESH_KEY);
export const setRefreshToken = (token: string) => write(REFRESH_KEY, token);
export const clearRefreshToken = () => remove(REFRESH_KEY);

const LEGACY_KEY = "zegbot_user_token";

/** Removes the pre-refresh-token session so old installs land on the login screen. */
export async function clearLegacyToken(): Promise<void> {
  await remove(LEGACY_KEY);
}
