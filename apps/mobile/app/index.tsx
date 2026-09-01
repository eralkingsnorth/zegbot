import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { colors, fontSize, fontWeight } from "@zegbot/theme";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/lib/auth";
import { onboardingPath } from "@/lib/onboarding";

export default function Index() {
  const { token, user, loading, pendingEmail } = useAuth();

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.brand}>Zegbot</Text>
          <ActivityIndicator color={colors.primaryLight} />
        </View>
      </Screen>
    );
  }

  if (!token) {
    if (pendingEmail) {
      return <Redirect href={{ pathname: "/check-email", params: { email: pendingEmail } }} />;
    }
    return <Redirect href="/login" />;
  }

  if (user && !user.onboardingCompleted) {
    return <Redirect href={onboardingPath(user) as never} />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  brand: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
});
