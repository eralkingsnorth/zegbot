import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, fontSize, fontWeight, spacing } from "@zegbot/theme";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { userRegister } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ui } from "@/lib/ui";

export default function RegisterScreen() {
  const router = useRouter();
  const { setPendingEmail } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await userRegister({ name, email, password });
      await setPendingEmail(email.trim().toLowerCase());
      router.replace({ pathname: "/check-email", params: { email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.wrap}>
          <Text style={ui.title}>Create account</Text>
          <Text style={ui.subtitle}>Same account works on web, iOS, and Android.</Text>

          <View style={ui.card}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={colors.textDim}
              style={ui.textField}
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[ui.textField, styles.field]}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password (min 8 characters)"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              style={[ui.textField, styles.field]}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              title={busy ? "Please wait..." : "Register"}
              onPress={submit}
              disabled={busy}
            />
            <Pressable onPress={() => router.push("/login")} style={styles.linkWrap}>
              <Text style={styles.muted}>
                Already have an account? <Text style={styles.link}>Log in</Text>
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
  field: { marginTop: spacing.sm },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  linkWrap: { marginTop: spacing.md },
  link: { color: colors.primaryLight, fontWeight: fontWeight.medium },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },
});
