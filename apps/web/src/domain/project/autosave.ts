export type SaveStatus = {
  state: "saved" | "pending" | "saving" | "error" | "conflict";
  message?: string;
};

// Domain-specific save errors can opt into blocking automatic retries without
// making the generic autosave queue know about a particular workspace error.
export class BlockingAutosaveError extends Error {}

/**
 * One in-flight write per workspace. Quiet edits debounce normally, while
 * continuous edits are checkpointed at maxWait so drag-heavy canvas work
 * cannot starve persistence indefinitely. Pending edits always coalesce to the
 * newest snapshot.
 */
export class Autosave<T> {
  private pending: T | undefined;
  private active: Promise<void> | undefined;
  private activeMode: "checkpoint" | "flush" | undefined;
  private quietTimer: ReturnType<typeof setTimeout> | undefined;
  private maxTimer: ReturnType<typeof setTimeout> | undefined;
  private checkpointAfterActive = false;
  private version: number;
  private status: SaveStatus = { state: "saved" };
  private listeners = new Set<(status: SaveStatus) => void>();
  private persist: (value: T, version: number) => Promise<{ version: number }>;
  private delay: number;
  private maxWait: number;
  private blockedByConflict = false;
  private conflictError: Error | undefined;

  constructor(
    version: number,
    persist: (value: T, version: number) => Promise<{ version: number }>,
    delay = 300,
    maxWait = 1_000,
  ) {
    this.version = version;
    this.persist = persist;
    this.delay = delay;
    this.maxWait = Math.max(delay, maxWait);
  }

  get dirty() {
    return this.pending !== undefined || this.active !== undefined || this.blockedByConflict;
  }

  subscribe(listener: (status: SaveStatus) => void) {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(status: SaveStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }

  private clearTimers() {
    clearTimeout(this.quietTimer);
    clearTimeout(this.maxTimer);
    this.quietTimer = undefined;
    this.maxTimer = undefined;
  }

  private scheduleTimers() {
    clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      this.quietTimer = undefined;
      void this.checkpoint().catch(() => {});
    }, this.delay);

    if (!this.maxTimer) {
      this.maxTimer = setTimeout(() => {
        this.maxTimer = undefined;
        void this.checkpoint().catch(() => {});
      }, this.maxWait);
    }
  }

  schedule(value: T) {
    this.pending = value;
    if (this.blockedByConflict) {
      this.emit({ state: "conflict", message: this.conflictError?.message });
      return;
    }
    this.emit({ state: "pending" });
    this.scheduleTimers();
  }

  replacePending(value: T) {
    if (this.pending !== undefined) this.pending = value;
  }

  private async persistSnapshot(snapshot: T) {
    this.emit({ state: "saving" });
    try {
      const saved = await this.persist(snapshot, this.version);
      this.version = saved.version;
    } catch (error) {
      if (this.pending === undefined) this.pending = snapshot;
      const normalized = error instanceof Error ? error : new Error("Save failed. Please retry.");
      if (normalized instanceof BlockingAutosaveError) {
        this.blockedByConflict = true;
        this.conflictError = normalized;
        this.emit({ state: "conflict", message: normalized.message });
      } else {
        this.emit({ state: "error", message: normalized.message });
      }
      throw normalized;
    }
  }

  private checkpoint(): Promise<void> {
    this.clearTimers();
    if (this.blockedByConflict) return Promise.reject(this.conflictError ?? new Error("Workspace conflict"));
    if (this.active) {
      if (this.activeMode === "checkpoint") this.checkpointAfterActive = true;
      return this.active;
    }
    if (this.pending === undefined) return Promise.resolve();

    const snapshot = this.pending;
    this.pending = undefined;
    this.activeMode = "checkpoint";
    let succeeded = false;
    const run = this.persistSnapshot(snapshot).then(() => {
      succeeded = true;
    });
    this.active = run.finally(() => {
      this.active = undefined;
      this.activeMode = undefined;
      if (!succeeded || this.blockedByConflict) {
        this.checkpointAfterActive = false;
        return;
      }
      if (this.pending === undefined) {
        this.checkpointAfterActive = false;
        this.emit({ state: "saved" });
        return;
      }
      if (this.checkpointAfterActive) {
        this.checkpointAfterActive = false;
        void this.checkpoint().catch(() => {});
        return;
      }
      this.emit({ state: "pending" });
      this.scheduleTimers();
    });
    return this.active;
  }

  flush(): Promise<void> {
    this.clearTimers();
    if (this.blockedByConflict) return Promise.reject(this.conflictError ?? new Error("Workspace conflict"));
    if (this.active) {
      if (this.activeMode === "flush") return this.active;
      return this.active.then(() => this.flush());
    }
    if (this.pending === undefined) return Promise.resolve();

    this.checkpointAfterActive = false;
    this.activeMode = "flush";
    this.active = this.drain().finally(() => {
      this.active = undefined;
      this.activeMode = undefined;
    });
    return this.active;
  }

  private async drain() {
    while (this.pending !== undefined) {
      const snapshot = this.pending;
      this.pending = undefined;
      await this.persistSnapshot(snapshot);
    }
    this.clearTimers();
    this.emit({ state: "saved" });
  }
}
