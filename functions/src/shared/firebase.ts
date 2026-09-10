import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const storage = getStorage();
export const auth = getAuth();
export const messaging = getMessaging();
