import { create } from "zustand";
import AuthService from "../services/AuthService";

type State = {
  token: string | null;
  loading: boolean;
  setToken: (t: string | null) => void;
  restore: () => Promise<void>;
};

export const useAuthStore = create<State>(
  (set) =>
    ({
      token: null,
      loading: true,
      setToken: (t: string | null) => set({ token: t }),
      restore: async () => {
        const t = await AuthService.getToken();
        set({ token: t ?? null, loading: false });
      },
    } as State)
);

export default useAuthStore;
