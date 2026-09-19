import Constants from "expo-constants";
import { PermissionsAndroid, Platform } from "react-native";
import installations from "@react-native-firebase/installations";
import messaging from "@react-native-firebase/messaging";
import type { User } from "firebase/auth";
import { functions } from "../../firebase/client";
import { callOperationalApi } from "../../firebase/operations";

type RegisterDeviceTokenInput = {
  siteId: string;
  deviceId: string;
  fcmToken: string;
  platform: "android" | "ios";
  appVersion?: string;
};

type UnregisterDeviceTokenInput = {
  siteId: string;
  deviceId: string;
};

async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    if (Number(Platform.Version) < 33) return true;

    return (
      (await PermissionsAndroid.request(
        "android.permission.POST_NOTIFICATIONS"
      )) === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const status = await messaging().requestPermission();
  return (
    status === messaging.AuthorizationStatus.AUTHORIZED ||
    status === messaging.AuthorizationStatus.PROVISIONAL
  );
}

async function getSiteId(user: User): Promise<string | null> {
  const token = await user.getIdTokenResult();
  return typeof token.claims.siteId === "string" ? token.claims.siteId : null;
}

export async function registerPushNotifications(
  user: User
): Promise<(() => void) | null> {
  if (!functions || Platform.OS === "web") return null;

  const siteId = await getSiteId(user);
  if (!siteId || !(await hasNotificationPermission())) return null;

  if (!messaging().isDeviceRegisteredForRemoteMessages) {
    await messaging().registerDeviceForRemoteMessages();
  }

  const deviceId = await installations().getId();
  const appVersion = Constants.expoConfig?.version;
  const common = {
    siteId,
    deviceId,
    platform: Platform.OS as "android" | "ios",
    ...(appVersion ? { appVersion } : {})
  };

  const register = (input: RegisterDeviceTokenInput) => callOperationalApi<RegisterDeviceTokenInput, { registered: true }>("registerDeviceToken", input);
  await register({
    ...common,
    fcmToken: await messaging().getToken()
  });

  return messaging().onTokenRefresh((fcmToken) => {
    void register({ ...common, fcmToken }).catch(() => undefined);
  });
}

export async function unregisterPushNotifications(user: User): Promise<void> {
  if (!functions || Platform.OS === "web") return;

  const siteId = await getSiteId(user);
  if (!siteId) return;

  await callOperationalApi<UnregisterDeviceTokenInput, { registered: false }>("unregisterDeviceToken", {
    siteId,
    deviceId: await installations().getId()
  });
  await messaging().deleteToken();
}
