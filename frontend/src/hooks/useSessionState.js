import { useState, useCallback, useRef } from "react";

export default function useSessionState(key, defaultValue) {
  const storageKey = `ss:${key}`;
  const isFirstRender = useRef(true);

  const [value, setValue] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved !== null ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setSessionValue = useCallback(
    (newValue) => {
      setValue((prev) => {
        const resolved = typeof newValue === "function" ? newValue(prev) : newValue;
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(resolved));
        } catch { /* ignore */ }
        return resolved;
      });
    },
    [storageKey],
  );

  const clearValue = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setValue(defaultValue);
  }, [storageKey, defaultValue]);

  if (isFirstRender.current) {
    isFirstRender.current = false;
  }

  return [value, setSessionValue, clearValue];
}
