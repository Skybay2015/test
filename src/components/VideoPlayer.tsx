import { useEffect, useRef, useState } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Text,
  useColorScheme,
} from "react-native";
import { Video } from "expo-av";
import type { AVPlaybackStatus, Video as AVVideoType } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";

async function cacheVideo(url: string): Promise<string> {
  try {
    const name = encodeURIComponent(url).slice(0, 120);
    const cacheDir =
      FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
    const path = `${cacheDir}${name}.mp4`;
    const TTL_MS = 7 * 24 * 60 * 60 * 1000;

    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists && info.modificationTime) {
        const age = Date.now() - info.modificationTime * 1000;
        if (age < TTL_MS) return path;
        try {
          await FileSystem.deleteAsync(path, { idempotent: true });
        } catch (e) {
          console.warn(e);
        }
      }
    } catch (e) {
      console.warn(e);
    }

    try {
      if (typeof FileSystem.createDownloadResumable === "function") {
        const resumable = FileSystem.createDownloadResumable(url, path);
        const r = await resumable.downloadAsync();
        return r?.uri ?? url;
      }
    } catch (e) {
      console.warn(e);
    }

    try {
      const dl = await FileSystem.downloadAsync(url, path);
      return dl?.uri ?? url;
    } catch (e) {
      console.warn(e);
      return url;
    }
  } catch (e) {
    console.warn(e);
    return url;
  }
}

type VideoPlayerProps = { source: string; poster?: string };

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  source,
  poster,
}: VideoPlayerProps) => {
  const ref = useRef<Video | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const cached = await cacheVideo(source);
        if (mounted) setUri(cached);
      } catch (e) {
        console.warn("cacheVideo failed", e);
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [source]);

  const isDark = useColorScheme() === "dark";

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!ref.current) return;
        if (isPlaying) await ref.current.playAsync();
        else await ref.current.pauseAsync();
      } catch (e) {
        if (mounted) console.warn(e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isPlaying]);

  if (loading)
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: isDark ? "#000" : "#000" },
        ]}
      >
        <ActivityIndicator color={isDark ? "#fff" : "#fff"} />
      </View>
    );

  const onTap = async () => {
    try {
      setIsPlaying((p) => !p);
    } catch (e) {
      console.warn(e);
    }
  };

  const toggleMute = async () => {
    try {
      setIsMuted((m) => {
        const next = !m;
        if (ref.current) {
          ref.current
            .setIsMutedAsync(next)
            .catch((e: unknown) => console.warn(e));
        }
        return next;
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const onPlaybackStatus = (status: AVPlaybackStatus) => {
    if (!status) return;

    if ("isLoaded" in status && status.isLoaded) {
      const loaded: any = status;
      const pos = loaded.positionMillis ?? loaded.position ?? 0;
      const dur = loaded.durationMillis ?? loaded.duration ?? null;
      setPosition(pos ?? 0);
      setDuration(dur ?? null);
      return;
    }

    if ("error" in status) {
      setError(String((status as any).error));
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onTap}
      activeOpacity={0.9}
    >
      {uri ? (
        <View style={styles.container}>
          <Video
            ref={(r: AVVideoType | null) => {
              ref.current = r;
            }}
            source={{ uri }}
            style={styles.video}
            useNativeControls
            isLooping={false}
            shouldPlay={false}
            posterSource={poster ? { uri: poster } : undefined}
            onPlaybackStatusUpdate={onPlaybackStatus}
            isMuted={isMuted}
          />

          <View style={styles.overlay} pointerEvents="box-none">
            <TouchableOpacity style={styles.muteBtn} onPress={toggleMute}>
              <Text style={styles.muteText}>{isMuted ? "Unmute" : "Mute"}</Text>
            </TouchableOpacity>
            {error ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>Playback error</Text>
              </View>
            ) : null}
            <View style={styles.progressWrap} pointerEvents="none">
              <View
                style={[
                  styles.progressBar,
                  duration
                    ? {
                        width: `${Math.min(
                          100,
                          (position / (duration || 1)) * 100
                        )}%`,
                      }
                    : { width: "0%" },
                ]}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.container} />
      )}
    </TouchableOpacity>
  );
};

export default VideoPlayer;

const styles = StyleSheet.create({
  container: {
    height: 180,
    backgroundColor: "#000",
    borderRadius: 8,
    overflow: "hidden",
  },
  video: { width: "100%", height: "100%" },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "space-between",
    padding: 8,
  },
  muteBtn: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  muteText: { color: "#fff", fontWeight: "700" },
  progressWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#0b66ff",
  },
  errorWrap: {
    position: "absolute",
    left: 8,
    top: 8,
    backgroundColor: "rgba(255,0,0,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  errorText: { color: "#fff", fontWeight: "700" },
});
