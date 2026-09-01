import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, fontSize, fontWeight, spacing } from "@zegbot/theme";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { forgotPassword } from "@/lib/api";
import { ui } from "@/lib/ui";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await forgotPassword({ email });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.wrap}>
          <Text style={ui.title}>Forgot password</Text>
          <View style={ui.card}>
            {done ? (
              <>
                <Text style={styles.body}>
                  If that email is registered, we sent a reset link. Open it on the web to set a new password.
                </Text>
                <Button title="Back to log in" onPress={() => router.replace("/login")} />
              </>
            ) : (
              <>
                <Text style={styles.body}>Enter your email and we&apos;ll send a reset link.</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={colors.textDim}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={[ui.textField, styles.field]}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button
                  title={busy ? "Please wait..." : "Send reset link"}
                  onPress={submit}
                  disabled={busy}
                />
                <Pressable onPress={() => router.back()} style={styles.linkWrap}>
                  <Text style={styles.link}>Back to log in</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: spacing.lg, gap: spacing.lg },
  body: { color: colors.textMuted, fontSize: fontSize.sm, marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  error: { color: colors.danger, fontSize: fontSize.sm, marginBottom: spacing.md },
  linkWrap: { marginTop: spacing.md },
  link: {
    color: colors.primaryLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: "center",
  },
});
