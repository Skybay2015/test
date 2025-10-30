import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert as RNAlert,
  useColorScheme,
} from "react-native";
import * as Haptics from "expo-haptics";
import AlertsService from "../services/AlertsService";
import VideoPlayer from "../components/VideoPlayer";
import DecisionService from "../services/DecisionService";
import EventBus from "../utils/EventBus";
import { Alert as AppAlert, Decision } from "../types";

type Props = { route: { params?: { alert?: AppAlert; id?: string } } };

const AlertDetailScreen: React.FC<Props> = ({ route }: Props) => {
  const paramAlert = route.params?.alert;
  const id = route.params?.id ?? (paramAlert as AppAlert | undefined)?.id;
  const [alert, setAlert] = useState<AppAlert | null>(paramAlert ?? null);
  const [isQueued, setIsQueued] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (alert || !id) return;
      const data = await AlertsService.fetchFaceAlerts();
      const found = data.find((a: AppAlert) => a.id === id);
      if (!mounted) return;
      setAlert(found ?? null);
    }
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    let mounted = true;

    const checkQueued = async () => {
      if (!alert) return;
      try {
        const list = await DecisionService.list();
        const found = (list || []).some(
          (d: Decision) => d.alertId === alert.id
        );
        if (mounted) setIsQueued(!!found);
      } catch (e) {
        console.warn("Failed to check queued decisions", e);
      }
    };

    checkQueued();

    const unsubQueued = EventBus.on<{ alertId: string }>(
      "decision:queued",
      (p) => {
        if (!p || !p.alertId) return;
        if (!alert) return;
        if (p.alertId === alert.id) setIsQueued(true);
      }
    );

    const unsubSync = EventBus.on("decision:sync:success", () => {
      void checkQueued();
    });

    return () => {
      mounted = false;
      try {
        unsubQueued && unsubQueued();
      } catch (e) {
        console.warn(e);
      }
      try {
        unsubSync && unsubSync();
      } catch (e) {
        console.warn(e);
      }
    };
  }, [alert]);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const textColor = isDark ? "#EEE" : "#111";
  const mutedColor = isDark ? "#AAA" : "#666";
  const cardBg = isDark ? "#0b0b0b" : "#fff";

  if (!alert) {
    return (
      <View style={styles.center}>
        <Text style={{ color: mutedColor }}>Alert not found.</Text>
      </View>
    );
  }

  const enqueue = async (action: string) => {
    try {
      await DecisionService.enqueue({
        alertId: alert.id,
        decision: action === "confirm_theft" ? "confirmed" : "dismissed",
        action,
        at: new Date().toISOString(),
      });
      setIsQueued(true);

      try {
        const optimisticStatus =
          action === "confirm_theft" ? "confirmed" : "dismissed";
        setAlert((prev) =>
          prev ? { ...prev, status: optimisticStatus } : prev
        );
        EventBus.emit("alert:statusChanged", {
          alertId: alert.id,
          status: optimisticStatus,
        });
      } catch (e) {
        console.warn("Optimistic update failed", e);
      }
      try {
        await DecisionService.sync();
      } catch (e) {
        console.warn(e);
      }
      EventBus.emit("decision:queued", { alertId: alert.id, action });
      try {
        if (!alert) throw new Error("No alert");
        if (action === "confirm_theft") {
          await AlertsService.markReviewed(alert.id, "confirmed");
          // server-side mark succeeded; already updated optimistic state
          setAlert((prev) => (prev ? { ...prev, status: "confirmed" } : prev));
          EventBus.emit("alert:statusChanged", {
            alertId: alert.id,
            status: "confirmed",
          });
        } else if (action === "false_alarm") {
          await AlertsService.markReviewed(alert.id, "dismissed");
          setAlert((prev) => (prev ? { ...prev, status: "dismissed" } : prev));
          EventBus.emit("alert:statusChanged", {
            alertId: alert.id,
            status: "dismissed",
          });
        }
      } catch (e) {
        console.warn(e);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      RNAlert.alert("Saved", `Decision '${action}' queued locally`);
    } catch (e) {
      RNAlert.alert("Error", "Could not save decision");
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { backgroundColor: cardBg }]}
      accessibilityLabel="Alert detail"
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: textColor }]}>
          {alert.store?.name ?? "Store"}
        </Text>
        {alert.status === "unreviewed" ? (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>Pending Review</Text>
          </View>
        ) : (
          <View
            style={[
              styles.statusBadge,
              alert.status === "confirmed"
                ? styles.statusConfirmed
                : styles.statusDismissed,
            ]}
          >
            <Text style={styles.statusText}>
              {alert.status === "confirmed" ? "Confirmed" : "Dismissed"}
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.meta, { color: mutedColor }]}>
        {new Date(alert.timestamp).toLocaleString()}
      </Text>

      {alert.type !== "concealment" ? (
        <>
          <View style={styles.facesRow}>
            <View style={styles.faceCard}>
              <Image
                source={{ uri: alert.individual?.image_url }}
                style={styles.faceImage}
              />
              <Text style={styles.faceLabel}>Banned profile</Text>
            </View>
            <View style={styles.faceCard}>
              <Image
                source={{ uri: alert.detection_image }}
                style={styles.faceImage}
              />
              <Text style={styles.faceLabel}>Detection</Text>
            </View>
          </View>

          <View style={styles.matchPillWrap}>
            <View style={styles.matchPill}>
              <Text style={styles.matchText}>{alert.prediction}% Match</Text>
            </View>
          </View>
        </>
      ) : null}

      <View
        style={[
          styles.infoCard,
          { backgroundColor: cardBg, borderColor: isDark ? "#222" : "#f0f0f0" },
        ]}
      >
        <Text style={styles.eventId}>#{alert.id ?? "QE000"}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Location</Text>
          <Text style={[styles.infoValue, { color: textColor }]}>
            {alert.store?.name ?? "-"}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Timestamp</Text>
          <Text style={[styles.infoValue, { color: textColor }]}>
            {" "}
            {new Date(alert.timestamp).toLocaleString()}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Camera</Text>
          <Text style={[styles.infoValue, { color: textColor }]}>
            {alert.camera?.location ?? "-"}
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[
            styles.denyButton,
            alert.status !== "unreviewed" || isQueued
              ? styles.disabledButton
              : null,
          ]}
          onPress={() => enqueue("false_alarm")}
          disabled={alert.status !== "unreviewed" || isQueued}
        >
          <Text style={styles.denyText}>Not a match</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            alert.status !== "unreviewed" || isQueued
              ? styles.disabledButton
              : null,
          ]}
          onPress={() => enqueue("confirm_theft")}
          disabled={alert.status !== "unreviewed" || isQueued}
        >
          <Text style={styles.confirmText}>Confirm match</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
};

export default AlertDetailScreen;

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 20, fontWeight: "700" },
  meta: { color: "#666", marginBottom: 12 },
  statusBadge: {
    backgroundColor: "#ff9f1a",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
  },
  statusText: { color: "#fff", fontWeight: "700" },
  statusConfirmed: { backgroundColor: "#007a3d" },
  statusDismissed: { backgroundColor: "#8b0000" },
  facesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  faceCard: { flex: 1, alignItems: "center", marginRight: 8 },
  faceImage: {
    width: 140,
    height: 140,
    borderRadius: 10,
    backgroundColor: "#eee",
  },
  faceLabel: { marginTop: 8, fontWeight: "600" },
  matchPillWrap: { alignItems: "center", marginTop: 8 },
  matchPill: {
    backgroundColor: "#e6f0ff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cfe0ff",
  },
  matchText: { color: "#0b66ff", fontWeight: "700" },
  infoCard: {
    marginTop: 14,
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  eventId: { fontWeight: "700", marginBottom: 8 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  infoLabel: { color: "#888" },
  infoValue: { fontWeight: "600" },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  denyButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#f2a6a6",
    marginRight: 8,
    alignItems: "center",
  },
  denyText: { color: "#b00", fontWeight: "700" },
  confirmButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    backgroundColor: "#00b050",
    alignItems: "center",
  },
  confirmText: { color: "#fff", fontWeight: "700" },
  disabledButton: { opacity: 0.55 },
});
