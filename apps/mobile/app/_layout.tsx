import { Stack } from "expo-router";
import { usePushNotifications } from "../src/features/notifications/usePushNotifications";

export default function Layout() {
  usePushNotifications();

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: "#f5f7fa" },
        headerShown: false
      }}
    />
  );
}
