import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  useColorScheme,
} from "react-native";
import VideoPlayer from "./VideoPlayer";
import { Alert, ConcealmentAlert } from "../types";

type Props = {
  alert?: Alert;
  event?: Alert;
  onPress?: () => void;
  highlighted?: boolean;
};

const ConcealmentCard: React.FC<Props> = (props: Props) => {
  const event = (props.alert ?? props.event ?? {}) as
    | ConcealmentAlert
    | undefined;
  const onPress = props.onPress;

  const thumbnail = event?.concealment?.thumbnail ?? null;
  const title =
    typeof event?.concealment?.store === "string"
      ? (event?.concealment?.store as string)
      : event?.store?.name ?? "Concealment event";
  const timestamp = event?.timestamp ? new Date(event.timestamp) : null;
  const videoUrl = event?.concealment?.video_url ?? null;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: useColorScheme() === "dark" ? "#0b0b0b" : "#fff" },
      ]}
    >
      <View style={styles.left}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.thumb} />
        ) : (
          <View
            style={[
              styles.thumb,
              { alignItems: "center", justifyContent: "center" },
            ]}
          >
            <Text style={{ color: "#fff" }}>No image</Text>
          </View>
        )}
      </View>
      <View style={styles.right}>
        <Text
          style={[
            styles.title,
            { color: useColorScheme() === "dark" ? "#EEE" : "#111" },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.meta,
            { color: useColorScheme() === "dark" ? "#AAA" : "#666" },
          ]}
        >
          {" "}
          {timestamp ? timestamp.toLocaleString() : ""}
        </Text>
        {videoUrl ? <VideoPlayer source={videoUrl} /> : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  left: { width: 110 },
  right: { flex: 1, marginLeft: 12 },
  thumb: { width: 100, height: 70, borderRadius: 6, backgroundColor: "#222" },
  title: { fontWeight: "600" },
  meta: { color: "#666", marginTop: 6 },
});

export default ConcealmentCard;
