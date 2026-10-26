import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../../shared/ui/toast-provider";
import {
  deleteActivitySession,
  getActivityStats,
  recordActivityHeartbeat,
  type ActivityType,
} from "../../adapters/http/activity-api";
import {
  activityHeartbeatFor,
  hasLegacyStoredActivitySession,
  readStoredActivitySession,
  writeStoredActivitySession,
} from "./activity-session-storage";
import {
  acknowledgeActivityFinalization,
  discardDeletedActivitySession,
  enqueueActivityFinalization,
  readActivityRecovery,
  type PendingActivityFinalization,
} from "./activity-recovery";
import {
  advanceActivitySession,
  combineActivityStats,
  currentSegmentSeconds,
  currentSessionSeconds,
  localDate,
  isPastActivitySegment,
  materializeActivitySession,
  resumeActivitySession,
  activitySegmentId,
  type ActivitySessionContext,
  type ManualActivitySession,
} from "./activity-timer";

export type ActivityStart = {
  title: string;
  activityType: ActivityType;
  workspaceId?: string;
  workspaceTitleSnapshot?: string;
  taskId?: string;
  taskTitleSnapshot?: string;
};

export type ActivitySessionState = {
  workspaceId: string;
  activeContext?: ActivitySessionContext;
  currentSeconds: number;
  todaySeconds: number;
  totalSeconds: number;
  status: "idle" | "running" | "paused";
  ready: boolean;
  canStart: boolean;
  blockedByOtherTab: boolean;
  start: (context?: ActivityStart) => void;
  pause: () => void;
  resume: () => void;
  end: () => PendingActivityFinalization | null;
  adoptLegacyWorkspace: (context: ActivityStart) => void;
  deleteSession: (sessionId: string) => Promise<void>;
};

type ActivityLease = { release: () => void };

function acquireActivityLease(): Promise<ActivityLease | null> {
  if (typeof navigator === "undefined" || !("locks" in navigator)) {
    return Promise.resolve({ release: () => {} });
  }
  return new Promise((resolve) => {
    let resolved = false;
    void navigator.locks.request(
      "notespace.activity",
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock) {
          resolved = true;
          resolve(null);
          return;
        }
        let release!: () => void;
        const held = new Promise<void>((done) => { release = done; });
        resolved = true;
        resolve({ release });
        await held;
      },
    ).catch(() => {
      if (!resolved) resolve(null);
    });
  });
}

export function useActivitySession(defaultContext?: ActivityStart): ActivitySessionState {
  const { showToast } = useToast();
  const defaultContextRef = useRef(defaultContext);
  defaultContextRef.current = defaultContext;

  const [session, setSession] = useState<ManualActivitySession | null>(null);
  const sessionRef = useRef<ManualActivitySession | null>(null);
  const leaseRef = useRef<ActivityLease | null>(null);
  const acquiringLease = useRef(false);
  const mountedRef = useRef(true);
  const persistenceErrorShown = useRef(false);
  const [blockedByOtherTab, setBlockedByOtherTab] = useState(false);
  const [baseline, setBaseline] = useState({ todaySeconds: 0, totalSeconds: 0 });
  const [baselineDate, setBaselineDate] = useState(localDate());
  const [clock, setClock] = useState(Date.now());
  const [ready, setReady] = useState(false);
  const sessionStatus = session?.status ?? "idle";

  const releaseLease = useCallback(() => {
    leaseRef.current?.release();
    leaseRef.current = null;
  }, []);

  const commitSession = useCallback((next: ManualActivitySession | null) => {
    // A visible transition must never outrun its recoverable snapshot.
    if (!writeStoredActivitySession(next)) {
      if (!persistenceErrorShown.current) {
        showToast({
          kind: "error",
          message: "Activity changes could not be saved. Check browser storage, then retry.",
        });
      }
      persistenceErrorShown.current = true;
      return false;
    }
    persistenceErrorShown.current = false;
    sessionRef.current = next;
    setSession(next);
    return true;
  }, [showToast]);

  // Reserve a new per-segment revision in the recoverable snapshot before
  // sending. A failed localStorage write must not send an unrepeatable event.
  const reserveRevision = useCallback((id: string): number | null => {
    const current = sessionRef.current;
    if (!current || current.segmentId !== id) return null;
    const revision = (current.segmentRevision ?? 0) + 1;
    if (!Number.isSafeInteger(revision) || !commitSession({ ...current, segmentRevision: revision })) return null;
    return revision;
  }, [commitSession]);

  const sendSegment = useCallback((
    context: ActivitySessionContext | undefined,
    id: string,
    date: string,
    activeSeconds: number,
    finish: boolean,
  ) => {
    // Delayed timer callbacks cannot advance an already rolled-over segment.
    if (!context || isPastActivitySegment(date)) return;
    const revision = reserveRevision(id);
    if (revision === null) return;
    void recordActivityHeartbeat(id, activityHeartbeatFor(context, date, activeSeconds, finish, revision)).catch(() => {});
  }, [reserveRevision]);

  const queueFinalization = useCallback((
    context: ActivitySessionContext | undefined,
    id: string,
    date: string,
    activeSeconds: number,
    handoffTaskId?: string,
    endSession = false,
  ) => {
    if (!context) return null;
    // A rollover that could not advance storage must not allocate a new
    // revision and recovery key on each retry of the same finalization.
    const existing = readActivityRecovery().finalizations.find((item) =>
      item.sessionId === id && item.heartbeat.activeSeconds === activeSeconds
      && item.heartbeat.title === context.title
      && item.heartbeat.activityType === context.activityType
      && item.endSession === (endSession ? true : undefined)
      && item.handoffTaskId === handoffTaskId);
    if (existing) return existing;

    // Normal End and first rollover reserve the sequence in the live snapshot.
    // Extra days after a long suspension have no running segment snapshot;
    // their immutable outbox entry itself durably records revision 1.
    const revision = sessionRef.current?.segmentId === id ? reserveRevision(id) : 1;
    if (revision === null) return null;
    const finalization: PendingActivityFinalization = {
      sessionId: id,
      heartbeat: activityHeartbeatFor(context, date, activeSeconds, true, revision),
      ...(handoffTaskId ? { handoffTaskId } : {}),
      ...(endSession ? { endSession: true as const } : {}),
    };
    return enqueueActivityFinalization(finalization) ? finalization : null;
  }, [reserveRevision]);

  const finalizeSegmentBestEffort = useCallback((
    context: ActivitySessionContext | undefined,
    id: string,
    date: string,
    activeSeconds: number,
  ) => {
    const finalization = queueFinalization(context, id, date, activeSeconds);
    if (!finalization) return false;
    void recordActivityHeartbeat(finalization.sessionId, finalization.heartbeat)
      .then(() => {
        acknowledgeActivityFinalization(finalization);
      })
      .catch(() => {});
    return true;
  }, [queueFinalization]);

  const reconcile = useCallback((value: ManualActivitySession, now: number) => {
    const result = advanceActivitySession(value, now);
    if (result.completed.length > 0) {
      const queued = result.completed.every((item) =>
        finalizeSegmentBestEffort(value.context, item.id, item.date, item.activeSeconds));
      if (!queued) return value;
      if (!commitSession(result.session)) return value;
      if (result.session.status === "running") {
        sendSegment(
          result.session.context,
          result.session.segmentId,
          result.session.activityDate,
          currentSegmentSeconds(result.session, now),
          false,
        );
      }
    }
    return result.session;
  }, [commitSession, finalizeSegmentBestEffort, sendSegment]);

  const adoptStoredSession = useCallback((stored: ManualActivitySession, now: number) => {
    const result = advanceActivitySession(stored, now);
    const queued = result.completed.every((item) =>
      finalizeSegmentBestEffort(stored.context, item.id, item.date, item.activeSeconds));
    const adopted = queued ? result.session : stored;
    // A persisted session is already recoverable even when updating its
    // rollover snapshot fails; keep the old snapshot in memory for retries.
    const committed = commitSession(adopted);
    const active = committed ? adopted : stored;
    if (!committed) {
      sessionRef.current = stored;
      setSession(stored);
    }
    setBaseline({
      todaySeconds: active.baselineTodaySeconds,
      totalSeconds: active.baselineTotalSeconds,
    });
    setBaselineDate(active.activityDate);
    setClock(now);
    setBlockedByOtherTab(false);
    if (active.status === "running" && active.activityDate === localDate(new Date(now))) {
      sendSegment(
        active.context,
        active.segmentId,
        active.activityDate,
        currentSegmentSeconds(active, now),
        false,
      );
    }
  }, [commitSession, finalizeSegmentBestEffort, sendSegment]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    setReady(false);
    setBlockedByOtherTab(false);
    const now = Date.now();
    const restored = readStoredActivitySession(defaultContextRef.current);

    if (restored) {
      void acquireActivityLease().then((lease) => {
        if (cancelled || !mountedRef.current) {
          lease?.release();
          return;
        }
        if (lease) {
          leaseRef.current = lease;
          adoptStoredSession(restored, now);
          setReady(true);
          return;
        }
        setBlockedByOtherTab(true);
        void getActivityStats(localDate(new Date(now)))
          .then((stats) => {
            if (cancelled) return;
            setBaseline(stats);
            setBaselineDate(localDate(new Date(now)));
          })
          .catch(() => {})
          .finally(() => { if (!cancelled) setReady(true); });
      });
      return () => {
        cancelled = true;
        mountedRef.current = false;
        releaseLease();
      };
    }

    void getActivityStats(localDate(new Date(now)))
      .then((stats) => {
        if (cancelled) return;
        setBaseline(stats);
        setBaselineDate(localDate(new Date(now)));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setReady(true); });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      releaseLease();
    };
  }, [adoptStoredSession, releaseLease]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      const current = sessionRef.current;
      if (!current) return;
      reconcile(current, now);
    }, sessionStatus === "running" ? 1000 : 60_000);
    return () => window.clearInterval(interval);
  }, [reconcile, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "running") return;
    const heartbeat = window.setInterval(() => {
      const current = sessionRef.current;
      if (!current || current.status !== "running") return;
      const now = Date.now();
      const next = reconcile(current, now);
      sendSegment(
        next.context,
        next.segmentId,
        next.activityDate,
        currentSegmentSeconds(next, now),
        false,
      );
    }, 30_000);
    return () => {
      window.clearInterval(heartbeat);
      const current = sessionRef.current;
      if (current?.status === "running") {
        const now = Date.now();
        sendSegment(
          current.context,
          current.segmentId,
          current.activityDate,
          currentSegmentSeconds(current, now),
          false,
        );
      }
    };
  }, [reconcile, sendSegment, sessionStatus]);

  function start(contextOverride?: ActivityStart) {
    if (!ready || sessionRef.current || leaseRef.current || acquiringLease.current) return;
    const context = contextOverride ?? defaultContextRef.current;
    // Only fresh starts require ownership. Restored legacy sessions bypass start().
    if (!context?.title.trim() || !context.workspaceId?.trim()) return;

    acquiringLease.current = true;
    void acquireActivityLease().then((lease) => {
      acquiringLease.current = false;
      if (!lease || !mountedRef.current) {
        lease?.release();
        setBlockedByOtherTab(!lease);
        return;
      }
      leaseRef.current = lease;
      setBlockedByOtherTab(false);
      const now = Date.now();
      const stored = readStoredActivitySession(defaultContextRef.current);
      if (stored) {
        adoptStoredSession(stored, now);
        return;
      }
      const date = localDate(new Date(now));
      const effectiveBaseline = {
        todaySeconds: baselineDate === date ? baseline.todaySeconds : 0,
        totalSeconds: baseline.totalSeconds,
      };
      const logicalSessionId = crypto.randomUUID();
      const next: ManualActivitySession = {
        logicalSessionId,
        segmentId: activitySegmentId(logicalSessionId, date),
        activityDate: date,
        status: "running",
        sessionAccumulatedSeconds: 0,
        segmentAccumulatedSeconds: 0,
        segmentRevision: 0,
        runningSince: now,
        baselineTodaySeconds: effectiveBaseline.todaySeconds,
        baselineTotalSeconds: effectiveBaseline.totalSeconds,
        context,
      };
      // Never advertise a running session or send its first heartbeat until
      // its recovery state is durable. Storage may reject writes (quota/privacy).
      if (!writeStoredActivitySession(next)) {
        releaseLease();
        showToast({
          kind: "error",
          message: "Activity could not start because browser storage is unavailable. Check storage permissions or free space, then retry.",
        });
        return;
      }
      setBaseline(effectiveBaseline);
      setBaselineDate(date);
      setClock(now);
      sessionRef.current = next;
      setSession(next);
      sendSegment(next.context, next.segmentId, next.activityDate, 0, false);
    });
  }

  const adoptLegacyWorkspace = useCallback((context: ActivityStart) => {
    if (
      !ready
      || !context.workspaceId
      || sessionRef.current
      || leaseRef.current
      || acquiringLease.current
    ) return;
    if (!hasLegacyStoredActivitySession(context.workspaceId)) return;

    acquiringLease.current = true;
    void acquireActivityLease().then((lease) => {
      acquiringLease.current = false;
      if (!lease || !mountedRef.current) {
        lease?.release();
        setBlockedByOtherTab(!lease);
        return;
      }
      leaseRef.current = lease;
      setBlockedByOtherTab(false);

      const now = Date.now();
      const stored = readStoredActivitySession(context);
      if (!stored) {
        releaseLease();
        return;
      }
      adoptStoredSession(stored, now);
    });
  }, [adoptStoredSession, ready, releaseLease]);

  function pause() {
    const current = sessionRef.current;
    if (!current || current.status !== "running") return;
    const now = Date.now();
    const reconciled = reconcile(current, now);
    // Do not pause the previous day's segment when its rollover could not
    // be persisted; retry the rollover after storage becomes available.
    if (isPastActivitySegment(reconciled.activityDate, now)) return;
    const next = materializeActivitySession(reconciled, now);
    if (!commitSession(next)) return;
    setClock(now);
    sendSegment(next.context, next.segmentId, next.activityDate, next.segmentAccumulatedSeconds, false);
  }

  function resume() {
    const current = sessionRef.current;
    if (!current || current.status !== "paused") return;
    const now = Date.now();
    const reconciled = reconcile(current, now);
    if (isPastActivitySegment(reconciled.activityDate, now)) return;
    const next = resumeActivitySession(reconciled, now);
    if (!commitSession(next)) return;
    setClock(now);
    sendSegment(next.context, next.segmentId, next.activityDate, next.segmentAccumulatedSeconds, false);
  }

  function end() {
    const current = sessionRef.current;
    if (!current) return null;
    const now = Date.now();
    const reconciled = reconcile(current, now);
    if (isPastActivitySegment(reconciled.activityDate, now)) return null;
    const finished = reconciled.status === "running"
      ? materializeActivitySession(reconciled, now)
      : reconciled;
    const finalization = queueFinalization(
      finished.context,
      finished.segmentId,
      finished.activityDate,
      finished.segmentAccumulatedSeconds,
      finished.context?.taskId,
      true,
    );
    if (!finalization) {
      commitSession({ ...finished, segmentRevision: sessionRef.current?.segmentRevision ?? finished.segmentRevision });
      setClock(now);
      return null;
    }
    const nextBaseline = {
      todaySeconds: Math.max(0, finished.baselineTodaySeconds)
        + Math.max(0, finished.segmentAccumulatedSeconds),
      totalSeconds: Math.max(0, finished.baselineTotalSeconds)
        + Math.max(0, finished.sessionAccumulatedSeconds),
    };
    // Do not claim completion, release the lease, or double-count the
    // baseline if both storage removal and the tombstone fallback fail.
    if (!commitSession(null)) {
      setClock(now);
      return null;
    }
    setBaseline(nextBaseline);
    setBaselineDate(finished.activityDate);
    setClock(now);
    releaseLease();
    return finalization;
  }

  async function deleteSession(sessionId: string) {
    if (sessionRef.current || blockedByOtherTab) {
      throw new Error("End the active activity before deleting session history.");
    }
    await deleteActivitySession(sessionId);
    discardDeletedActivitySession(sessionId);
    const now = Date.now();
    const date = localDate(new Date(now));
    const stats = await getActivityStats(date);
    setBaseline(stats);
    setBaselineDate(date);
    setClock(now);
  }

  const date = localDate(new Date(clock));
  const currentSeconds = session ? currentSessionSeconds(session, clock) : 0;
  const todayCurrentSeconds = session && session.activityDate === date
    ? currentSegmentSeconds(session, clock)
    : 0;
  const displayBaseline = session
    ? {
        todaySeconds: session.baselineTodaySeconds,
        totalSeconds: session.baselineTotalSeconds,
      }
    : {
        todaySeconds: baselineDate === date ? baseline.todaySeconds : 0,
        totalSeconds: baseline.totalSeconds,
      };
  const totals = combineActivityStats(
    displayBaseline,
    session ? todayCurrentSeconds : 0,
    currentSeconds,
  );

  return {
    workspaceId: session?.context?.workspaceId ?? defaultContext?.workspaceId ?? "",
    activeContext: session?.context,
    currentSeconds,
    todaySeconds: totals.todaySeconds,
    totalSeconds: totals.totalSeconds,
    status: sessionStatus,
    ready,
    canStart: ready && !session,
    blockedByOtherTab,
    start,
    pause,
    resume,
    end,
    adoptLegacyWorkspace,
    deleteSession,
  };
}

