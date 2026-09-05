import { useEffect, useRef, useState } from "react";
import { getWorkspaceStudy, recordStudyHeartbeat } from "../../domain/project/api";
import { combineStudyStats, IDLE_AFTER_MS, localDate, rollStudyBaseline } from "./study-timer";

export type StudySessionState = {
  currentSeconds: number;
  todaySeconds: number;
  totalSeconds: number;
  tracking: boolean;
  pausedReason: "idle" | "hidden" | "manual" | null;
  pause: () => void;
  resume: () => void;
};

export function useStudySession(workspaceId: string, workspaceTitle: string): StudySessionState {
  const titleRef = useRef(workspaceTitle);
  const sessionId = useRef(crypto.randomUUID());
  const activityDate = useRef(localDate());
  const activeSeconds = useRef(0);
  const lastActivity = useRef(Date.now());
  const manualPaused = useRef(false);
  const mounted = useRef(true);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [baselineStats, setBaselineStats] = useState({ todaySeconds: 0, totalSeconds: 0 });
  const [tracking, setTracking] = useState(true);
  const [pausedReason, setPausedReason] = useState<StudySessionState["pausedReason"]>(null);

  titleRef.current = workspaceTitle;

  useEffect(() => {
    mounted.current = true;
    const id = sessionId.current;
    const date = activityDate.current;
    let stopped = false;

    const send = (finish = false, sentId = sessionId.current, sentDate = activityDate.current, seconds = activeSeconds.current) => {
      void recordStudyHeartbeat(workspaceId, sentId, { activityDate: sentDate, activeSeconds: seconds, finish }).catch(() => {});
    };

    // Read the durable baseline before creating this session so the UI can add
    // currentSeconds without double-counting the active session.
    void getWorkspaceStudy(workspaceId, date)
      .then((stats) => { if (!stopped && mounted.current) setBaselineStats(stats); })
      .catch(() => {})
      .finally(() => { if (!stopped) send(false, id, date, 0); });

    const markActivity = () => {
      if (manualPaused.current || document.visibilityState === "hidden") return;
      lastActivity.current = Date.now();
      setTracking(true);
      setPausedReason(null);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        setTracking(false);
        setPausedReason("hidden");
      } else if (!manualPaused.current) {
        markActivity();
      }
    };
    const activityEvents = ["keydown", "pointerdown", "pointermove", "input", "focus"];
    activityEvents.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);

    const tick = window.setInterval(() => {
      if (stopped) return;
      const nextDate = localDate();
      if (nextDate !== activityDate.current) {
        const oldId = sessionId.current;
        const oldDate = activityDate.current;
        const completedSeconds = activeSeconds.current;
        send(true, oldId, oldDate, completedSeconds);
        setBaselineStats((value) => rollStudyBaseline(value, completedSeconds));
        sessionId.current = crypto.randomUUID();
        activityDate.current = nextDate;
        activeSeconds.current = 0;
        setCurrentSeconds(0);
        send(false, sessionId.current, nextDate, 0);
        return;
      }
      if (document.visibilityState === "hidden") return;
      if (manualPaused.current) return;
      if (Date.now() - lastActivity.current > IDLE_AFTER_MS) {
        setTracking(false);
        setPausedReason("idle");
        return;
      }
      activeSeconds.current += 1;
      setCurrentSeconds(activeSeconds.current);
    }, 1000);
    const heartbeat = window.setInterval(() => send(false), 30_000);

    return () => {
      stopped = true;
      mounted.current = false;
      window.clearInterval(tick);
      window.clearInterval(heartbeat);
      activityEvents.forEach((event) => window.removeEventListener(event, markActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      send(true);
    };
  }, [workspaceId]);

  function pause() {
    manualPaused.current = true;
    setTracking(false);
    setPausedReason("manual");
  }

  function resume() {
    manualPaused.current = false;
    lastActivity.current = Date.now();
    setTracking(true);
    setPausedReason(null);
  }

  const totals = combineStudyStats(baselineStats, currentSeconds);
  return {
    currentSeconds,
    todaySeconds: totals.todaySeconds,
    totalSeconds: totals.totalSeconds,
    tracking,
    pausedReason,
    pause,
    resume,
  };
}
