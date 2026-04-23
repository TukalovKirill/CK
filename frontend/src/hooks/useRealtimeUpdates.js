import { useEffect, useRef } from "react";

export default function useRealtimeUpdates(entities, callback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const wsBase = import.meta.env.VITE_WS_BASE || "ws://localhost:8000";
    const ws = new WebSocket(`${wsBase}/ws/updates/?token=${token}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (entities.includes(data.entity)) {
          callbackRef.current(data);
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {};
    ws.onclose = () => {};

    return () => {
      ws.close();
    };
  }, [entities.join(",")]);
}
