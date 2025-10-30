import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { randomUUID } from "expo-crypto";

const TOKEN_KEY = "QE_ACCESS_TOKEN";
const REFRESH_KEY = "QE_REFRESH_TOKEN";

const api = axios.create({ baseURL: "https://fake.api.com" });

export default {
  async login(username: string, password: string) {
    const { accessToken, refreshToken } = {
      accessToken: randomUUID(),
      refreshToken: randomUUID(),
    };
    if (!accessToken) throw new Error("No access token returned from server");
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    if (refreshToken) {
      await SecureStore.setItemAsync(REFRESH_KEY, refreshToken, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    }
    return accessToken;
  },

  async saveToken(token: string) {
    return SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
  async getToken() {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async getRefreshToken() {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async clearToken() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },

  async refresh() {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refresh) return null;
    try {
      const res = await api.post("/api/v1/auth/refresh", {
        refreshToken: refresh,
      });
      const { accessToken, refreshToken } = res.data || {};
      if (!accessToken) return null;
      await SecureStore.setItemAsync(TOKEN_KEY, accessToken, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      if (refreshToken) {
        await SecureStore.setItemAsync(REFRESH_KEY, refreshToken, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        });
      }
      return accessToken;
    } catch (e) {
      console.warn(e);
      return null;
    }
  },

  async logout() {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token)
        await api.post(
          "/api/v1/auth/logout",
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
    } catch {}
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};
