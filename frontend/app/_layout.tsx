import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function RootNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inUserGroup = segments[0] === "(user)";
    const inManagerGroup = segments[0] === "(manager)";
    const isAuthFlow = segments[0] === "manager-login" || segments[0] === "phone-login";
    const needsProfile = user?.role === "user" && (!user.phone || !user.name);

    if (!user) {
      // Always redirect to login when logged out, unless already on login or auth screens
      const onAuthPage = segments[0] === "manager-login" || segments[0] === "phone-login";
      const onRootPage = segments.length === 0 || segments[0] === undefined;
      if (!onRootPage && !onAuthPage) {
        router.replace("/");
      }
      return;
    }
    if (user.role === "user") {
      if (needsProfile && segments[0] !== "complete-profile") {
        router.replace("/complete-profile");
      } else if (!needsProfile && (segments[0] === "complete-profile" || isAuthFlow || (!inUserGroup && segments[0] !== "checkout"))) {
        router.replace("/(user)");
      }
    } else if (user.role === "manager") {
      if (
        !inManagerGroup &&
        segments[0] !== "member-detail" &&
        segments[0] !== "add-member"
      ) {
        router.replace("/(manager)");
      }
    }
  }, [user, loading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
        <AuthProvider>
          <RootNav />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
