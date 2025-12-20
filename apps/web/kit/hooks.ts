// apps/web/kit/hooks.ts

import { useEffect, useRef, useState } from "react";
import type { DraftStateResponse, DraftStatus } from "./drafts";

/**
 * Client-side timer that counts down from the server-configured pick timer.
 * Resets when the overall pick number changes.
 */
export function useDraftClock(status: DraftStatus, state: DraftStateResponse | null) {
  const lastOverallRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  const clk = state?.timer?.pickTimerSeconds ?? null;
  const curOverall = state?.overallPickNumber ?? 0;

  const [remaining, setRemaining] = useState<number>(clk ?? 0);

  useEffect(() => {
    const next = clk ?? 0;
    const changed = lastOverallRef.current !== curOverall;
    if (status === "InProgress" && next > 0) {
      if (changed) {
        setRemaining(next);
        lastOverallRef.current = curOverall;
      }
      const t = setInterval(() => setTick((x) => x + 1), 1000);
      return () => clearInterval(t);
    }

    // not in-progress or no timer configured: keep it at configured seconds
    setRemaining(next);
    lastOverallRef.current = curOverall;
    return;
  }, [curOverall, clk, status]);

  useEffect(() => {
    if (status !== "InProgress") return;
    if (!clk || clk <= 0) return;
    setRemaining((s) => Math.max(0, s - 1));
  }, [tick, status, clk]);

  return remaining;
}

export function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpointPx - 1}px)`);
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [breakpointPx]);
  return isMobile;
}
