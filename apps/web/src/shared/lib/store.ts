export type StoreListener = () => void;

export interface ExternalStore<T> {
  getSnapshot: () => T;
  setState: (updater: T | ((previous: T) => T)) => void;
  subscribe: (listener: StoreListener) => () => void;
}

export function createStore<T>(initialState: T): ExternalStore<T> {
  let state = initialState;
  const listeners = new Set<StoreListener>();

  return {
    getSnapshot() {
      return state;
    },
    setState(updater) {
      const next = typeof updater === "function"
        ? (updater as (previous: T) => T)(state)
        : updater;
      if (Object.is(next, state)) return;
      state = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
