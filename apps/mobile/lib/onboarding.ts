import { Platform } from "react-native";
import type { AuthMeResponse, MessageChannel } from "@zegbot/shared";

const PENDING_KEY = "zegbot_pending_email";

async function kvGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  }
  try {
    const SecureStore = await import("expo-secure-store");
    return await SecureStore.getItemAsync(key);
  } catch {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    return AsyncStorage.getItem(key);
  }
}

async function kvSet(key: string, value: string | null): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return;
  }
  try {
    const SecureStore = await import("expo-secure-store");
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, value);
  }
}

export async function getPendingEmail(): Promise<string | null> {
  return kvGet(PENDING_KEY);
}

export async function setPendingEmail(email: string | null): Promise<void> {
  await kvSet(PENDING_KEY, email);
}

export function onboardingPath(user: AuthMeResponse | null): string {
  if (!user) return "/onboarding";
  if (user.onboardingStep === "ai") return "/onboarding/ai";
  if (user.onboardingStep === "configure" && user.onboardingChannel) {
    return `/onboarding/${user.onboardingChannel}`;
  }
  return "/onboarding";
}

export const CHANNEL_META: Record<
  MessageChannel,
  { label: string; color: string; hint: string }
> = {
  whatsapp: {
    label: "WhatsApp",
    color: "#25d366",
    hint: "Pair with an 8-digit code",
  },
  messenger: {
    label: "Messenger",
    color: "#0084ff",
    hint: "Continue with Facebook",
  },
  telegram: {
    label: "Telegram",
    color: "#2AABEE",
    hint: "Connect later from settings",
  },
  email: {
    label: "Email",
    color: "#818cf8",
    hint: "Connect later from settings",
  },
  "in-app": {
    label: "Zegbot",
    color: "#6366f1",
    hint: "In-app messages",
  },
};
