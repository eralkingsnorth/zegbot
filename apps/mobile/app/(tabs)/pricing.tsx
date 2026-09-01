import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { SubscriptionPlan } from "@zegbot/shared";
import { colors, fontSize, fontWeight, radius, spacing } from "@zegbot/theme";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { createCheckout, fetchPlans, formatPlanPrice, WEB_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ui } from "@/lib/ui";

export default function PricingScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [error, setError] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans()
      .then(setPlans)
      .catch(() => setError("Could not load plans"));
  }, []);

  const subscribe = async (plan: SubscriptionPlan) => {
    setError("");
    if (!token) {
      router.push("/login");
      return;
    }
    if (plan.interval === "free" || plan.price === 0) return;

    setLoadingId(plan.id);
    try {
      const url = await createCheckout(plan.id, token);
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Checkout failed. Complete subscribe on the web if needed.",
      );
      try {
        await WebBrowser.openBrowserAsync(`${WEB_URL}/pricing`);
      } catch {
        /* ignore */
      }
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={ui.title}>Pricing</Text>
          <Text style={ui.subtitle}>Pick a plan. Subscribe opens Stripe in your browser.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {plans.length === 0 && !error ? (
            <View style={ui.card}>
              <Text style={styles.muted}>No plans available yet.</Text>
            </View>
          ) : null}
          {plans.map((plan) => (
            <View
              key={plan.id}
              style={[ui.card, plan.popular && styles.popular]}
            >
              {plan.popular ? <Text style={styles.badge}>Most popular</Text> : null}
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.price}>{formatPlanPrice(plan)}</Text>
              <Text style={styles.desc}>{plan.description}</Text>
              {plan.features.map((feature) => (
                <Text key={feature} style={styles.feature}>
                  ✓  {feature}
                </Text>
              ))}
              {plan.price > 0 ? (
                <View style={styles.btn}>
                  <Button
                    title={
                      loadingId === plan.id
                        ? "Loading..."
                        : token
                          ? "Subscribe"
                          : "Log in to subscribe"
                    }
                    onPress={() => subscribe(plan)}
                    disabled={loadingId === plan.id}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  error: { color: colors.danger, fontSize: fontSize.sm },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },
  popular: { borderColor: "rgba(99,102,241,0.4)" },
  badge: {
    alignSelf: "center",
    color: "#fff",
    backgroundColor: colors.primary,
    overflow: "hidden",
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 2,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  planName: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  price: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
  },
  desc: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.sm },
  feature: { color: colors.text, fontSize: fontSize.sm, marginTop: spacing.sm },
  btn: { marginTop: spacing.md },
});
