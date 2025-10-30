import { ConcealmentAlert } from "../types";

export const sampleConcealments: ConcealmentAlert[] = [
  {
    id: "sample-concealment-1",
    timestamp: new Date().toISOString(),
    type: "concealment",
    store: { id: "demo-store", name: "Demo Store", location: "1st floor" },
    camera: { id: "cam-1", location: "Entrance" },
    concealment: {
      thumbnail: "https://placekitten.com/200/140",
      video_url: "https://www.w3schools.com/html/mov_bbb.mp4",
      store: "Demo Store",
      camera: "cam-1",
    },
  },
  {
    id: "sample-concealment-2",
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    type: "concealment",
    store: { id: "demo-store-2", name: "Corner Shop" },
    camera: { id: "cam-2", location: "Aisle 3" },
    concealment: {
      thumbnail: "https://placekitten.com/201/140",
      video_url: "https://www.w3schools.com/html/mov_bbb.mp4",
      store: "Corner Shop",
      camera: "cam-2",
    },
  },
];

export default sampleConcealments;
