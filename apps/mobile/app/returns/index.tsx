import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { demoFleetHome, loadFleetHome, reportMobileReturn, type MobileTruck } from "../../src/features/fleet/api";

export default function ReportReturnScreen() {
  const [fleet, setFleet] = useState(demoFleetHome);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"QUEUED" | "INSURANCE_HOLD" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { void loadFleetHome().then((next) => { setFleet(next); setSelectedId(next.trucks.find((truck) => truck.currentStatus === "ON_TRIP")?.id ?? ""); }); }, []);
  const choices = fleet.trucks.filter((truck) => truck.currentStatus === "ON_TRIP");
  const selected = choices.find((truck) => truck.id === selectedId);
  const submit = async () => { if (!selected) return; setBusy(true); setError(""); try { setOutcome(await reportMobileReturn(fleet.siteId, selected)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to report this return."); } finally { setBusy(false); } };

  if (outcome) return <SafeAreaView style={styles.safe}><View style={styles.screen}><Text style={styles.kicker}>Return recorded</Text><Text style={styles.title}>{outcome === "QUEUED" ? "Truck entered the queue" : "Insurance hold applied"}</Text><Text style={styles.body}>{outcome === "QUEUED" ? "The server recorded the FIFO queue time. Check My Queue for its live position." : "The truck cannot enter the queue until its insurance becomes valid."}</Text><Pressable onPress={() => router.replace("/")} style={styles.primary}><Text style={styles.primaryText}>Back to my fleet</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.screen}><Text style={styles.kicker}>Report return</Text><Text style={styles.title}>Choose an on-trip truck</Text><Text style={styles.body}>The system checks insurance and assigns the queue time only after you confirm.</Text>{choices.map((truck) => <Pressable key={truck.id} onPress={() => setSelectedId(truck.id)} style={[styles.choice, selectedId === truck.id && styles.choiceSelected]}><Text style={styles.truck}>{truck.registrationNumber}</Text><Text style={styles.meta}>Driver: {truck.driverName}</Text><Text style={styles.meta}>Insurance: {truck.insuranceStatus.replaceAll("_", " ")}</Text></Pressable>)}{choices.length === 0 ? <Text style={styles.body}>You have no assigned trucks currently on trip.</Text> : null}{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable disabled={!selected || busy} onPress={() => void submit()} style={[styles.primary, (!selected || busy) && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Confirming..." : "Confirm return"}</Text></Pressable></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { backgroundColor: "#f5f7fa", flex: 1 }, screen: { padding: 20, paddingBottom: 36 }, kicker: { color: "#6b7887", fontSize: 12, fontWeight: "600", marginTop: 22, textTransform: "uppercase" }, title: { color: "#171f29", fontSize: 26, fontWeight: "600", marginTop: 10 }, body: { color: "#6b7887", fontSize: 13, lineHeight: 20, marginTop: 16 }, choice: { backgroundColor: "#fff", borderColor: "#dbe0e8", borderRadius: 8, borderWidth: 1, marginTop: 14, padding: 15 }, choiceSelected: { borderColor: "#268c57", borderWidth: 2 }, truck: { color: "#171f29", fontSize: 16, fontWeight: "600" }, meta: { color: "#6b7887", fontSize: 12, marginTop: 6 }, error: { color: "#ba2e2e", fontSize: 12, marginTop: 14 }, primary: { alignItems: "center", backgroundColor: "#268c57", borderRadius: 8, marginTop: 26, minHeight: 44, padding: 13 }, primaryText: { color: "#fff", fontSize: 13, fontWeight: "600" }, disabled: { opacity: .55 } });
