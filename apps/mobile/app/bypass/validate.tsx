import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { validateBypassOtp } from "../../src/features/bypass/api";

export default function ValidateBypassScreen() {
  const params = useLocalSearchParams<{
    siteId?: string;
    truckId?: string;
    registrationNumber?: string;
  }>();
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [validated, setValidated] = useState(false);
  const registrationNumber = params.registrationNumber ?? "FZE 919 DI";

  const submit = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the complete six-digit authorization code.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await validateBypassOtp({
        siteId: params.siteId ?? "default-site",
        truckId: params.truckId ?? "truck-fze-919",
        otp
      });
      setValidated(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to validate code.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <Text style={styles.kicker}>
          {validated ? "Authorization ready" : "Validate bypass"}
        </Text>
        <Text style={styles.title}>{registrationNumber}</Text>

        {validated ? (
          <>
            <View style={styles.successPanel}>
              <Text style={styles.successLabel}>VALIDATED</Text>
              <Text style={styles.successTitle}>Ready for programming</Text>
              <Text style={styles.successBody}>
                The authorization can now be included in a programming batch
                before it expires.
              </Text>
            </View>
            <Pressable onPress={() => router.replace("/")} style={styles.darkButton}>
              <Text style={styles.darkButtonText}>Back to my fleet</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.instructions}>
              Enter the code shown by the approving overseer. The code is
              single-use and bound to this truck.
            </Text>
            <Text style={styles.fieldLabel}>AUTHORIZATION CODE</Text>
            <TextInput
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => setOtp(value.replace(/\D/g, ""))}
              placeholder="000000"
              placeholderTextColor="#a8b1bb"
              style={styles.otpInput}
              value={otp}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              disabled={submitting}
              onPress={submit}
              style={[styles.primaryButton, submitting && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? "Validating..." : "Validate code"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f5f7fa",
    flex: 1
  },
  screen: {
    flex: 1,
    padding: 20
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
  instructions: {
    color: "#6b7887",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 22
  },
  fieldLabel: {
    color: "#268c57",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 34
  },
  otpInput: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe0e8",
    borderRadius: 8,
    borderWidth: 1,
    color: "#171f29",
    fontSize: 36,
    fontWeight: "600",
    letterSpacing: 8,
    marginTop: 10,
    minHeight: 72,
    paddingHorizontal: 18,
    textAlign: "center"
  },
  error: {
    color: "#ba2e2e",
    fontSize: 12,
    marginTop: 14
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
  successTitle: {
    color: "#171f29",
    fontSize: 24,
    fontWeight: "600",
    marginTop: 22
  },
  successBody: {
    color: "#6b7887",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12
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
  }
});
