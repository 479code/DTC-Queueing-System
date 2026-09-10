import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { demoFleetHome, loadFleetHome } from "../src/features/fleet/api";

export default function HomeScreen() {
  const [fleet, setFleet] = useState(demoFleetHome);

  useEffect(() => {
    void loadFleetHome().then(setFleet).catch(() => setFleet(demoFleetHome));
  }, []);

  const metrics = [
    [String(fleet.trucks.filter((truck) => truck.currentStatus === "QUEUED").length), "Queued"],
    [String(fleet.trucks.filter((truck) => truck.currentStatus === "ON_TRIP").length), "On Trip"],
    [String(fleet.trucks.filter((truck) => truck.currentStatus === "PROGRAMMED").length), "Programmed"],
    [String(fleet.trucks.filter((truck) => truck.currentStatus === "INSURANCE_HOLD").length), "Insurance Hold"]
  ];
  const nextQueue = fleet.queue[0];
  const nextTruck = nextQueue ? fleet.trucks.find((truck) => truck.id === nextQueue.truckId) : undefined;
  const expiring = fleet.trucks.filter((truck) => truck.insuranceStatus === "EXPIRING_SOON").length;
  const expired = fleet.trucks.filter((truck) => truck.insuranceStatus === "EXPIRED" || truck.currentStatus === "INSURANCE_HOLD").length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.appName}>Fleet Queue</Text>
        <Text style={styles.title}>My Fleet</Text>
        <Text style={styles.subtitle}>{fleet.trucks.length} trucks assigned</Text>

        <View style={styles.metrics}>
          {metrics.map(([value, label]) => (
            <View key={label} style={styles.metric}>
              <Text style={styles.metricValue}>{value}</Text>
              <Text style={styles.metricLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => router.push("/returns")} style={styles.darkAction}>
            <Text style={styles.darkActionText}>Report Return</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/queue")} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>View Queue</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Next of my trucks</Text>
        {nextQueue && nextTruck ? <View style={styles.truckPanel}>
          <View style={styles.truckHeader}>
            <Text style={styles.truckName}>{nextQueue.registrationNumber}</Text>
            <View style={styles.positionBadge}>
              <Text style={styles.positionText}>#{nextQueue.position}</Text>
            </View>
          </View>
          <Text style={styles.truckMeta}>Driver: {nextTruck.driverName}</Text>
          <Text style={styles.truckMeta}>{Math.max(0, nextQueue.position - 1)} trucks ahead</Text>
          <Text style={styles.insurance}>Insurance valid to {nextTruck.insuranceExpiry}</Text>
          <View style={styles.truckActions}>
            <Pressable
              onPress={() => router.push({ pathname: "/bypass/request", params: { siteId: fleet.siteId, truckId: nextQueue.truckId, queueCycleId: nextQueue.id, registrationNumber: nextQueue.registrationNumber, driverName: nextQueue.driverName } })}
              style={styles.inlineAction}
            >
              <Text style={styles.inlineActionText}>Request bypass</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/queue")}
              style={styles.inlineAction}
            >
              <Text style={styles.inlineActionText}>My queue</Text>
            </Pressable>
          </View>
        </View> : <View style={styles.truckPanel}><Text style={styles.truckMeta}>None of your trucks are currently queued.</Text></View>}

        {fleet.roles.includes("overseer") ? <><Text style={styles.sectionTitle}>Approvals</Text><Pressable
          onPress={() => router.push("/approvals")}
          style={styles.approvalsAction}
        >
          <View>
            <Text style={styles.approvalsTitle}>Review bypass requests</Text>
            <Text style={styles.approvalsMeta}>3 requests pending</Text>
          </View>
          <Text style={styles.approvalsArrow}>&gt;</Text>
        </Pressable></> : null}

        <Text style={styles.sectionTitle}>Attention</Text>
        <View style={styles.attentionPanel}>
          <Text style={styles.attentionText}>{expired ? `${expired} truck${expired === 1 ? "" : "s"} have insurance holds` : "No trucks are on insurance hold"}</Text>
          <Text style={styles.attentionText}>{expiring ? `${expiring} truck${expiring === 1 ? "" : "s"} have insurance expiring soon` : "No insurance expiry warnings"}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f5f7fa",
    flex: 1
  },
  screen: {
    padding: 20,
    paddingBottom: 40
  },
  appName: {
    color: "#171f29",
    fontSize: 20,
    fontWeight: "600",
    marginTop: 2
  },
  title: {
    color: "#171f29",
    fontSize: 26,
    fontWeight: "600",
    marginTop: 28
  },
  subtitle: {
    color: "#6b7887",
    fontSize: 12,
    marginTop: 2
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 26
  },
  metric: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe0e8",
    borderRadius: 8,
    borderWidth: 1,
    padding: 13,
    width: "47.5%"
  },
  metricValue: {
    color: "#171f29",
    fontSize: 24,
    fontWeight: "600"
  },
  metricLabel: {
    color: "#6b7887",
    fontSize: 11,
    marginTop: 6
  },
  actions: {
    gap: 12,
    marginTop: 28
  },
  darkAction: {
    alignItems: "center",
    backgroundColor: "#141f29",
    borderRadius: 8,
    minHeight: 40,
    padding: 12
  },
  darkActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600"
  },
  secondaryAction: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    minHeight: 40,
    padding: 12
  },
  secondaryActionText: {
    color: "#171f29",
    fontSize: 13,
    fontWeight: "600"
  },
  sectionTitle: {
    color: "#171f29",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 32
  },
  truckPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe0e8",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 15
  },
  truckHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  truckName: {
    color: "#171f29",
    fontSize: 18,
    fontWeight: "600"
  },
  positionBadge: {
    backgroundColor: "#e8f0fc",
    borderRadius: 13,
    minWidth: 68,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  positionText: {
    color: "#2961b8",
    fontSize: 11,
    fontWeight: "600"
  },
  truckMeta: {
    color: "#6b7887",
    fontSize: 12,
    marginTop: 10
  },
  insurance: {
    color: "#6b7887",
    fontSize: 11,
    marginTop: 9
  },
  truckActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16
  },
  inlineAction: {
    backgroundColor: "#f1f5f8",
    borderRadius: 6,
    flex: 1,
    padding: 10
  },
  inlineActionText: {
    color: "#171f29",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center"
  },
  approvalsAction: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dbe0e8",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    padding: 15
  },
  approvalsTitle: {
    color: "#171f29",
    fontSize: 14,
    fontWeight: "600"
  },
  approvalsMeta: {
    color: "#bf7314",
    fontSize: 11,
    marginTop: 5
  },
  approvalsArrow: {
    color: "#6b7887",
    fontSize: 28
  },
  attentionPanel: {
    backgroundColor: "#fff5db",
    borderRadius: 8,
    gap: 16,
    marginTop: 14,
    padding: 15
  },
  attentionText: {
    color: "#bf7314",
    fontSize: 12
  }
});
