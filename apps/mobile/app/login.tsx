import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, fontSize, fontWeight, spacing } from "@zegbot/theme";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { ui } from "@/lib/ui";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.wrap}>
          <Text style={ui.title}>Log in</Text>
          <Text style={ui.subtitle}>Use your Zegbot account on iOS and Android.</Text>

          <View style={ui.card}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              keyboardType="email-address"
              style={ui.textField}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              style={[ui.textField, styles.gap]}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title={busy ? "Please wait..." : "Log in"} onPress={submit} disabled={busy} />
            <Pressable onPress={() => router.push("/forgot-password")} style={styles.linkWrap}>
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/register")}>
              <Text style={styles.muted}>
                No account? <Text style={styles.link}>Register</Text>
              </Text>
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
  gap: { marginTop: spacing.sm, marginBottom: spacing.md },
  error: { color: colors.danger, fontSize: fontSize.sm, marginBottom: spacing.md },
  linkWrap: { marginTop: spacing.md, marginBottom: spacing.sm },
  link: { color: colors.primaryLight, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },
});
