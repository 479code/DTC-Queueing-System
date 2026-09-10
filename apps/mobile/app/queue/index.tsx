import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { demoFleetHome, loadFleetHome } from "../../src/features/fleet/api";

export default function MyQueueScreen() {
  const [fleet, setFleet] = useState(demoFleetHome);
  useEffect(() => { void loadFleetHome().then(setFleet); }, []);
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.screen}><Text style={styles.kicker}>My queue</Text><Text style={styles.title}>Live FIFO positions</Text><Text style={styles.body}>Each position is calculated by the server. You only see your assigned trucks.</Text>{fleet.queue.map((entry) => <View key={entry.id} style={styles.row}><Text style={styles.position}>#{entry.position}</Text><View style={styles.info}><Text style={styles.truck}>{entry.registrationNumber}</Text><Text style={styles.meta}>Driver: {entry.driverName}</Text><Text style={styles.meta}>Entered {entry.queueEnteredAt}</Text></View><Pressable onPress={() => router.push({ pathname: "/bypass/request", params: { siteId: fleet.siteId, truckId: entry.truckId, queueCycleId: entry.id, registrationNumber: entry.registrationNumber, driverName: entry.driverName } })} style={styles.bypass}><Text style={styles.bypassText}>Bypass</Text></Pressable></View>)}{fleet.queue.length === 0 ? <Text style={styles.body}>None of your trucks are currently queued.</Text> : null}</ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { backgroundColor: "#f5f7fa", flex: 1 }, screen: { padding: 20, paddingBottom: 36 }, kicker: { color: "#6b7887", fontSize: 12, fontWeight: "600", marginTop: 22, textTransform: "uppercase" }, title: { color: "#171f29", fontSize: 26, fontWeight: "600", marginTop: 10 }, body: { color: "#6b7887", fontSize: 13, lineHeight: 20, marginTop: 16 }, row: { alignItems: "center", backgroundColor: "#fff", borderColor: "#dbe0e8", borderRadius: 8, borderWidth: 1, flexDirection: "row", marginTop: 14, padding: 14 }, position: { color: "#268c57", fontSize: 22, fontWeight: "600", minWidth: 46 }, info: { flex: 1 }, truck: { color: "#171f29", fontSize: 14, fontWeight: "600" }, meta: { color: "#6b7887", fontSize: 11, marginTop: 4 }, bypass: { padding: 8 }, bypassText: { color: "#176b3c", fontSize: 12, fontWeight: "600" } });
