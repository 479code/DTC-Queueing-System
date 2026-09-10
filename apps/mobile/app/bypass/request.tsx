import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { requestBypass } from "../../src/features/bypass/api";

const reasons = [
  ["OPERATIONAL_REQUIREMENT", "Operational Requirement"],
  ["DESTINATION_SPECIFIC_REQUIREMENT", "Destination-specific Requirement"],
  ["EMERGENCY_MOVEMENT", "Emergency Movement"],
  ["CUSTOMER_REQUIREMENT", "Customer Requirement"],
  ["MANAGEMENT_INSTRUCTION", "Management Instruction"],
  ["OTHER", "Other"]
] as const;

export default function RequestBypassScreen() {
  const params = useLocalSearchParams<{
    siteId?: string;
    truckId?: string;
    queueCycleId?: string;
    registrationNumber?: string;
    driverName?: string;
  }>();
  const [reason, setReason] = useState<(typeof reasons)[number]>(reasons[0]);
  const [explanation, setExplanation] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    queuePosition: number;
    trucksAhead: number;
  } | null>(null);
  const registrationNumber = params.registrationNumber ?? "FZE 441 DI";
  const driverName = params.driverName ?? "Sani Bello";

  const submit = async () => {
    if (explanation.trim().length < 10) {
      setError("Enter a clear explanation of at least ten characters.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await requestBypass({
        siteId: params.siteId ?? "default-site",
        truckId: params.truckId ?? "truck-fze-441",
        queueCycleId: params.queueCycleId ?? "cycle-fze-441",
        reasonCategory: reason[0],
        explanation: explanation.trim()
      });
      setResult({
        queuePosition: response.queuePositionAtRequest,
        trucksAhead: response.numberOfTrucksBypassed
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to request bypass.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.screen}>
          <Text style={styles.kicker}>Request submitted</Text>
          <Text style={styles.title}>{registrationNumber}</Text>
          <View style={styles.successPanel}>
            <Text style={styles.successLabel}>CURRENT POSITION</Text>
            <Text style={styles.successPosition}>#{result.queuePosition}</Text>
            <Text style={styles.successMeta}>
              {result.trucksAhead} trucks ahead
            </Text>
          </View>
          <Text style={styles.help}>
            An overseer has been notified. You can enter the authorization code
            after approval.
          </Text>
          <Pressable
            onPress={() =>
              router.replace({
                pathname: "/bypass/validate",
                params: {
                  siteId: params.siteId ?? "default-site",
                  truckId: params.truckId ?? "truck-fze-441",
                  registrationNumber
                }
              })
            }
            style={styles.darkButton}
          >
            <Text style={styles.darkButtonText}>Enter authorization code</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.textButton}>
            <Text style={styles.textButtonText}>Back to my fleet</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.kicker}>Request bypass</Text>
        <Text style={styles.title}>{registrationNumber}</Text>
        <Text style={styles.driver}>Driver: {driverName}</Text>

        <View style={styles.queuePanel}>
          <View>
            <Text style={styles.label}>CURRENT POSITION</Text>
            <Text style={styles.position}>#7</Text>
          </View>
          <Text style={styles.queueMeta}>6 trucks ahead</Text>
        </View>

        <Text style={styles.fieldLabel}>Reason</Text>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.select}>
          <Text style={styles.selectText}>{reason[1]}</Text>
          <Text style={styles.selectArrow}>v</Text>
        </Pressable>

        <Text style={styles.fieldLabel}>Explanation</Text>
        <TextInput
          multiline
          onChangeText={setExplanation}
          placeholder="Explain why this truck needs priority movement"
          placeholderTextColor="#8b96a3"
          style={styles.textarea}
          textAlignVertical="top"
          value={explanation}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          disabled={submitting}
          onPress={submit}
          style={[styles.primaryButton, submitting && styles.disabled]}
        >
          <Text style={styles.primaryButtonText}>
            {submitting ? "Submitting..." : "Submit request"}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        transparent
        visible={menuOpen}
      >
        <Pressable
          onPress={() => setMenuOpen(false)}
          style={styles.modalBackdrop}
        >
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Select reason</Text>
            {reasons.map((option) => (
              <Pressable
                key={option[0]}
                onPress={() => {
                  setReason(option);
                  setMenuOpen(false);
                }}
                style={styles.menuItem}
              >
                <Text style={styles.menuItemText}>{option[1]}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f5f7fa",
    flex: 1
  },
  screen: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 36
  },
  kicker: {
    color: "#6b7887",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 22,
    textTransform: "uppercase"
  },
  title: {
    color: "#171f29",
    fontSize: 26,
    fontWeight: "600",
    marginTop: 10
  },
  driver: {
    color: "#6b7887",
    fontSize: 12,
    marginTop: 5
  },
  queuePanel: {
    alignItems: "flex-end",
    backgroundColor: "#ffffff",
    borderColor: "#dbe0e8",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 28,
    padding: 16
  },
  label: {
    color: "#6b7887",
    fontSize: 11,
    fontWeight: "600"
  },
  position: {
    color: "#171f29",
    fontSize: 34,
    fontWeight: "600",
    marginTop: 6
  },
  queueMeta: {
    color: "#6b7887",
    fontSize: 12,
    marginBottom: 4
  },
  fieldLabel: {
    color: "#6b7887",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 24
  },
  select: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dbe0e8",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 46,
    paddingHorizontal: 13
  },
  selectText: {
    color: "#171f29",
    fontSize: 13
  },
  selectArrow: {
    color: "#6b7887",
    fontSize: 12
  },
  textarea: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe0e8",
    borderRadius: 8,
    borderWidth: 1,
    color: "#171f29",
    fontSize: 13,
    minHeight: 124,
    padding: 13
  },
  error: {
    color: "#ba2e2e",
    fontSize: 12,
    marginTop: 12
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#268c57",
    borderRadius: 8,
    marginTop: 26,
    minHeight: 44,
    padding: 13
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600"
  },
  disabled: {
    opacity: 0.6
  },
  successPanel: {
    backgroundColor: "#e5f7ed",
    borderRadius: 8,
    marginTop: 28,
    padding: 20
  },
  successLabel: {
    color: "#268c57",
    fontSize: 11,
    fontWeight: "600"
  },
  successPosition: {
    color: "#171f29",
    fontSize: 44,
    fontWeight: "600",
    marginTop: 18
  },
  successMeta: {
    color: "#268c57",
    fontSize: 13,
    marginTop: 4
  },
  help: {
    color: "#6b7887",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 22
  },
  darkButton: {
    alignItems: "center",
    backgroundColor: "#141f29",
    borderRadius: 8,
    marginTop: 28,
    minHeight: 44,
    padding: 13
  },
  darkButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600"
  },
  textButton: {
    alignItems: "center",
    marginTop: 12,
    padding: 12
  },
  textButtonText: {
    color: "#171f29",
    fontSize: 13,
    fontWeight: "600"
  },
  modalBackdrop: {
    backgroundColor: "rgba(20, 31, 41, 0.46)",
    flex: 1,
    justifyContent: "flex-end"
  },
  menu: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 20,
    paddingBottom: 34
  },
  menuTitle: {
    color: "#171f29",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12
  },
  menuItem: {
    borderTopColor: "#edf0f3",
    borderTopWidth: 1,
    paddingVertical: 14
  },
  menuItemText: {
    color: "#171f29",
    fontSize: 13
  }
});
