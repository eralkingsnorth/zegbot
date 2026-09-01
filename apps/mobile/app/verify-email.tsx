import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, fontSize, spacing } from "@zegbot/theme";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { verifyEmail } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ui } from "@/lib/ui";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { setSession } = useAuth();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    token ? "loading" : "idle",
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmail({ token })
      .then(async (res) => {
        if (cancelled) return;
        await setSession(res);
        setStatus("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not verify email");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token, setSession]);

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.wrap}>
          <Text style={ui.title}>Verify your email</Text>
          <View style={ui.card}>
            {status === "loading" ? (
              <Text style={styles.body}>Confirming your email...</Text>
            ) : null}
            {status === "ok" ? (
              <Text style={styles.body}>Email verified. Continuing setup...</Text>
            ) : null}
            {status === "error" ? (
              <>
                <Text style={styles.error}>{error}</Text>
                <Button title="Enter code instead" onPress={() => router.replace("/check-email")} />
              </>
            ) : null}
            {status === "idle" ? (
              <>
                <Text style={styles.body}>
                  Open the email we sent and enter the 6-digit code in the app. The
                  link in that email also works.
                </Text>
                <Button title="Enter verification code" onPress={() => router.replace("/check-email")} />
                <View style={styles.gap}>
                  <Button
                    title="Back to log in"
                    variant="secondary"
                    onPress={() => router.replace("/login")}
                  />
                </View>
              </>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: spacing.lg, gap: spacing.lg },
  body: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
    marginBottom: spacing.lg,
  },
  gap: { marginTop: spacing.sm },
});
