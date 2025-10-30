import { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { Linking } from "react-native";
import AlertCard from "../components/AlertCard";
import ConcealmentCard from "../components/ConcealmentCard";
import { sampleConcealments } from "../data/sampleConcealments";
import AlertsService from "../services/AlertsService";
import { useNavigation } from "@react-navigation/native";
import useAuthStore from "../stores/authStore";
import * as Haptics from "expo-haptics";
import DecisionService from "../services/DecisionService";
import EventBus from "../utils/EventBus";
import { Alert, Decision, FaceAlert } from "../types";
import type { NavigationProp } from "@react-navigation/native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import AuthService from "../services/AuthService";

const AlertsListScreen: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connStatus, setConnStatus] = useState<
    "connecting" | "connected" | "disconnected" | null
  >(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const nav =
    useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const listRef = useRef<FlatList<Alert> | null>(null);
  const token = useAuthStore((s) => s.token);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const setToken = useAuthStore((s) => s.setToken);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const textColor = isDark ? "#EEE" : "#111";
  const mutedColor = isDark ? "#AAA" : "#666";

  const refreshPendingIds = useCallback(async () => {
    try {
      const queued = (await DecisionService.list()) as Decision[];
      const ids = new Set<string>(queued.map((q) => q.alertId));
      setPendingIds(ids);

      // Update local alerts' status to reflect queued decisions so the list
      // shows Confirmed/Dismissed immediately after app restart even when
      // the server hasn't processed the queued decision yet. Only overwrite
      // alerts that are still 'unreviewed' to avoid clobbering server
      // authoritative statuses.
      try {
        const map = new Map<string, Decision>();
        for (const d of queued) map.set(d.alertId, d);
        setAlerts((prev) =>
          prev.map((a) => {
            if (!a) return a;
            if (a.status && a.status !== "unreviewed") return a;
            const found = map.get(a.id);
            if (!found) return a;
            return { ...a, status: found.decision } as Alert;
          })
        );
      } catch (e) {
        console.warn("Failed to apply queued decision statuses", e);
      }
    } catch (e) {
      console.warn("Failed to refresh pending ids", e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const unsubscribers: Array<() => void> = [];
    const pushUnsub = (fn?: () => void) => {
      if (fn) unsubscribers.push(fn);
    };

    const unsubDecision = EventBus.on<{ alertId: string }>(
      "decision:queued",
      (p) => {
        if (!p || !p.alertId) return;
        setPendingIds((prev) => {
          const n = new Set(prev);
          n.add(p.alertId);
          return n;
        });
        setHighlightedId(p.alertId);
        if (highlightTimeoutRef.current)
          clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(
          () => setHighlightedId(null),
          4000
        );
      }
    );
    pushUnsub(unsubDecision);

    let unsubStatus: (() => void) | null = null;
    const unsubSyncStart = EventBus.on("decision:sync:start", () =>
      setSyncing(true)
    );
    pushUnsub(unsubSyncStart);
    const unsubSyncEnd = EventBus.on("decision:sync:success", () => {
      setSyncing(false);
      void refreshPendingIds();
    });
    pushUnsub(unsubSyncEnd);
    const unsubSyncFail = EventBus.on("decision:sync:fail", () => {
      setSyncing(false);
      void refreshPendingIds();
    });
    pushUnsub(unsubSyncFail);

    const load = async () => {
      setLoading(true);
      const data = await AlertsService.fetchFaceAlerts();

      unsubStatus = EventBus.on<{ alertId: string; status: string }>(
        "alert:statusChanged",
        (p) => {
          if (!p || !p.alertId) return;
          setAlerts((prev) =>
            prev.map((a) =>
              a.id === p.alertId
                ? { ...a, status: p.status as Alert["status"] }
                : a
            )
          );
        }
      );
      pushUnsub(unsubStatus ?? undefined);

      if (!mounted) return;
      setAlerts(data);
      await refreshPendingIds();
      setLoading(false);
    };

    let websocketUnsub: (() => void) | null = null;
    if (token) {
      load();
      (async () => {
        try {
          websocketUnsub = await AlertsService.connectWebSocket(
            (a: Alert) => {
              setAlerts((prev) => {
                const map = new Map(prev.map((x) => [x.id, x]));
                map.set(a.id, a);
                return Array.from(map.values()).sort(
                  (x: Alert, y: Alert) =>
                    new Date(y.timestamp).getTime() -
                    new Date(x.timestamp).getTime()
                );
              });

              void refreshPendingIds();

              try {
                DecisionService.sync();
              } catch (e) {
                console.warn(e);
              }
            },
            (s) => setConnStatus(s)
          );
          pushUnsub(() => websocketUnsub && websocketUnsub());
        } catch (e) {
          console.warn("WS connect failed", e);
        }
      })();
    }

    return () => {
      mounted = false;

      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }

      for (const fn of unsubscribers) {
        try {
          fn && fn();
        } catch (e) {
          console.warn(e);
        }
      }
    };
  }, [token]);

  useEffect(() => {
    const handler = ({ url }: { url: string }) => {
      try {
        const match = url.match(/alert\/(.+)$/);
        if (match && match[1]) {
          const id = decodeURIComponent(match[1]);

          const idx = alerts.findIndex((a) => a.id === id);
          if (idx >= 0 && listRef.current) {
            listRef.current.scrollToIndex({ index: idx, animated: true });

            setHighlightedId(id);
            if (highlightTimeoutRef.current)
              clearTimeout(highlightTimeoutRef.current);
            highlightTimeoutRef.current = setTimeout(
              () => setHighlightedId(null),
              4000
            );
          }
        }
      } catch (e) {
        console.warn(e);
      }
    };

    const sub: { remove?: () => void } | undefined = Linking.addEventListener
      ? Linking.addEventListener("url", handler)
      : undefined;

    return () => {
      try {
        sub?.remove?.();
      } catch (e) {
        console.warn(e);
      }
    };
  }, [alerts]);

  useEffect(() => {
    let mounted = true;
    const unsub = NetInfo.addEventListener((state: NetInfoState) => {
      if (!mounted) return;
      setIsConnected(state.isConnected ?? null);
    });

    NetInfo.fetch()
      .then((s) => mounted && setIsConnected(s.isConnected ?? null))
      .catch(() => mounted && setIsConnected(false));

    return () => {
      mounted = false;
      try {
        unsub && unsub();
      } catch (e) {
        console.warn(e);
      }
    };
  }, []);

  useEffect(() => {
    try {
      nav.setOptions({
        headerRight: () => (
          <TouchableOpacity
            onPress={() => {
              (async () => {
                try {
                  await AuthService.logout();
                  try {
                    await DecisionService.clear();
                  } catch (e) {
                    console.warn("DecisionService.clear failed", e);
                  }
                } catch (e) {
                  console.warn(e);
                }

                try {
                  setToken && setToken(null);
                } catch (e) {
                  console.warn(e);
                }
              })();
            }}
            style={{ paddingHorizontal: 12 }}
          >
            <Text style={{ color: "#007AFF", fontWeight: "600" }}>Logout</Text>
          </TouchableOpacity>
        ),
      });
    } catch (e) {
      console.warn(e);
    }
  }, [nav, setToken]);

  const onRefresh = async () => {
    setRefreshing(true);
    const data = await AlertsService.fetchFaceAlerts();
    setAlerts(data);
    await refreshPendingIds();
    try {
      await DecisionService.sync();
    } catch (e) {
      console.warn(e);
    }
    setRefreshing(false);
  };

  const handlePress = (alert: Alert) => {
    try {
      nav.navigate("AlertDetail", { alert });
    } catch (e) {
      console.warn(e);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Loading alerts...</Text>
      </View>
    );
  }

  if (alerts.length === 0) {
    return (
      <View
        style={[styles.center, { backgroundColor: isDark ? "#000" : "#fff" }]}
      >
        <Text style={{ color: textColor }}>
          No alerts yet — pull to refresh.
        </Text>
        <Text style={{ marginTop: 12, color: mutedColor }}>
          Example concealments:
        </Text>
        <FlatList
          data={sampleConcealments}
          renderItem={({ item }) => (
            <ConcealmentCard
              alert={item}
              onPress={() => nav.navigate("AlertDetail", { alert: item })}
            />
          )}
          keyExtractor={(i) => i.id}
          style={{ width: "100%", marginTop: 12 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      </View>
    );
  }

  return (
    <FlatList
      ref={(r) => {
        listRef.current = r;
      }}
      data={alerts}
      contentContainerStyle={{
        paddingBottom: 20,
        backgroundColor: isDark ? "#000" : "#fff",
      }}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <AlertCard
          alert={item as FaceAlert}
          pending={pendingIds.has(item.id)}
          highlighted={highlightedId === item.id}
          onPress={async () => {
            try {
              if (Platform.OS === "ios") Haptics.selectionAsync();
              else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch (e) {
              console.warn(e);
            }

            handlePress(item);
          }}
        />
      )}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListHeaderComponent={() =>
        connStatus && connStatus === "disconnected" && isConnected === false ? (
          <View style={{ padding: 8, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  backgroundColor: "#ffe5e5",
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                  marginRight: 8,
                }}
              >
                <Text style={{ color: "#000" }}>{connStatus}</Text>
              </View>
              {syncing ? (
                <View
                  style={{
                    backgroundColor: "#e6f0ff",
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ color: "#0b66ff" }}>syncing…</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null
      }
      onScrollToIndexFailed={(info) => {
        const wait = new Promise((res) => setTimeout(res, 200));
        wait.then(() => {
          listRef.current?.scrollToIndex({
            index: Math.max(0, info.highestMeasuredFrameIndex),
            animated: true,
          });
        });
      }}
    />
  );
};

export default AlertsListScreen;
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
