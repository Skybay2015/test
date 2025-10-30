type Callback<T = unknown> = (payload?: T) => void;
const listeners: Record<string, Callback[]> = {};
export default {
  on<T = unknown>(event: string, cb: Callback<T>) {
    listeners[event] = listeners[event] || [];
    listeners[event].push(cb as Callback);
    return () => {
      listeners[event] = listeners[event].filter((c) => c !== cb);
    };
  },
  emit<T = unknown>(event: string, payload?: T) {
    (listeners[event] || []).slice().forEach((cb) => cb(payload));
  },
};
