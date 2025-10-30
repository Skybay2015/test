import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const isSecureAvailable =
  typeof SecureStore !== "undefined" &&
  typeof SecureStore.getItemAsync === "function";

const wrapper = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (isSecureAvailable) {
        const v = await SecureStore.getItemAsync(key);
        return v ?? null;
      }
      return await AsyncStorage.getItem(key);
    } catch (e) {
      console.warn("EncryptedStorage.getItem failed", e);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (isSecureAvailable) {
        await SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED,
        });
        return;
      }
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.warn("EncryptedStorage.setItem failed", e);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (isSecureAvailable) {
        await SecureStore.deleteItemAsync(key);
        return;
      }
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.warn("EncryptedStorage.removeItem failed", e);
    }
  },

  isEncryptedBackend: isSecureAvailable,
  _backend: isSecureAvailable ? "expo-secure-store" : "async-storage",
};

export default wrapper;
