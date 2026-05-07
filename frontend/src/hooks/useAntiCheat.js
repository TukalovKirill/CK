import { useEffect, useRef, useState, useCallback } from "react";
import { logViolation, logViolationBeacon } from "../api/quizzes";

export default function useAntiCheat({ attemptId, enabled = true, onAction }) {
  const [violationCount, setViolationCount] = useState(0);
  const [isTerminated, setIsTerminated] = useState(false);
  const hiddenAtRef = useRef(null);
  const attemptIdRef = useRef(attemptId);
  const onActionRef = useRef(onAction);

  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  const handleResponse = useCallback((result) => {
    if (!result) return;
    setViolationCount(result.violation_count || 0);

    if (result.action === "terminate") {
      setIsTerminated(true);
    }

    if (result.action && result.action !== "none") {
      onActionRef.current?.(result);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !attemptId) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        logViolationBeacon(attemptIdRef.current, {
          event_type: "tab_hidden",
          occurred_at: new Date().toISOString(),
          duration_ms: 0,
        });
      } else if (document.visibilityState === "visible" && hiddenAtRef.current) {
        const duration = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;

        onActionRef.current?.({
          action: "warn",
          message: "Зафиксирован выход из окна теста. Не переключайтесь во время прохождения.",
        });

        logViolation(attemptIdRef.current, {
          event_type: "tab_visible_return",
          occurred_at: new Date().toISOString(),
          duration_ms: duration,
        })
          .then((res) => handleResponse(res.data))
          .catch(() => {});
      }
    };

    const onBlur = () => {
      logViolationBeacon(attemptIdRef.current, {
        event_type: "window_blur",
        occurred_at: new Date().toISOString(),
        duration_ms: 0,
      });
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        logViolation(attemptIdRef.current, {
          event_type: "fullscreen_exit",
          occurred_at: new Date().toISOString(),
          duration_ms: 0,
        })
          .then((res) => handleResponse(res.data))
          .catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [enabled, attemptId, handleResponse]);

  return { violationCount, isTerminated };
}
