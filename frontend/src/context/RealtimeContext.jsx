import { createContext, useContext, useEffect, useRef, useCallback } from "react";

const RealtimeContext = createContext();

export function RealtimeProvider({ children }) {
  const wsRef = useRef(null);
  const subscribersRef = useRef(new Set());
  const reconnectRef = useRef(null);

  const connect = useCallback(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsBase = import.meta.env.VITE_WS_BASE || `${proto}://${window.location.host}`;
    const url = `${wsBase}/ws/updates/?token=${token}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          subscribersRef.current.forEach((cb) => cb(data));
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectRef.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch { /* ignore connection errors */ }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const subscribe = useCallback((callback) => {
    subscribersRef.current.add(callback);
    return () => subscribersRef.current.delete(callback);
  }, []);

  return (
    <RealtimeContext.Provider value={{ subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtimeContext() {
  return useContext(RealtimeContext);
}
