import EncryptedStorage from "../utils/EncryptedStorage";
import * as SecureStore from "expo-secure-store";
import CryptoJS from "crypto-js";
import AuthService from "./AuthService";
import api from "./api";
import * as Random from "expo-random";
import EventBus from "../utils/EventBus";
import { Decision } from "../types";

async function getSecureRandomBytes(count: number): Promise<Uint8Array> {
  try {
    const mod =
      typeof require !== "undefined" ? require("expo-crypto") : undefined;
    const ExpoCrypto = mod && (mod.default ?? mod);
    if (ExpoCrypto) {
      try {
        ExpoCrypto.assertByteCount?.(count);
      } catch (e) {
        console.warn(e);
      }
      if (ExpoCrypto && typeof ExpoCrypto.getRandomBytesAsync === "function") {
        const b = await ExpoCrypto.getRandomBytesAsync(count);
        return b instanceof Uint8Array ? b : new Uint8Array(b);
      }
    }
  } catch (e) {
    console.warn(e);
  }
  const bytes = await Random.getRandomBytesAsync(count);
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

const QUEUE_KEY = "QE_DECISION_QUEUE";
const SALT_KEY = "QE_AES_SALT";

async function getKey(): Promise<CryptoJS.lib.WordArray> {
  let salt = (await SecureStore.getItemAsync(SALT_KEY)) || "";
  if (!salt) {
    const bytes = await getSecureRandomBytes(16);
    const arr = Array.from(bytes);
    salt = arr.map((b) => b.toString(16).padStart(2, "0")).join("");
    await SecureStore.setItemAsync(SALT_KEY, salt, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  }
  const derived = CryptoJS.PBKDF2(salt, CryptoJS.enc.Hex.parse(salt), {
    keySize: 256 / 32,
    iterations: 1000,
  });
  return derived;
}

export default {
  async enqueue(decision: Decision & { action?: string; at?: string }) {
    try {
      const key = await getKey();
      const raw = await EncryptedStorage.getItem(QUEUE_KEY);

      let existing = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.cipher) {
            const cipherStr = parsed.cipher;
            const ivHex = parsed.iv || null;
            let ivWord: CryptoJS.lib.WordArray;
            if (ivHex) {
              ivWord = CryptoJS.enc.Hex.parse(ivHex);
            } else {
              const keyHex = key.toString(CryptoJS.enc.Hex);
              const detIv = CryptoJS.PBKDF2(
                keyHex + "iv",
                CryptoJS.enc.Hex.parse(keyHex),
                { keySize: 128 / 32, iterations: 1 }
              ).toString();
              ivWord = CryptoJS.enc.Hex.parse(detIv);
            }
            const dec = CryptoJS.AES.decrypt(cipherStr, key, {
              iv: ivWord,
            }).toString(CryptoJS.enc.Utf8);
            existing = dec ? JSON.parse(dec) : [];
          } else {
            const keyHex = key.toString(CryptoJS.enc.Hex);
            const detIv = CryptoJS.PBKDF2(
              keyHex + "iv",
              CryptoJS.enc.Hex.parse(keyHex),
              { keySize: 128 / 32, iterations: 1 }
            ).toString();
            const dec = CryptoJS.AES.decrypt(raw, key, {
              iv: CryptoJS.enc.Hex.parse(detIv),
            }).toString(CryptoJS.enc.Utf8);
            existing = dec ? JSON.parse(dec) : [];
          }
        } catch (e) {
          console.warn(e);
          existing = [];
        }
      }

      existing.push(decision);

      const ivBytes = await getSecureRandomBytes(16);
      const ivHex = Array.from(ivBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const cipher = CryptoJS.AES.encrypt(JSON.stringify(existing), key, {
        iv: CryptoJS.enc.Hex.parse(ivHex),
      }).toString();
      const payload = JSON.stringify({ iv: ivHex, cipher });
      await EncryptedStorage.setItem(QUEUE_KEY, payload);
    } catch (e) {
      console.warn(e);
    }
  },
  async list(): Promise<Decision[]> {
    try {
      const key = await getKey();
      const raw = await EncryptedStorage.getItem(QUEUE_KEY);
      if (!raw) return [];

      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.cipher) {
          const cipherStr = parsed.cipher;
          const ivHex = parsed.iv || null;
          let ivWord: CryptoJS.lib.WordArray;
          if (ivHex) {
            ivWord = CryptoJS.enc.Hex.parse(ivHex);
          } else {
            const keyHex = key.toString(CryptoJS.enc.Hex);
            const detIv = CryptoJS.PBKDF2(
              keyHex + "iv",
              CryptoJS.enc.Hex.parse(keyHex),
              { keySize: 128 / 32, iterations: 1 }
            ).toString();
            ivWord = CryptoJS.enc.Hex.parse(detIv);
          }
          const dec = CryptoJS.AES.decrypt(cipherStr, key, {
            iv: ivWord,
          }).toString(CryptoJS.enc.Utf8);
          return dec ? (JSON.parse(dec) as Decision[]) : [];
        }
      } catch (e) {
        console.warn(e);
      }

      try {
        const keyHex = key.toString(CryptoJS.enc.Hex);
        const detIv = CryptoJS.PBKDF2(
          keyHex + "iv",
          CryptoJS.enc.Hex.parse(keyHex),
          { keySize: 128 / 32, iterations: 1 }
        ).toString();
        const dec = CryptoJS.AES.decrypt(raw, key, {
          iv: CryptoJS.enc.Hex.parse(detIv),
        }).toString(CryptoJS.enc.Utf8);
        return dec ? (JSON.parse(dec) as Decision[]) : [];
      } catch (e) {
        return [];
      }
    } catch (e) {
      console.warn(e);
      return [];
    }
  },

  _syncing: false,
  _retryTimer: null as NodeJS.Timeout | null,
  _retryAttempts: 0,
  async sync() {
    if (this._syncing) return;
    this._syncing = true;
    EventBus.emit("decision:sync:start");
    try {
      const items = await this.list();
      if (items.length === 0) {
        this._retryAttempts = 0;
        EventBus.emit("decision:sync:success", { synced: 0 });
        return;
      }

      const token = await AuthService.getToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      try {
        const res = await api.post("/api/v1/decisions", { decisions: items });
        if (res.status >= 200 && res.status < 300) {
          await EncryptedStorage.removeItem(QUEUE_KEY);
          this._retryAttempts = 0;
          if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
          }
          EventBus.emit("decision:sync:success", { synced: items.length });
          return;
        }
        throw new Error("Non-2xx response");
      } catch (e) {
        this._retryAttempts = Math.min(10, this._retryAttempts + 1);
        const attempt = this._retryAttempts;
        const base = Math.pow(2, attempt) * 1000;
        const jitter = Math.floor(Math.random() * 1000);
        const delay = Math.min(60 * 1000, base + jitter);

        if (this._retryTimer) clearTimeout(this._retryTimer);

        this._retryTimer = setTimeout(() => {
          this._syncing = false;
          this.sync();
        }, delay);
        EventBus.emit("decision:sync:fail", {
          attempt,
          delay,
          error: String(e),
        });
      }
    } catch (e) {
      this._retryAttempts = Math.min(10, this._retryAttempts + 1);
      const attempt = this._retryAttempts;
      const base = Math.pow(2, attempt) * 1000;
      const jitter = Math.floor(Math.random() * 1000);
      const delay = Math.min(60 * 1000, base + jitter);
      if (this._retryTimer) clearTimeout(this._retryTimer);
      this._retryTimer = setTimeout(() => {
        this._syncing = false;
        this.sync();
      }, delay);
      EventBus.emit("decision:sync:fail", { attempt, delay, error: String(e) });
    } finally {
      this._syncing = false;
    }
  },
  async hasPendingFor(alertId: string) {
    try {
      const items = await this.list();
      return items.some((it: Decision) => it.alertId === alertId);
    } catch (e) {
      return false;
    }
  },
  async clear() {
    try {
      if (this._retryTimer) {
        clearTimeout(this._retryTimer);
        this._retryTimer = null;
      }
      this._retryAttempts = 0;
      await EncryptedStorage.removeItem(QUEUE_KEY);
      await EncryptedStorage.removeItem(SALT_KEY);

      EventBus.emit("decision:sync:success", { synced: 0 });
    } catch (e) {
      console.warn(e);
    }
  },
};
