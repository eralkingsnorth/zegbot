import { useEffect, useState } from "react";
import { Share, StyleSheet, Text, TextInput, View } from "react-native";
import { io } from "socket.io-client";
import type { WhatsAppState } from "@zegbot/shared";
import { colors, fontSize, fontWeight, radius, spacing } from "@zegbot/theme";
import { API_URL, requestWhatsAppPairing, WEB_URL } from "@/lib/api";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";

export function WhatsAppConnect({
  onConnected,
}: {
  onConnected?: () => void;
}) {
  const [state, setState] = useState<WhatsAppState>({ status: "disconnected" });
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/whatsapp/status`)
      .then((r) => r.json())
      .then((next: WhatsAppState) => {
        setState(next);
        if (next.status === "connected") onConnected?.();
      })
      .catch(() => {});

    const socket = io(API_URL);
    socket.on("whatsapp:state", (next: WhatsAppState) => {
      setState(next);
      if (next.status === "connected") onConnected?.();
    });
    return () => {
      socket.disconnect();
    };
  }, [onConnected]);

  const pair = async () => {
    setError("");
    setBusy(true);
    try {
      setState(await requestWhatsAppPairing(phone));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get pairing code");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/whatsapp/logout`, { method: "POST" });
      if (!res.ok) throw new Error("Disconnect failed");
      setState(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect");
    } finally {
      setBusy(false);
    }
  };

  const shareOtherDevice = async () => {
    setError("");
    try {
      await fetch(`${API_URL}/whatsapp/connect`, { method: "POST" });
      await Share.share({
        message:
          `Open this Zegbot WhatsApp setup on a computer or a second phone, then scan the QR with this phone.\n${WEB_URL}/connect`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share setup link");
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>WhatsApp</Text>
          <Text style={styles.subtitle}>Link with a pairing code</Text>
        </View>
        <StatusBadge label={state.status} />
      </View>

      {state.phone ? (
        <Text style={styles.phone}>
          Connected as <Text style={styles.phoneBold}>{state.phone}</Text>
        </Text>
      ) : null}

      {state.status !== "connected" ? (
        <>
          <Text style={styles.hint}>
            Enter your WhatsApp number with country code. Then in WhatsApp go to
            Linked devices → Link a device → Link with phone number, and type the
            8-digit code.
          </Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="15551234567"
            placeholderTextColor={colors.textDim}
            keyboardType="phone-pad"
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title={busy ? "Getting code..." : "Get pairing code"}
            variant="whatsapp"
            onPress={pair}
            disabled={busy}
          />

          {state.pairingCode ? (
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>Enter this code in WhatsApp</Text>
              <Text selectable style={styles.code}>
                {state.pairingCode}
              </Text>
            </View>
          ) : null}

          <View style={styles.fallback}>
            <Text style={styles.fallbackTitle}>Using a computer or second phone?</Text>
            <Text style={styles.hint}>
              QR codes cannot be scanned on this same screen. Open the setup link
              on a computer or another phone, then scan that QR with this phone.
            </Text>
            <Button
              title="Share setup link for another device"
              variant="secondary"
              onPress={shareOtherDevice}
            />
          </View>
        </>
      ) : (
        <View style={styles.successBox}>
          <Text style={styles.successText}>
            WhatsApp is live. Chats will show in your inbox with a WhatsApp label.
          </Text>
          <Button
            title={busy ? "Disconnecting..." : "Disconnect"}
            variant="secondary"
            onPress={disconnect}
            disabled={busy}
          />
        </View>
      )}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  phone: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  phoneBold: {
    color: colors.text,
    fontWeight: fontWeight.medium,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  input: {
    color: colors.text,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
  },
  codeBox: {
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(0,0,0,0.2)",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  codeLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  code: {
    color: colors.text,
    fontSize: 32,
    fontWeight: fontWeight.bold,
    letterSpacing: 3,
  },
  fallback: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  fallbackTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  successBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
    backgroundColor: colors.successSoft,
    padding: spacing.md,
  },
  successText: {
    color: colors.success,
    fontSize: fontSize.sm,
  },
});
