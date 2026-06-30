import { useState, useEffect, useRef } from "react";

/**
 * Memastikan status loading bertahan setidaknya selama waktu tertentu (minDurationMs)
 * untuk menghindari flicker Skeleton saat respon API terlalu cepat.
 */
export function useMinLoading(isLoading: boolean, minDurationMs = 600) {
  const [showLoading, setShowLoading] = useState(isLoading);
  const loadingStartTime = useRef<number | null>(isLoading ? Date.now() : null);

  useEffect(() => {
    if (isLoading) {
      setShowLoading(true);
      loadingStartTime.current = Date.now();
    } else {
      if (!loadingStartTime.current) {
        setShowLoading(false);
        return;
      }

      const elapsed = Date.now() - loadingStartTime.current;
      const remaining = minDurationMs - elapsed;

      if (remaining > 0) {
        const timeout = setTimeout(() => {
          setShowLoading(false);
          loadingStartTime.current = null;
        }, remaining);
        return () => clearTimeout(timeout);
      } else {
        setShowLoading(false);
        loadingStartTime.current = null;
      }
    }
  }, [isLoading, minDurationMs]);

  return showLoading;
}
