import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, fontSize, fontWeight, spacing } from "@zegbot/theme";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { resendVerification, verifyEmailCode } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ui } from "@/lib/ui";

export default function CheckEmailScreen() {
  const router = useRouter();
  const { setSession, setPendingEmail, pendingEmail } = useAuth();
  const { email: paramEmail } = useLocalSearchParams<{ email?: string }>();
  const email = paramEmail || pendingEmail || "";
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await verifyEmailCode({ email, code });
      await setSession(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify email");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError("");
    setInfo("");
    try {
      await resendVerification({ email });
      setInfo("We sent a new code if that email is still unverified.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend");
    }
  };

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.wrap}>
          <Text style={ui.title}>Verify your email</Text>
          <Text style={ui.subtitle}>
            Enter the 6-digit code we emailed{email ? ` to ${email}` : ""}.
          </Text>
          <View style={ui.card}>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              maxLength={6}
              style={ui.textField}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}
            <Button
              title={busy ? "Verifying..." : "Verify and continue"}
              onPress={submit}
              disabled={busy || code.replace(/\D/g, "").length !== 6}
            />
            <View style={styles.gap}>
              <Button title="Resend code" variant="secondary" onPress={resend} />
            </View>
            <Pressable onPress={() => router.replace("/login")} style={styles.linkWrap}>
              <Text style={styles.muted}>
                Already verified? <Text style={styles.link}>Log in</Text>
              </Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                await setPendingEmail(null);
                router.replace("/register");
              }}
            >
              <Text style={styles.muted}>Use a different email</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: spacing.lg, gap: spacing.lg },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  info: {
    color: colors.success,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  gap: { marginTop: spacing.sm },
  linkWrap: { marginTop: spacing.md, marginBottom: spacing.sm },
  link: { color: colors.primaryLight, fontWeight: fontWeight.medium },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },
});
