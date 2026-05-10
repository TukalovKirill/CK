import { useState, useEffect, useCallback } from "react";
import { useRealtimeContext } from "../context/RealtimeContext";
import { useAuth, hasPermission } from "../context/AuthContext";
import { getAMLStats } from "../api/aml";

export default function useAMLNotifications() {
  const { user } = useAuth();
  const { subscribe } = useRealtimeContext();
  const [pendingCount, setPendingCount] = useState(0);

  const canReview = hasPermission(user, "shop.review_flagged");

  const fetchStats = useCallback(async () => {
    if (!canReview) return;
    try {
      const res = await getAMLStats();
      setPendingCount(res.data.pending || 0);
    } catch {
      /* ignore */
    }
  }, [canReview]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (!canReview) return;
    return subscribe((data) => {
      if (data.entity === "aml_flagged") {
        if (data.action === "created") {
          setPendingCount((c) => c + 1);
        } else if (data.action === "updated") {
          fetchStats();
        }
      }
    });
  }, [subscribe, canReview, fetchStats]);

  return { pendingCount, canReview, refresh: fetchStats };
}
