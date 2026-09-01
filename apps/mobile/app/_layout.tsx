import { useEffect } from "react";
import { Stack, useRootNavigationState, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { onboardingPath } from "@/lib/onboarding";

const AUTH_ROUTES = new Set([
  "login",
  "register",
  "forgot-password",
  "check-email",
  "verify-email",
]);

function AuthGate() {
  const { token, user, loading, pendingEmail } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const nav = useRootNavigationState();

  useEffect(() => {
    if (!nav?.key || loading) return;
    const root = segments[0];
    const inAuth = AUTH_ROUTES.has(root);
    const inOnboarding = root === "onboarding";

    if (!token) {
      if (
        pendingEmail &&
        root !== "check-email" &&
        root !== "verify-email" &&
        root !== "register" &&
        root !== "login" &&
        root !== "forgot-password"
      ) {
        router.replace({ pathname: "/check-email", params: { email: pendingEmail } });
        return;
      }
      if (!inAuth && root !== undefined && root !== "index") {
        router.replace("/login");
      }
      return;
    }

    if (user && !user.onboardingCompleted) {
      if (!inOnboarding) {
        router.replace(onboardingPath(user) as never);
      }
      return;
    }

    if (inAuth || inOnboarding) {
      router.replace("/(tabs)");
    }
  }, [nav?.key, loading, token, user, pendingEmail, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="conversation/[channel]/[contact]" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="check-email" />
        <Stack.Screen name="verify-email" />
      </Stack>
    </AuthProvider>
  );
}
