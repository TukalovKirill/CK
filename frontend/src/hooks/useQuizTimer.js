import { useState, useEffect, useRef, useCallback } from "react";

export default function useQuizTimer({ serverNow, questionTimerSec, onExpire, questionKey }) {
  const [timeLeftMs, setTimeLeftMs] = useState(questionTimerSec * 1000);
  const clockOffsetRef = useRef(0);
  const questionStartRef = useRef(Date.now());
  const expiredRef = useRef(false);
  const rafRef = useRef(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (serverNow) {
      clockOffsetRef.current = Date.now() - new Date(serverNow).getTime();
    }
  }, [serverNow]);

  const reset = useCallback((newTimerSec, newServerNow) => {
    expiredRef.current = false;
    questionStartRef.current = Date.now();
    if (newServerNow) {
      clockOffsetRef.current = Date.now() - new Date(newServerNow).getTime();
    }
    setTimeLeftMs((newTimerSec || questionTimerSec) * 1000);
  }, [questionTimerSec]);

  useEffect(() => {
    questionStartRef.current = Date.now();
    expiredRef.current = false;
    setTimeLeftMs(questionTimerSec * 1000);

    const tick = () => {
      const elapsed = Date.now() - questionStartRef.current;
      const remaining = (questionTimerSec * 1000) - elapsed;

      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        setTimeLeftMs(0);
        onExpireRef.current?.();
        return;
      }

      if (remaining > 0) {
        setTimeLeftMs(remaining);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [questionTimerSec, questionKey]);

  const seconds = Math.max(0, Math.ceil(timeLeftMs / 1000));
  const progress = questionTimerSec > 0 ? timeLeftMs / (questionTimerSec * 1000) : 0;

  return { timeLeftMs, seconds, progress, isExpired: expiredRef.current, reset };
}
