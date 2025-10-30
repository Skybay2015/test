export type StoreInfo = {
  id?: string;
  name?: string;
  location?: string;
};

export type CameraInfo = {
  id?: string | number;
  location?: string;
};

export type ConcealmentPayload = {
  thumbnail?: string;
  video_url?: string;
  store?: string | StoreInfo;
  camera?: string | CameraInfo;
};

export type AlertBase = {
  id: string;
  timestamp: string;
  status?: "unreviewed" | "confirmed" | "dismissed";
  store?: StoreInfo;
  camera?: CameraInfo;
};

export type ConcealmentAlert = AlertBase & {
  type: "concealment";
  concealment: ConcealmentPayload;
};

export type FaceAlert = AlertBase & {
  type?: "face";
  individual?: { id: string; image_url?: string };
  detection_image?: string;
  prediction?: number;
};

export type Alert = ConcealmentAlert | FaceAlert;

export type Decision = {
  alertId: string;
  decision: "confirmed" | "dismissed" | "unreviewed";
  timestamp?: string;
};
