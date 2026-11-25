import { useRef, useSyncExternalStore } from "react";
import type { ExternalStore } from "./store";

export function useStore<T>(store: ExternalStore<T>): T;
export function useStore<T, S>(
  store: ExternalStore<T>,
  selector: (state: T) => S,
  isEqual?: (previous: S, next: S) => boolean,
): S;
export function useStore<T, S = T>(
  store: ExternalStore<T>,
  selector?: (state: T) => S,
  isEqual: (previous: S, next: S) => boolean = Object.is,
): S {
  const cacheRef = useRef<{ hasValue: boolean; state: T; selected: S }>({
    hasValue: false,
    state: undefined as T,
    selected: undefined as S,
  });

  const getSelectedSnapshot = () => {
    const state = store.getSnapshot();
    if (!selector) return state as unknown as S;
    const cache = cacheRef.current;
    if (cache.hasValue && Object.is(cache.state, state)) {
      return cache.selected;
    }
    const nextSelected = selector(state);
    if (cache.hasValue && isEqual(cache.selected, nextSelected)) {
      cache.state = state;
      return cache.selected;
    }
    cache.hasValue = true;
    cache.state = state;
    cache.selected = nextSelected;
    return nextSelected;
  };

  return useSyncExternalStore(store.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}
