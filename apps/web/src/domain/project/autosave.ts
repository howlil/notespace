export type SaveStatus = {
  state: "saved" | "pending" | "saving" | "error";
  message?: string;
};

/** One in-flight write per project; edits during a write are coalesced into the next snapshot. */
export class Autosave<T> {
  private pending: T | undefined;
  private active: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private version: number;
  private status: SaveStatus = { state: "saved" };
  private listeners = new Set<(status: SaveStatus) => void>();
  private persist: (value: T, version: number) => Promise<{ version: number }>;
  private delay: number;

  constructor(
    version: number,
    persist: (value: T, version: number) => Promise<{ version: number }>,
    delay = 650,
  ) {
    this.version = version;
    this.persist = persist;
    this.delay = delay;
  }
  get dirty() {
    return this.pending !== undefined || this.active !== undefined;
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
  schedule(value: T) {
    this.pending = value;
    this.emit({ state: "pending" });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, this.delay);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.active) return this.active;
    if (this.pending === undefined) return Promise.resolve();
    this.active = this.drain().finally(() => {
      this.active = undefined;
    });
    return this.active;
  }
  private async drain() {
    while (this.pending !== undefined) {
      const snapshot = this.pending;
      this.pending = undefined;
      this.emit({ state: "saving" });
      try {
        const saved = await this.persist(snapshot, this.version);
        this.version = saved.version;
      } catch (error) {
        if (this.pending === undefined) this.pending = snapshot;
        this.emit({
          state: "error",
          message:
            error instanceof Error
              ? error.message
              : "Save failed. Please retry.",
        });
        throw error;
      }
    }
    this.emit({ state: "saved" });
  }
}
