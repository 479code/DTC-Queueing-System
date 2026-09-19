import { db } from "./firebase.js";

export function siteRef(siteId: string) {
  return db.collection("sites").doc(siteId);
}

export function usersRef(siteId: string) {
  return siteRef(siteId).collection("users");
}

export function userDevicesRef(siteId: string, userId: string) {
  return usersRef(siteId).doc(userId).collection("devices");
}

export function trucksRef(siteId: string) {
  return siteRef(siteId).collection("trucks");
}

export function queueCyclesRef(siteId: string) {
  return siteRef(siteId).collection("queueCycles");
}

export function insuranceRecordsRef(siteId: string) {
  return siteRef(siteId).collection("insuranceRecords");
}

export function programmingBatchesRef(siteId: string) {
  return siteRef(siteId).collection("programmingBatches");
}

export function auditEventsRef(siteId: string) {
  return siteRef(siteId).collection("auditEvents");
}

export function bypassAuthorizationsRef(siteId: string) {
  return siteRef(siteId).collection("bypassAuthorizations");
}

export function bypassRequestsRef(siteId: string) {
  return siteRef(siteId).collection("bypassRequests");
}

export function notificationsRef(siteId: string) {
  return siteRef(siteId).collection("notifications");
}

export function dispatchImportsRef(siteId: string) {
  return siteRef(siteId).collection("dispatchImports");
}

export function dispatchRecordsRef(siteId: string) {
  return siteRef(siteId).collection("dispatchRecords");
}

export function orderImportsRef(siteId: string) {
  return siteRef(siteId).collection("orderImports");
}

export function ordersRef(siteId: string) {
  return siteRef(siteId).collection("orders");
}

export function dailyMetricsRef(siteId: string) {
  return siteRef(siteId).collection("dailyMetrics");
}
