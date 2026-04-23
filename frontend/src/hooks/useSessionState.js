import { useState } from "react";

export default function useSessionState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = sessionStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setSessionValue = (newValue) => {
    setValue(newValue);
    try {
      sessionStorage.setItem(key, JSON.stringify(newValue));
    } catch {
      // ignore
    }
  };

  return [value, setSessionValue];
}
