import axios from "axios";
import * as SecureStore from "expo-secure-store";
import AuthService from "./AuthService";

const api = axios.create({ baseURL: "https://api.example.com" });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("QE_ACCESS_TOKEN");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response && error.response.status === 401 && !original._retry) {
      original._retry = true;
      const newToken = await AuthService.refresh();
      if (newToken) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
