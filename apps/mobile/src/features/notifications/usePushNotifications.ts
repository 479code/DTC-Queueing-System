import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase/client";
import { registerPushNotifications } from "./pushRegistration";

export function usePushNotifications(): void {
  useEffect(() => {
    if (!auth) return;

    let unsubscribeTokenRefresh: (() => void) | null = null;
    let disposed = false;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubscribeTokenRefresh?.();
      unsubscribeTokenRefresh = null;

      if (!user) return;

      try {
        const unsubscribe = await registerPushNotifications(user);
        if (disposed) unsubscribe?.();
        else unsubscribeTokenRefresh = unsubscribe;
      } catch {
        // Push registration is best-effort; in-app notifications remain available.
      }
    });

    return () => {
      disposed = true;
      unsubscribeAuth();
      unsubscribeTokenRefresh?.();
    };
  }, []);
}
