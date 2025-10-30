import EncryptedStorage from "../utils/EncryptedStorage";
import CryptoJS from "crypto-js";
import * as SecureStore from "expo-secure-store";
import * as Random from "expo-random";
import * as ExpoCrypto from "expo-crypto";
import AuthService from "./AuthService";
import DecisionService from "./DecisionService";
import api from "./api";
import EventBus from "../utils/EventBus";
import { Alert } from "../types";

const CACHE_KEY = "QE_ALERTS_CACHE";
const SALT_KEY = "QE_AES_SALT";

async function getSecureRandomBytes(count: number): Promise<Uint8Array> {
  try {
    const ex = ExpoCrypto as unknown as {
      assertByteCount?: (n: number) => void;
    };
    ex.assertByteCount?.(count);
    if (typeof ExpoCrypto.getRandomBytesAsync === "function") {
      const b = await ExpoCrypto.getRandomBytesAsync(count);
      return b instanceof Uint8Array ? b : new Uint8Array(b);
    }
  } catch (e) {
    console.warn(e);
  }
  const bytes = await Random.getRandomBytesAsync(count);
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

async function getAesKey(): Promise<CryptoJS.lib.WordArray> {
  let salt = await SecureStore.getItemAsync(SALT_KEY);
  if (!salt) {
    const bytes = await getSecureRandomBytes(16);
    salt = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await SecureStore.setItemAsync(SALT_KEY, salt, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  }
  return CryptoJS.PBKDF2(salt, CryptoJS.enc.Hex.parse(salt), {
    keySize: 256 / 32,
    iterations: 1000,
  });
}

async function saveCache(alerts: Alert[]) {
  try {
    const raw = JSON.stringify(alerts);
    const key = await getAesKey();

    const ivBytes = await getSecureRandomBytes(16);
    const ivHex = Array.from(ivBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const cipher = CryptoJS.AES.encrypt(raw, key, {
      iv: CryptoJS.enc.Hex.parse(ivHex),
    }).toString();

    const payload = JSON.stringify({ iv: ivHex, cipher });
    await EncryptedStorage.setItem(CACHE_KEY, payload);
  } catch (e) {
    console.warn(e);
  }
}

async function loadCache(): Promise<Alert[] | null> {
  try {
    const stored = await EncryptedStorage.getItem(CACHE_KEY);
    if (!stored) return null;
    const key = await getAesKey();

    let cipherStr: string | null = null;
    let ivHex: string | null = null;

    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && parsed.cipher) {
        cipherStr = parsed.cipher;
        ivHex = parsed.iv || null;
      } else {
        cipherStr = stored;
      }
    } catch {
      cipherStr = stored;
    }

    let ivWordArray: CryptoJS.lib.WordArray;
    if (ivHex) {
      ivWordArray = CryptoJS.enc.Hex.parse(ivHex);
    } else {
      const keyHex = key.toString(CryptoJS.enc.Hex);
      const deterministicIv = CryptoJS.PBKDF2(
        keyHex + "iv",
        CryptoJS.enc.Hex.parse(keyHex),
        {
          keySize: 128 / 32,
          iterations: 1,
        }
      ).toString();
      ivWordArray = CryptoJS.enc.Hex.parse(deterministicIv);
    }

    const bytes = CryptoJS.AES.decrypt(cipherStr as string, key, {
      iv: ivWordArray,
    });
    const raw = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(raw) as Alert[];
  } catch (e) {
    console.warn("Failed to load alerts cache", e);
    return null;
  }
}

const sampleIndividuals = [
  "https://randomuser.me/api/portraits/men/32.jpg",
  "https://randomuser.me/api/portraits/women/44.jpg",
  "https://randomuser.me/api/portraits/men/65.jpg",
  "https://randomuser.me/api/portraits/women/12.jpg",
  "https://randomuser.me/api/portraits/men/5.jpg",
  "https://randomuser.me/api/portraits/women/68.jpg",
];

const sampleDetections = [
  "https://randomuser.me/api/portraits/men/33.jpg",
  "https://randomuser.me/api/portraits/women/45.jpg",
  "https://randomuser.me/api/portraits/men/66.jpg",
  "https://randomuser.me/api/portraits/women/13.jpg",
  "https://randomuser.me/api/portraits/men/6.jpg",
  "https://randomuser.me/api/portraits/women/69.jpg",
];

const mockAlert = (i: number): Alert => {
  const idx = i % sampleIndividuals.length;

  return {
    id: `QE${100 + i}`,
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
    prediction: Math.floor(60 + Math.random() * 35),
    status: "unreviewed",
    individual: {
      id: `person-${i}`,
      image_url: sampleIndividuals[idx],
    },
    store: {
      id: "store-1",
      name: "Camden Shop - Hove",
      location: "Camden Shop - Hove",
    },
    camera: { id: i, location: "Entrance 4" },
    detection_image: sampleDetections[i % sampleDetections.length],
  };
};

async function markReviewed(
  alertId: string,
  status: "confirmed" | "dismissed" | "unreviewed"
) {
  try {
    const cached = (await loadCache()) || [];
    const map = new Map(cached.map((x) => [x.id, x]));
    const existing = map.get(alertId);
    if (existing) {
      existing.status = status;
      map.set(alertId, existing);
      const arr = Array.from(map.values()).sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      await saveCache(arr);
      EventBus.emit("alert:statusChanged", { alertId, status });
      return existing;
    }
    return null;
  } catch (e) {
    console.warn("markReviewed failed", e);
    return null;
  }
}

let ws: (WebSocket & { _isOpen?: boolean }) | null = null;
let listeners: Array<(a: Alert) => void> = [];
let statusListeners: Array<
  (s: "connecting" | "connected" | "disconnected") => void
> = [];
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function makeWsUrl(base: string, token: string) {
  try {
    const url = new URL(base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws/alerts";
    url.searchParams.set("token", token);
    url.searchParams.set("type", "face-detection");
    return url.toString();
  } catch {
    return (
      base.replace(/^http/, "ws") +
      "/ws/alerts?token=" +
      token +
      "&type=face-detection"
    );
  }
}

async function ensureConnected(token: string) {
  if (ws && ws._isOpen) return;
  const base =
    (api && api.defaults && api.defaults.baseURL) || "https://api.example.com";
  const url = makeWsUrl(base, token);
  try {
    ws = new WebSocket(url);
    ws._isOpen = false;
    ws.onopen = () => {
      reconnectAttempts = 0;
      if (ws) ws._isOpen = true;
      statusListeners.forEach((cb) => cb("connected"));
    };
    ws.onmessage = async (ev: { data: unknown }) => {
      try {
        const payload = ev.data;
        const data =
          typeof payload === "string" ? JSON.parse(payload) : payload;
        if (Array.isArray(data)) {
          data.forEach((a: Alert) => listeners.forEach((cb) => cb(a)));
        } else if (data.alert) {
          const a = data.alert as Alert;
          listeners.forEach((cb) => cb(a));
          const cached = (await loadCache()) || [];
          const map = new Map(cached.map((x) => [x.id, x]));
          map.set(a.id, a);
          const arr = Array.from(map.values()).sort(
            (a: Alert, b: Alert) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          await saveCache(arr);
        } else if (data.id) {
          const a = data as Alert;
          listeners.forEach((cb) => cb(a));
          const cached = (await loadCache()) || [];
          const map = new Map(cached.map((x) => [x.id, x]));
          map.set(a.id, a);
          const arr = Array.from(map.values()).sort(
            (a: Alert, b: Alert) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          await saveCache(arr);
        }
        try {
          await DecisionService.sync();
        } catch {}
      } catch (e) {
        console.warn("WS message handling error", e);
      }
    };
    ws.onclose = async () => {
      if (ws) ws._isOpen = false;
      ws = null;
      statusListeners.forEach((cb) => cb("disconnected"));
      reconnectAttempts = Math.min(6, reconnectAttempts + 1);
      const delay =
        Math.pow(2, reconnectAttempts) * 1000 + Math.random() * 1000;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(async () => {
        const t = await AuthService.getToken();
        if (t) ensureConnected(t);
      }, delay);
    };
    ws.onerror = (e) => {
      console.warn("WS error", e);
    };
  } catch (e) {
    console.warn("Failed to connect WS", e);
  }
}

async function disconnectWs() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  reconnectAttempts = 0;
  if (ws) {
    try {
      ws.close();
    } catch (e) {
      console.warn("WS close failed", e);
    }
    ws = null;
  }
}

export default {
  async fetchFaceAlerts() {
    const token = await AuthService.getToken();
    if (!token) {
      const cached = await loadCache();
      if (cached && cached.length > 0) return cached;
      return Array.from({ length: 100 }).map((_, i) => mockAlert(i));
    }
    try {
      const res = await api.get("/api/v1/alerts/face-detection");
      const data = res?.data ?? [];
      await saveCache(data);
      return data;
    } catch (e) {
      const cached = await loadCache();
      if (cached) return cached;
      return Array.from({ length: 100 }).map((_, i) => mockAlert(i));
    }
  },

  async connectWebSocket(
    onAlert: (a: Alert) => void,
    onStatus?: (s: "connecting" | "connected" | "disconnected") => void
  ) {
    const token = await AuthService.getToken();
    if (!token) throw new Error("Not authenticated");
    listeners.push(onAlert);
    if (onStatus) statusListeners.push(onStatus);
    if (onStatus) onStatus("connecting");
    await ensureConnected(token);
    return () => {
      listeners = listeners.filter((l) => l !== onAlert);
      if (onStatus)
        statusListeners = statusListeners.filter((s) => s !== onStatus);
      if (listeners.length === 0) disconnectWs();
    };
  },
  markReviewed,
};
