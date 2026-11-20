"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { TOUR_STEPS } from "@/components/tour/steps";
import { TourOverlay } from "@/components/tour/tour-overlay";
import { WelcomeGuide } from "@/components/layout/welcome-guide";
import { useSystem, useUpdateSystemSettings } from "@/hooks/use-system";
import { LOCAL_MODE } from "@/lib/config";

interface TourContextValue {
  /** Start the guided tour from the first step (used by the Help link). */
  start: () => void;
  running: boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

/**
 * Owns the first-run guidance (v1.5.0): the guided spotlight tour, its state,
 * and whether it has been seen (server-side, `guide_seen`). Mounted in the
 * dashboard layout, so it survives navigation between pages while a step walks
 * from the dashboard to Settings.
 *
 * The plain dialog guide is the fallback: if the tour hits an error it can't
 * recover from, the provider shows the dialog instead, so the guidance always
 * works.
 */
export function TourProvider({ children }: { children: React.ReactNode }) {
  const { data } = useSystem();
  const update = useUpdateSystemSettings();
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const decided = useRef(false);

  const markSeen = useCallback(() => {
    if (LOCAL_MODE && data && !data.guide_seen) update.mutate({ guide_seen: true });
  }, [data, update]);

  const start = useCallback(() => {
    setIndex(0);
    setFailed(false);
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    setRunning(false);
    // Record, once, that the guidance has been seen. Reopening from Help below
    // starts it again without coming back through a fresh install.
    markSeen();
  }, [markSeen]);

  // Open by itself the first time a fresh install is opened, in local mode:
  // in accounts mode the dismissal is refused, so it would reappear each load.
  useEffect(() => {
    if (decided.current || !data) return;
    decided.current = true;
    if (LOCAL_MODE && !data.guide_seen) start();
  }, [data, start]);

  return (
    <TourContext.Provider value={{ start, running }}>
      {children}
      {running && !failed && (
        <TourOverlay
          index={index}
          total={TOUR_STEPS.length}
          onNext={() => setIndex((i) => Math.min(TOUR_STEPS.length - 1, i + 1))}
          onBack={() => setIndex((i) => Math.max(0, i - 1))}
          onClose={stop}
          onError={() => setFailed(true)}
        />
      )}
      {/* Fallback: the plain dialog guide, shown only if the tour errors out. */}
      <WelcomeGuide open={running && failed} onClose={stop} />
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const context = useContext(TourContext);
  if (!context) throw new Error("useTour must be used inside <TourProvider>");
  return context;
}
