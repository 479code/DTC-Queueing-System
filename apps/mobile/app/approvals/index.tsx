import { useEffect, useMemo, useState } from "react";
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
import {
  approveBypass,
  demoRequest,
  getSession,
  rejectBypass,
  subscribeToPendingBypasses,
  type ApprovedBypass,
  type BypassRequestSummary
} from "../../src/features/bypass/api";

function formatOtp(otp: string): string {
  return `${otp.slice(0, 3)} ${otp.slice(3)}`;
}

function secondsRemaining(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export default function ApprovalsScreen() {
  const [requests, setRequests] = useState<BypassRequestSummary[]>([demoRequest]);
  const [selectedId, setSelectedId] = useState(demoRequest.id);
  const [approved, setApproved] = useState<ApprovedBypass | null>(null);
  const [approvedRequest, setApprovedRequest] =
    useState<BypassRequestSummary | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;
    let active = true;

    void getSession().then((session) => {
      if (!active || !session || !session.roles.includes("overseer")) {
        return;
      }

      unsubscribe = subscribeToPendingBypasses(
        session.siteId,
        (nextRequests) => {
          setRequests(nextRequests);
          setSelectedId((current) =>
            nextRequests.some((request) => request.id === current)
              ? current
              : nextRequests[0]?.id ?? ""
          );
        },
        setMessage
      );
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!approved) {
      return;
    }

    const updateRemaining = () =>
      setRemaining(secondsRemaining(approved.expiresAt));
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    return () => clearInterval(timer);
  }, [approved]);

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? requests[0],
    [requests, selectedId]
  );

  const removeRequest = (requestId: string) => {
    setRequests((current) => current.filter((request) => request.id !== requestId));
  };

  const approve = async () => {
    if (!selected) {
      return;
    }

    setWorking(true);
    setMessage("");

    try {
      const result = await approveBypass(selected);
      setApprovedRequest(selected);
      setApproved(result);
      removeRequest(selected.id);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Approval failed.");
    } finally {
      setWorking(false);
    }
  };

  const reject = async () => {
    if (!selected || rejectionReason.trim().length < 5) {
      setMessage("Enter a clear rejection reason.");
      return;
    }

    setWorking(true);
    setMessage("");

    try {
      await rejectBypass(selected, rejectionReason.trim());
      removeRequest(selected.id);
      setRejectOpen(false);
      setRejectionReason("");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Rejection failed.");
    } finally {
      setWorking(false);
    }
  };

  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");

  if (approved) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.screen}>
          <Text style={styles.approvedTitle}>Bypass Approved</Text>
          <Text style={styles.approvedTruck}>
            {approvedRequest?.registrationNumber ?? approved.truckId}
          </Text>
          <View style={styles.codePanel}>
            <Text style={styles.codeLabel}>AUTHORIZATION CODE</Text>
            <Text selectable style={styles.code}>{formatOtp(approved.otp)}</Text>
            <Text style={styles.codeTimer}>
              {remaining > 0
                ? `Valid for ${minutes}:${seconds}`
                : "Authorization expired"}
            </Text>
            <Text style={styles.codeMeta}>
              Single use | {approvedRequest?.registrationNumber ?? approved.truckId} only
            </Text>
            <Text style={styles.requestMeta}>
              Request {approved.bypassRequestId}
            </Text>
          </View>
          <Text style={styles.codeHelp}>
            Show this code to the requesting fleet officer. It will not be shown
            again after you leave this screen.
          </Text>
          <Pressable
            onPress={() => {
              setApproved(null);
              setApprovedRequest(null);
            }}
            style={styles.darkButton}
          >
            <Text style={styles.darkButtonText}>Back to Approvals</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Approvals</Text>
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>{requests.length} PENDING</Text>
          </View>
        </View>

        {message ? <Text style={styles.error}>{message}</Text> : null}

        {requests.length > 1 ? (
          <ScrollView
            contentContainerStyle={styles.requestTabs}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {requests.map((request) => (
              <Pressable
                key={request.id}
                onPress={() => setSelectedId(request.id)}
                style={[
                  styles.requestTab,
                  request.id === selected?.id && styles.requestTabActive
                ]}
              >
                <Text
                  style={[
                    styles.requestTabText,
                    request.id === selected?.id && styles.requestTabTextActive
                  ]}
                >
                  {request.registrationNumber}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {selected ? (
          <>
            <Text style={styles.kicker}>Bypass Request</Text>
            <Text style={styles.truck}>{selected.registrationNumber}</Text>
            <Text style={styles.position}>
              Position #{selected.queuePosition} | {selected.trucksAhead} trucks ahead
            </Text>
            <Text style={styles.driver}>Driver: {selected.driverName}</Text>

            <View style={styles.detailPanel}>
              <Text style={styles.label}>Requested by</Text>
              <Text style={styles.value}>{selected.requestedByName}</Text>
              <Text style={styles.label}>Reason</Text>
              <Text style={styles.value}>{selected.reasonCategory}</Text>
              <Text style={styles.label}>Explanation</Text>
              <Text style={styles.explanation}>{selected.explanation}</Text>
              <Text style={styles.label}>Queue entry</Text>
              <Text style={styles.value}>{selected.requestedAt}</Text>
            </View>

            <View style={styles.actions}>
              <Pressable
                disabled={working}
                onPress={() => setRejectOpen(true)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Reject</Text>
              </Pressable>
              <Pressable
                disabled={working}
                onPress={approve}
                style={[styles.primaryButton, working && styles.disabled]}
              >
                <Text style={styles.primaryButtonText}>
                  {working ? "Working..." : "Approve"}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.help}>
              Approval generates a single-use code bound to this truck and request.
            </Text>
          </>
        ) : (
          <Text style={styles.empty}>No bypass requests are waiting for review.</Text>
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setRejectOpen(false)}
        transparent
        visible={rejectOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.rejectDialog}>
            <Text style={styles.dialogTitle}>Reject bypass request</Text>
            <Text style={styles.dialogSubtitle}>
              Give the fleet officer a clear operational reason.
            </Text>
            <TextInput
              multiline
              onChangeText={setRejectionReason}
              placeholder="Rejection reason"
              placeholderTextColor="#8b96a3"
              style={styles.rejectInput}
              textAlignVertical="top"
              value={rejectionReason}
            />
            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setRejectOpen(false)}
                style={styles.dialogSecondary}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={working}
                onPress={reject}
                style={styles.dialogReject}
              >
                <Text style={styles.dialogRejectText}>
                  {working ? "Rejecting..." : "Reject request"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
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
    paddingBottom: 40
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2
  },
  headerTitle: {
    color: "#171f29",
    fontSize: 20,
    fontWeight: "600"
  },
  pendingBadge: {
    backgroundColor: "#fff5db",
    borderRadius: 13,
    minWidth: 92,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  pendingText: {
    color: "#bf7314",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center"
  },
  requestTabs: {
    gap: 8,
    paddingVertical: 20
  },
  requestTab: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe0e8",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  requestTabActive: {
    backgroundColor: "#293847",
    borderColor: "#293847"
  },
  requestTabText: {
    color: "#171f29",
    fontSize: 12,
    fontWeight: "600"
  },
  requestTabTextActive: {
    color: "#ffffff"
  },
  kicker: {
    color: "#6b7887",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 28
  },
  truck: {
    color: "#171f29",
    fontSize: 26,
    fontWeight: "600",
    marginTop: 8
  },
  position: {
    color: "#171f29",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 6
  },
  driver: {
    color: "#6b7887",
    fontSize: 12,
    marginTop: 6
  },
  detailPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe0e8",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 26,
    padding: 15
  },
  label: {
    color: "#6b7887",
    fontSize: 11,
    fontWeight: "500",
    marginTop: 20
  },
  value: {
    color: "#171f29",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 7
  },
  explanation: {
    color: "#171f29",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7
  },
  actions: {
    flexDirection: "row",
    gap: 20,
    marginTop: 32
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    flex: 1,
    minHeight: 40,
    padding: 12
  },
  secondaryButtonText: {
    color: "#171f29",
    fontSize: 13,
    fontWeight: "600"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#268c57",
    borderRadius: 8,
    flex: 1,
    minHeight: 40,
    padding: 12
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600"
  },
  disabled: {
    opacity: 0.6
  },
  help: {
    color: "#6b7887",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 22
  },
  empty: {
    color: "#6b7887",
    fontSize: 13,
    marginTop: 60,
    textAlign: "center"
  },
  error: {
    color: "#ba2e2e",
    fontSize: 12,
    marginTop: 16
  },
  approvedTitle: {
    color: "#171f29",
    fontSize: 24,
    fontWeight: "600",
    marginTop: 48
  },
  approvedTruck: {
    color: "#171f29",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 12
  },
  codePanel: {
    backgroundColor: "#e5f7ed",
    borderRadius: 8,
    marginTop: 38,
    padding: 20
  },
  codeLabel: {
    color: "#268c57",
    fontSize: 11,
    fontWeight: "500"
  },
  code: {
    color: "#171f29",
    fontSize: 44,
    fontWeight: "600",
    letterSpacing: 0,
    marginTop: 28
  },
  codeTimer: {
    color: "#268c57",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 10
  },
  codeMeta: {
    color: "#6b7887",
    fontSize: 12,
    marginTop: 22
  },
  requestMeta: {
    color: "#6b7887",
    fontSize: 11,
    marginTop: 18
  },
  codeHelp: {
    color: "#6b7887",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 22
  },
  darkButton: {
    alignItems: "center",
    backgroundColor: "#141f29",
    borderRadius: 8,
    marginTop: 26,
    minHeight: 40,
    padding: 12
  },
  darkButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600"
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(20, 31, 41, 0.46)",
    flex: 1,
    justifyContent: "center",
    padding: 20
  },
  rejectDialog: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 20,
    width: "100%"
  },
  dialogTitle: {
    color: "#171f29",
    fontSize: 18,
    fontWeight: "600"
  },
  dialogSubtitle: {
    color: "#6b7887",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6
  },
  rejectInput: {
    borderColor: "#dbe0e8",
    borderRadius: 8,
    borderWidth: 1,
    color: "#171f29",
    fontSize: 13,
    marginTop: 18,
    minHeight: 100,
    padding: 12
  },
  dialogActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18
  },
  dialogSecondary: {
    alignItems: "center",
    backgroundColor: "#f1f5f8",
    borderRadius: 6,
    flex: 1,
    padding: 12
  },
  dialogReject: {
    alignItems: "center",
    backgroundColor: "#ba2e2e",
    borderRadius: 6,
    flex: 1,
    padding: 12
  },
  dialogRejectText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600"
  }
});
