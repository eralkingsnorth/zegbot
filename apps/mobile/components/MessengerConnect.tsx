import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { colors, fontSize, fontWeight, radius, spacing } from "@zegbot/theme";
import { fetchMessengerLogin } from "@/lib/api";

export function MessengerConnect() {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const facebook = async () => {
    setBusy(true);
    setNote("");
    try {
      const result = await fetchMessengerLogin();
      if (!result.available) {
        setNote(result.message);
        return;
      }
      await WebBrowser.openAuthSessionAsync(
        result.url,
        "zegbot://onboarding/messenger",
      );
      setNote("If Facebook login finished, return here. You can also continue and connect later.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not open Facebook");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Messenger</Text>
      <Text style={styles.body}>
        Continue with Facebook to link a Page inbox. This is Facebook Login, not
        an iPhone or Android permission popup.
      </Text>
      <Pressable
        onPress={facebook}
        disabled={busy}
        style={[styles.facebook, busy && styles.disabled]}
      >
        <Text style={styles.facebookText}>
          {busy ? "Opening Facebook..." : "Continue with Facebook"}
        </Text>
      </Pressable>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  body: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  facebook: {
    backgroundColor: "#1877F2",
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  facebookText: {
    color: "#fff",
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  disabled: { opacity: 0.5 },
  note: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
