import { useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  useColorScheme,
} from "react-native";
import { FaceAlert } from "../types";

type Props = {
  alert: FaceAlert;
  onPress?: () => void;
  highlighted?: boolean;
  pending?: boolean;
};

const AlertCard: React.FC<Props> = ({
  alert,
  onPress,
  highlighted,
  pending,
}: Props) => {
  const flash = useRef(new Animated.Value(0)).current;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  useEffect(() => {
    if (highlighted) {
      flash.setValue(1);
      Animated.sequence([
        Animated.timing(flash, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [highlighted]);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.container,
        highlighted ? styles.highlighted : null,
        { backgroundColor: isDark ? "#0b0b0b" : "#fff" },
      ]}
      accessibilityLabel={`Alert ${alert.id}`}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.flashOverlay, { opacity: flash }]}
      />
      <Image source={{ uri: alert?.detection_image }} style={styles.image} />

      {alert?.status ? (
        <View
          style={[
            styles.statusBadge,
            alert.status === "confirmed"
              ? styles.statusConfirmed
              : alert.status === "dismissed"
              ? styles.statusDismissed
              : styles.statusUnreviewed,
          ]}
          pointerEvents="none"
        >
          <Text
            style={[
              styles.statusBadgeText,
              { color: isDark ? "#111" : "#333" },
            ]}
          >
            {alert.status === "confirmed"
              ? "Confirmed"
              : alert.status === "dismissed"
              ? "Dismissed"
              : "Review"}
          </Text>
        </View>
      ) : null}
      {pending ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={[styles.badgeText, { color: isDark ? "#111" : "#333" }]}>
            Pending
          </Text>
        </View>
      ) : null}
      <View style={styles.meta}>
        <Text style={[styles.store, { color: isDark ? "#EEE" : "#111" }]}>
          {alert.store?.name}
        </Text>
        <Text
          style={[styles.prediction, { color: isDark ? "#ff9b9b" : "#b00" }]}
        >
          {alert?.prediction}%
        </Text>
        <Text style={[styles.time, { color: isDark ? "#AAA" : "#666" }]}>
          {new Date(alert.timestamp).toLocaleString()}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default AlertCard;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  image: { width: 90, height: 70, backgroundColor: "#ddd", borderRadius: 6 },
  meta: { flex: 1, marginLeft: 12, justifyContent: "center" },
  store: { fontWeight: "600" },
  prediction: { color: "#b00", marginTop: 4 },
  time: { color: "#666", marginTop: 6, fontSize: 12 },
  badge: {
    position: "absolute",
    left: 8,
    top: 8,
    backgroundColor: "#ffcc00",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    zIndex: 5,
  },
  badgeText: { fontSize: 12, color: "#333", fontWeight: "600" },
  highlighted: {
    backgroundColor: "#fff8e6",
    borderColor: "#ffd27a",
    borderWidth: 1,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff9e6",
    opacity: 0.0,
    zIndex: 4,
  },
  statusBadge: {
    position: "absolute",
    right: 8,
    top: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 6,
  },
  statusBadgeText: { fontSize: 12, fontWeight: "700", color: "#333" },
  statusConfirmed: {
    backgroundColor: "#e6ffef",
    borderColor: "#00b050",
    borderWidth: 1,
  },
  statusDismissed: {
    backgroundColor: "#ffeef0",
    borderColor: "#ff7070",
    borderWidth: 1,
  },
  statusUnreviewed: {
    backgroundColor: "#fff9e6",
    borderColor: "#ffd27a",
    borderWidth: 1,
  },
});
