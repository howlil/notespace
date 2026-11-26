import { createStore } from "../../shared/lib/store.ts";

export const BROWSER_NAV_STORAGE_KEY = "notespace-browser-nav-v1";
export const MAX_TAB_HISTORY = 50;
export const MAX_CLOSED_TABS = 30;
export const MAX_RECENT_VISITS = 100;

export type NavDestination =
  | { kind: "home" }
  | { kind: "map" }
  | { kind: "cards" }
  | { kind: "card"; noteId: string }
  | { kind: "workspace"; workspaceId: string };

export type NavHistoryEntry = {
  destination: NavDestination;
  title: string;
  visitedAt: number;
};

export type BrowserTab = {
  id: string;
  groupId: string | null;
  pinned: boolean;
  folderId: string | null;
  pinAnchor?: NavDestination;
  title: string;
  history: NavHistoryEntry[];
  cursor: number;
};

export type TabGroup = {
  id: string;
  name: string;
  tabIds: string[];
  lastActiveTabId: string | null;
};

export type PinnedFolder = {
  id: string;
  name: string;
  collapsed: boolean;
  tabIds: string[];
};

export type ClosedTabRecord = {
  tab: BrowserTab;
  closedAt: number;
};

export type VisitRecord = {
  destination: NavDestination;
  title: string;
  visitedAt: number;
};

export interface BrowserNavState {
  tabs: BrowserTab[];
  groups: TabGroup[];
  activeGroupId: string;
  activeTabId: string | null;
  pinnedFolders: PinnedFolder[];
  closedTabs: ClosedTabRecord[];
  recentVisits: VisitRecord[];
  storageWarning: string | null;
}

type PersistedBrowserNavPayload = {
  version: 1;
  tabs: BrowserTab[];
  groups: TabGroup[];
  activeGroupId: string;
  activeTabId: string | null;
  pinnedFolders: PinnedFolder[];
  closedTabs: ClosedTabRecord[];
  recentVisits: VisitRecord[];
};

const DEFAULT_GROUP_ID = "default";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function destinationKey(dest: NavDestination): string {
  if (dest.kind === "workspace") {
    return `workspace:${dest.workspaceId}`;
  }
  if (dest.kind === "card") {
    return `card:${dest.noteId}`;
  }
  return dest.kind;
}

export function canGoBack(tab: BrowserTab | null | undefined): boolean {
  return Boolean(tab && tab.cursor > 0 && tab.history.length > 0);
}

export function canGoForward(tab: BrowserTab | null | undefined): boolean {
  return Boolean(tab && tab.cursor >= 0 && tab.cursor < tab.history.length - 1);
}

export function getTabCurrentDestination(tab: BrowserTab | null | undefined): NavDestination | null {
  if (!tab || tab.cursor < 0 || tab.cursor >= tab.history.length) return null;
  return tab.history[tab.cursor]?.destination ?? null;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function createDefaultState(storageWarning: string | null = null): BrowserNavState {
  return {
    tabs: [],
    groups: [{ id: DEFAULT_GROUP_ID, name: "Default", tabIds: [], lastActiveTabId: null }],
    activeGroupId: DEFAULT_GROUP_ID,
    activeTabId: null,
    pinnedFolders: [],
    closedTabs: [],
    recentVisits: [],
    storageWarning,
  };
}

function isValidDestination(value: unknown): value is NavDestination {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "home" || candidate.kind === "map" || candidate.kind === "cards") return true;
  if (candidate.kind === "card" && typeof candidate.noteId === "string" && candidate.noteId.length > 0) {
    return true;
  }
  if (candidate.kind === "workspace" && typeof candidate.workspaceId === "string" && candidate.workspaceId.length > 0) {
    return true;
  }
  return false;
}

function isValidHistoryEntry(value: unknown): value is NavHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    isValidDestination(candidate.destination) &&
    typeof candidate.title === "string" &&
    typeof candidate.visitedAt === "number" &&
    Number.isFinite(candidate.visitedAt)
  );
}

function isValidTab(value: unknown): value is BrowserTab {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    !candidate.id ||
    (candidate.groupId !== null && typeof candidate.groupId !== "string") ||
    typeof candidate.pinned !== "boolean" ||
    (candidate.folderId !== null && typeof candidate.folderId !== "string") ||
    typeof candidate.title !== "string" ||
    !Array.isArray(candidate.history) ||
    candidate.history.length === 0 ||
    !candidate.history.every(isValidHistoryEntry) ||
    typeof candidate.cursor !== "number" ||
    !Number.isInteger(candidate.cursor) ||
    candidate.cursor < 0 ||
    candidate.cursor >= candidate.history.length
  ) {
    return false;
  }
  if (candidate.pinAnchor !== undefined && !isValidDestination(candidate.pinAnchor)) {
    return false;
  }
  return true;
}

function isValidGroup(value: unknown): value is TabGroup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.tabIds) &&
    candidate.tabIds.every((id) => typeof id === "string") &&
    (candidate.lastActiveTabId === null || typeof candidate.lastActiveTabId === "string")
  );
}

function isValidPinnedFolder(value: unknown): value is PinnedFolder {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.name === "string" &&
    typeof candidate.collapsed === "boolean" &&
    Array.isArray(candidate.tabIds) &&
    candidate.tabIds.every((id) => typeof id === "string")
  );
}

function sanitizeLoadedState(parsed: unknown): BrowserNavState | null {
  if (!parsed || typeof parsed !== "object") return null;
  const data = parsed as Record<string, unknown>;
  if (data.version !== 1) return null;
  if (!Array.isArray(data.tabs) || !Array.isArray(data.groups)) return null;
  if (!data.tabs.every(isValidTab) || !data.groups.every(isValidGroup) || data.groups.length === 0) {
    return null;
  }

  const tabMap = new Map(data.tabs.map((tab) => [tab.id, { ...tab, history: tab.history.slice(-MAX_TAB_HISTORY) }]));
  const groups = data.groups.map((group) => {
    const tabIds = group.tabIds.filter((id) => {
      const tab = tabMap.get(id);
      return tab && !tab.pinned;
    });
    const lastActiveTabId = group.lastActiveTabId && tabIds.includes(group.lastActiveTabId)
      ? group.lastActiveTabId
      : tabIds[0] ?? null;
    return { ...group, tabIds, lastActiveTabId };
  });

  const activeGroupId = typeof data.activeGroupId === "string" && groups.some((g) => g.id === data.activeGroupId)
    ? data.activeGroupId
    : groups[0].id;

  const activeTabId = typeof data.activeTabId === "string" && tabMap.has(data.activeTabId)
    ? data.activeTabId
    : null;

  const pinnedFolders = Array.isArray(data.pinnedFolders)
    ? data.pinnedFolders.filter(isValidPinnedFolder).map((folder) => ({
        ...folder,
        tabIds: folder.tabIds.filter((id) => {
          const tab = tabMap.get(id);
          return tab && tab.pinned;
        }),
      }))
    : [];

  const closedTabs = Array.isArray(data.closedTabs)
    ? data.closedTabs
        .filter((item): item is ClosedTabRecord => (
          Boolean(item && typeof item === "object" && isValidTab((item as ClosedTabRecord).tab) && typeof (item as ClosedTabRecord).closedAt === "number")
        ))
        .slice(0, MAX_CLOSED_TABS)
    : [];

  const recentVisits = Array.isArray(data.recentVisits)
    ? data.recentVisits
        .filter((item): item is VisitRecord => isValidHistoryEntry(item))
        .slice(0, MAX_RECENT_VISITS)
    : [];

  return {
    tabs: Array.from(tabMap.values()).map((tab) => ({
      ...tab,
      cursor: Math.min(tab.cursor, tab.history.length - 1),
    })),
    groups,
    activeGroupId,
    activeTabId,
    pinnedFolders,
    closedTabs,
    recentVisits,
    storageWarning: null,
  };
}

function readPersistedState(): BrowserNavState {
  const storage = getStorage();
  if (!storage) return createDefaultState(null);

  try {
    const raw = storage.getItem(BROWSER_NAV_STORAGE_KEY);
    if (!raw) return createDefaultState(null);
    const parsed: unknown = JSON.parse(raw);
    const sanitized = sanitizeLoadedState(parsed);
    if (!sanitized) {
      return createDefaultState("Stored browser navigation data was invalid and has been reset.");
    }
    return sanitized;
  } catch {
    return createDefaultState("Stored browser navigation data was corrupted and has been reset.");
  }
}

function writePersistedState(state: BrowserNavState): string | null {
  const storage = getStorage();
  if (!storage) return null;

  const payload: PersistedBrowserNavPayload = {
    version: 1,
    tabs: state.tabs,
    groups: state.groups,
    activeGroupId: state.activeGroupId,
    activeTabId: state.activeTabId,
    pinnedFolders: state.pinnedFolders,
    closedTabs: state.closedTabs,
    recentVisits: state.recentVisits,
  };

  try {
    storage.setItem(BROWSER_NAV_STORAGE_KEY, JSON.stringify(payload));
    return null;
  } catch {
    return "Unable to persist browser navigation state; continuing in memory.";
  }
}

export const browserNavStore = createStore<BrowserNavState>(createDefaultState(null));

function commitState(updater: (current: BrowserNavState) => BrowserNavState) {
  browserNavStore.setState((current) => {
    const next = updater(current);
    if (Object.is(next, current)) return current;
    const writeWarning = writePersistedState(next);
    if (writeWarning && writeWarning !== next.storageWarning) {
      return { ...next, storageWarning: writeWarning };
    }
    return next;
  });
}

function appendHistoryEntry(
  tab: BrowserTab,
  destination: NavDestination,
  title: string,
  visitedAt: number,
): BrowserTab {
  const currentEntry = tab.history[tab.cursor];
  if (currentEntry && destinationKey(currentEntry.destination) === destinationKey(destination)) {
    if (currentEntry.title === title && tab.title === title) return tab;
    const nextHistory = tab.history.map((entry, index) => (
      index === tab.cursor ? { ...entry, title } : entry
    ));
    return { ...tab, title, history: nextHistory };
  }

  const truncated = tab.history.slice(0, tab.cursor + 1);
  const appended = [...truncated, { destination, title, visitedAt }];
  const bounded = appended.length > MAX_TAB_HISTORY
    ? appended.slice(appended.length - MAX_TAB_HISTORY)
    : appended;

  return {
    ...tab,
    title,
    history: bounded,
    cursor: bounded.length - 1,
  };
}

function recordVisit(
  visits: VisitRecord[],
  destination: NavDestination,
  title: string,
  visitedAt: number,
): VisitRecord[] {
  const key = destinationKey(destination);
  const filtered = visits.filter((item) => destinationKey(item.destination) !== key);
  return [{ destination, title, visitedAt }, ...filtered].slice(0, MAX_RECENT_VISITS);
}

function createNewTab(
  groupId: string | null,
  destination: NavDestination,
  title: string,
  visitedAt: number,
): BrowserTab {
  return {
    id: nextId("tab"),
    groupId,
    pinned: false,
    folderId: null,
    title,
    history: [{ destination, title, visitedAt }],
    cursor: 0,
  };
}

function findActiveGroup(state: BrowserNavState): TabGroup {
  return state.groups.find((g) => g.id === state.activeGroupId) ?? state.groups[0];
}

function insertIntoGroup(group: TabGroup, tabId: string, afterTabId: string | null): TabGroup {
  if (group.tabIds.includes(tabId)) return group;
  const idx = afterTabId ? group.tabIds.indexOf(afterTabId) : -1;
  const tabIds = idx >= 0
    ? [...group.tabIds.slice(0, idx + 1), tabId, ...group.tabIds.slice(idx + 1)]
    : [...group.tabIds, tabId];
  return { ...group, tabIds };
}

function pickFallbackActiveTab(
  tabs: BrowserTab[],
  group: TabGroup,
  closedIndex: number,
): string | null {
  if (group.tabIds.length > 0) {
    const nextIdx = Math.min(closedIndex, group.tabIds.length - 1);
    return group.tabIds[Math.max(0, nextIdx)] ?? null;
  }
  const firstPinned = tabs.find((tab) => tab.pinned);
  return firstPinned?.id ?? null;
}

export function syncRouteToActiveTab(destination: NavDestination, title: string): void {
  const now = Date.now();
  commitState((current) => {
    const recentVisits = recordVisit(current.recentVisits, destination, title, now);
    const activeTab = current.activeTabId
      ? current.tabs.find((tab) => tab.id === current.activeTabId)
      : undefined;

    if (!activeTab) {
      const activeGroup = findActiveGroup(current);
      const newTab = createNewTab(activeGroup.id, destination, title, now);
      return {
        ...current,
        tabs: [...current.tabs, newTab],
        groups: current.groups.map((group) => (
          group.id === activeGroup.id
            ? { ...group, tabIds: [...group.tabIds, newTab.id], lastActiveTabId: newTab.id }
            : group
        )),
        activeTabId: newTab.id,
        recentVisits,
      };
    }

    const updatedTab = appendHistoryEntry(activeTab, destination, title, now);
    if (updatedTab === activeTab && current.recentVisits[0] && destinationKey(current.recentVisits[0].destination) === destinationKey(destination) && current.recentVisits[0].title === title) {
      return current;
    }

    return {
      ...current,
      tabs: current.tabs.map((tab) => (tab.id === activeTab.id ? updatedTab : tab)),
      recentVisits,
    };
  });
}

export function openDestinationInCurrentTab(destination: NavDestination, title: string): void {
  const now = Date.now();
  commitState((current) => {
    const recentVisits = recordVisit(current.recentVisits, destination, title, now);
    const activeGroup = findActiveGroup(current);
    const targetKey = destinationKey(destination);

    // Dedupe: if an unpinned tab in the active group is already at this destination, focus it.
    const existingTab = current.tabs.find((tab) => {
      if (tab.pinned || tab.groupId !== activeGroup.id) return false;
      const curDest = getTabCurrentDestination(tab);
      return curDest !== null && destinationKey(curDest) === targetKey;
    });

    if (existingTab) {
      const updatedExisting = appendHistoryEntry(existingTab, destination, title, now);
      return {
        ...current,
        tabs: current.tabs.map((tab) => (tab.id === existingTab.id ? updatedExisting : tab)),
        groups: current.groups.map((group) => (
          group.id === activeGroup.id ? { ...group, lastActiveTabId: existingTab.id } : group
        )),
        activeTabId: existingTab.id,
        recentVisits,
      };
    }

    const activeTab = current.activeTabId
      ? current.tabs.find((tab) => tab.id === current.activeTabId)
      : undefined;

    if (!activeTab) {
      const newTab = createNewTab(activeGroup.id, destination, title, now);
      return {
        ...current,
        tabs: [...current.tabs, newTab],
        groups: current.groups.map((group) => (
          group.id === activeGroup.id
            ? { ...group, tabIds: [...group.tabIds, newTab.id], lastActiveTabId: newTab.id }
            : group
        )),
        activeTabId: newTab.id,
        recentVisits,
      };
    }

    const updatedTab = appendHistoryEntry(activeTab, destination, title, now);
    return {
      ...current,
      tabs: current.tabs.map((tab) => (tab.id === activeTab.id ? updatedTab : tab)),
      recentVisits,
    };
  });
}

export function openBackgroundTab(destination: NavDestination, title: string): string {
  const now = Date.now();
  let createdId = "";
  commitState((current) => {
    const activeGroup = findActiveGroup(current);
    const newTab = createNewTab(activeGroup.id, destination, title, now);
    createdId = newTab.id;
    return {
      ...current,
      tabs: [...current.tabs, newTab],
      groups: current.groups.map((group) => (
        group.id === activeGroup.id
          ? insertIntoGroup(group, newTab.id, current.activeTabId)
          : group
      )),
    };
  });
  return createdId;
}

export function selectTab(tabId: string): void {
  const now = Date.now();
  commitState((current) => {
    const tab = current.tabs.find((item) => item.id === tabId);
    if (!tab) return current;

    const currentDest = getTabCurrentDestination(tab);
    const recentVisits = currentDest
      ? recordVisit(current.recentVisits, currentDest, tab.title, now)
      : current.recentVisits;

    if (tab.pinned || !tab.groupId) {
      return {
        ...current,
        activeTabId: tabId,
        recentVisits,
      };
    }

    return {
      ...current,
      activeGroupId: tab.groupId,
      activeTabId: tabId,
      groups: current.groups.map((group) => (
        group.id === tab.groupId ? { ...group, lastActiveTabId: tabId } : group
      )),
      recentVisits,
    };
  });
}

export function closeTab(tabId: string): void {
  const now = Date.now();
  commitState((current) => {
    const target = current.tabs.find((tab) => tab.id === tabId);
    if (!target) return current;

    const remainingTabs = current.tabs.filter((tab) => tab.id !== tabId);
    const closedTabs: ClosedTabRecord[] = [
      { tab: target, closedAt: now },
      ...current.closedTabs,
    ].slice(0, MAX_CLOSED_TABS);

    let closedIndex = 0;
    const groups = current.groups.map((group) => {
      const idx = group.tabIds.indexOf(tabId);
      if (idx === -1) return group;
      closedIndex = idx;
      const nextTabIds = group.tabIds.filter((id) => id !== tabId);
      const nextLastActive = group.lastActiveTabId === tabId
        ? pickFallbackActiveTab(remainingTabs, { ...group, tabIds: nextTabIds }, closedIndex)
        : group.lastActiveTabId;
      return { ...group, tabIds: nextTabIds, lastActiveTabId: nextLastActive };
    });

    const pinnedFolders = current.pinnedFolders.map((folder) => (
      folder.tabIds.includes(tabId)
        ? { ...folder, tabIds: folder.tabIds.filter((id) => id !== tabId) }
        : folder
    ));

    let activeTabId = current.activeTabId;
    if (activeTabId === tabId) {
      const activeGroup = groups.find((g) => g.id === current.activeGroupId) ?? groups[0];
      activeTabId = pickFallbackActiveTab(remainingTabs, activeGroup, closedIndex);
    }

    return {
      ...current,
      tabs: remainingTabs,
      groups,
      pinnedFolders,
      closedTabs,
      activeTabId,
    };
  });
}

export function reopenClosedTab(): BrowserTab | null {
  let restored: BrowserTab | null = null;
  commitState((current) => {
    if (current.closedTabs.length === 0) return current;
    const [latest, ...restClosed] = current.closedTabs;
    const original = latest.tab;

    const targetGroupId = original.pinned
      ? null
      : (original.groupId && current.groups.some((g) => g.id === original.groupId)
          ? original.groupId
          : current.activeGroupId);

    const targetFolderId = original.pinned && original.folderId && current.pinnedFolders.some((f) => f.id === original.folderId)
      ? original.folderId
      : null;

    const restoredTab: BrowserTab = {
      ...original,
      groupId: targetGroupId,
      folderId: targetFolderId,
    };
    restored = restoredTab;

    const groups = targetGroupId
      ? current.groups.map((group) => (
          group.id === targetGroupId
            ? { ...group, tabIds: [...group.tabIds, restoredTab.id], lastActiveTabId: restoredTab.id }
            : group
        ))
      : current.groups;

    const pinnedFolders = targetFolderId
      ? current.pinnedFolders.map((folder) => (
          folder.id === targetFolderId
            ? { ...folder, tabIds: [...folder.tabIds, restoredTab.id] }
            : folder
        ))
      : current.pinnedFolders;

    return {
      ...current,
      tabs: [...current.tabs, restoredTab],
      groups,
      pinnedFolders,
      closedTabs: restClosed,
      activeGroupId: targetGroupId ?? current.activeGroupId,
      activeTabId: restoredTab.id,
    };
  });
  return restored;
}

export function duplicateTab(tabId: string): string | null {
  let createdId: string | null = null;
  commitState((current) => {
    const source = current.tabs.find((tab) => tab.id === tabId);
    if (!source) return current;

    const targetGroupId = source.groupId ?? current.activeGroupId;
    const duplicated: BrowserTab = {
      id: nextId("tab"),
      groupId: targetGroupId,
      pinned: false,
      folderId: null,
      title: source.title,
      history: source.history.map((entry) => ({ ...entry })),
      cursor: source.cursor,
    };
    createdId = duplicated.id;

    return {
      ...current,
      tabs: [...current.tabs, duplicated],
      groups: current.groups.map((group) => (
        group.id === targetGroupId
          ? { ...insertIntoGroup(group, duplicated.id, source.pinned ? null : source.id), lastActiveTabId: duplicated.id }
          : group
      )),
      activeGroupId: targetGroupId,
      activeTabId: duplicated.id,
    };
  });
  return createdId;
}

export function goBackInActiveTab(): NavDestination | null {
  let destination: NavDestination | null = null;
  const now = Date.now();
  commitState((current) => {
    if (!current.activeTabId) return current;
    const activeTab = current.tabs.find((tab) => tab.id === current.activeTabId);
    if (!canGoBack(activeTab) || !activeTab) return current;

    const nextCursor = activeTab.cursor - 1;
    const entry = activeTab.history[nextCursor];
    destination = entry.destination;

    const updatedTab: BrowserTab = {
      ...activeTab,
      cursor: nextCursor,
      title: entry.title,
    };

    return {
      ...current,
      tabs: current.tabs.map((tab) => (tab.id === activeTab.id ? updatedTab : tab)),
      recentVisits: recordVisit(current.recentVisits, entry.destination, entry.title, now),
    };
  });
  return destination;
}

export function goForwardInActiveTab(): NavDestination | null {
  let destination: NavDestination | null = null;
  const now = Date.now();
  commitState((current) => {
    if (!current.activeTabId) return current;
    const activeTab = current.tabs.find((tab) => tab.id === current.activeTabId);
    if (!canGoForward(activeTab) || !activeTab) return current;

    const nextCursor = activeTab.cursor + 1;
    const entry = activeTab.history[nextCursor];
    destination = entry.destination;

    const updatedTab: BrowserTab = {
      ...activeTab,
      cursor: nextCursor,
      title: entry.title,
    };

    return {
      ...current,
      tabs: current.tabs.map((tab) => (tab.id === activeTab.id ? updatedTab : tab)),
      recentVisits: recordVisit(current.recentVisits, entry.destination, entry.title, now),
    };
  });
  return destination;
}

export function createTabGroup(name: string): string {
  const trimmed = name.trim() || "Group";
  const groupId = nextId("group");
  commitState((current) => ({
    ...current,
    groups: [
      ...current.groups,
      { id: groupId, name: trimmed, tabIds: [], lastActiveTabId: null },
    ],
    activeGroupId: groupId,
    activeTabId: null,
  }));
  return groupId;
}

export function renameTabGroup(groupId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  commitState((current) => {
    const exists = current.groups.some((g) => g.id === groupId);
    if (!exists) return current;
    return {
      ...current,
      groups: current.groups.map((group) => (
        group.id === groupId ? { ...group, name: trimmed } : group
      )),
    };
  });
}

export function deleteTabGroup(groupId: string): void {
  const now = Date.now();
  commitState((current) => {
    if (current.groups.length <= 1) return current;
    const targetGroup = current.groups.find((g) => g.id === groupId);
    if (!targetGroup) return current;

    const remainingGroups = current.groups.filter((g) => g.id !== groupId);
    const removedTabIds = new Set(targetGroup.tabIds);
    const removedTabs = current.tabs.filter((tab) => removedTabIds.has(tab.id));
    const remainingTabs = current.tabs.filter((tab) => !removedTabIds.has(tab.id));

    const closedTabs: ClosedTabRecord[] = [
      ...removedTabs.map((tab) => ({ tab, closedAt: now })),
      ...current.closedTabs,
    ].slice(0, MAX_CLOSED_TABS);

    const nextActiveGroupId = current.activeGroupId === groupId
      ? remainingGroups[0].id
      : current.activeGroupId;

    const nextActiveGroup = remainingGroups.find((g) => g.id === nextActiveGroupId) ?? remainingGroups[0];
    const activeTabRemoved = current.activeTabId ? removedTabIds.has(current.activeTabId) : false;
    const nextActiveTabId = activeTabRemoved
      ? (nextActiveGroup.lastActiveTabId ?? nextActiveGroup.tabIds[0] ?? remainingTabs.find((t) => t.pinned)?.id ?? null)
      : current.activeTabId;

    return {
      ...current,
      tabs: remainingTabs,
      groups: remainingGroups,
      activeGroupId: nextActiveGroupId,
      activeTabId: nextActiveTabId,
      closedTabs,
    };
  });
}

export function switchTabGroup(groupId: string): void {
  commitState((current) => {
    if (current.activeGroupId === groupId) return current;
    const targetGroup = current.groups.find((g) => g.id === groupId);
    if (!targetGroup) return current;

    const nextActiveTabId = targetGroup.lastActiveTabId && targetGroup.tabIds.includes(targetGroup.lastActiveTabId)
      ? targetGroup.lastActiveTabId
      : targetGroup.tabIds[0] ?? null;

    return {
      ...current,
      activeGroupId: groupId,
      activeTabId: nextActiveTabId,
    };
  });
}

export function moveTabToGroup(tabId: string, groupId: string): void {
  commitState((current) => {
    const tab = current.tabs.find((item) => item.id === tabId);
    const targetGroup = current.groups.find((g) => g.id === groupId);
    if (!tab || !targetGroup || tab.groupId === groupId) return current;

    const updatedTab: BrowserTab = {
      ...tab,
      pinned: false,
      folderId: null,
      pinAnchor: undefined,
      groupId,
    };

    const groups = current.groups.map((group) => {
      if (group.id === groupId) {
        return {
          ...group,
          tabIds: group.tabIds.includes(tabId) ? group.tabIds : [...group.tabIds, tabId],
          lastActiveTabId: current.activeTabId === tabId ? tabId : group.lastActiveTabId,
        };
      }
      if (group.tabIds.includes(tabId)) {
        const nextTabIds = group.tabIds.filter((id) => id !== tabId);
        return {
          ...group,
          tabIds: nextTabIds,
          lastActiveTabId: group.lastActiveTabId === tabId ? (nextTabIds[0] ?? null) : group.lastActiveTabId,
        };
      }
      return group;
    });

    const pinnedFolders = current.pinnedFolders.map((folder) => (
      folder.tabIds.includes(tabId)
        ? { ...folder, tabIds: folder.tabIds.filter((id) => id !== tabId) }
        : folder
    ));

    return {
      ...current,
      tabs: current.tabs.map((item) => (item.id === tabId ? updatedTab : item)),
      groups,
      pinnedFolders,
      activeGroupId: current.activeTabId === tabId ? groupId : current.activeGroupId,
    };
  });
}

export function pinTab(tabId: string): void {
  commitState((current) => {
    const tab = current.tabs.find((item) => item.id === tabId);
    if (!tab || tab.pinned) return current;

    const anchor = getTabCurrentDestination(tab) ?? undefined;
    const updatedTab: BrowserTab = {
      ...tab,
      pinned: true,
      groupId: null,
      folderId: null,
      pinAnchor: anchor,
    };

    const groups = current.groups.map((group) => {
      if (!group.tabIds.includes(tabId)) return group;
      const nextTabIds = group.tabIds.filter((id) => id !== tabId);
      return {
        ...group,
        tabIds: nextTabIds,
        lastActiveTabId: group.lastActiveTabId === tabId ? (nextTabIds[0] ?? null) : group.lastActiveTabId,
      };
    });

    return {
      ...current,
      tabs: current.tabs.map((item) => (item.id === tabId ? updatedTab : item)),
      groups,
    };
  });
}

export function unpinTab(tabId: string): void {
  commitState((current) => {
    const tab = current.tabs.find((item) => item.id === tabId);
    if (!tab || !tab.pinned) return current;

    const activeGroup = findActiveGroup(current);
    const updatedTab: BrowserTab = {
      ...tab,
      pinned: false,
      folderId: null,
      pinAnchor: undefined,
      groupId: activeGroup.id,
    };

    const pinnedFolders = current.pinnedFolders.map((folder) => (
      folder.tabIds.includes(tabId)
        ? { ...folder, tabIds: folder.tabIds.filter((id) => id !== tabId) }
        : folder
    ));

    const groups = current.groups.map((group) => (
      group.id === activeGroup.id
        ? {
            ...group,
            tabIds: group.tabIds.includes(tabId) ? group.tabIds : [...group.tabIds, tabId],
            lastActiveTabId: current.activeTabId === tabId ? tabId : group.lastActiveTabId,
          }
        : group
    ));

    return {
      ...current,
      tabs: current.tabs.map((item) => (item.id === tabId ? updatedTab : item)),
      groups,
      pinnedFolders,
    };
  });
}

export function createPinnedFolder(name: string): string {
  const trimmed = name.trim() || "Folder";
  const folderId = nextId("pfolder");
  commitState((current) => ({
    ...current,
    pinnedFolders: [
      ...current.pinnedFolders,
      { id: folderId, name: trimmed, collapsed: false, tabIds: [] },
    ],
  }));
  return folderId;
}

export function renamePinnedFolder(folderId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  commitState((current) => ({
    ...current,
    pinnedFolders: current.pinnedFolders.map((folder) => (
      folder.id === folderId ? { ...folder, name: trimmed } : folder
    )),
  }));
}

export function togglePinnedFolder(folderId: string): void {
  commitState((current) => ({
    ...current,
    pinnedFolders: current.pinnedFolders.map((folder) => (
      folder.id === folderId ? { ...folder, collapsed: !folder.collapsed } : folder
    )),
  }));
}

export function deletePinnedFolder(folderId: string): void {
  commitState((current) => {
    const folder = current.pinnedFolders.find((item) => item.id === folderId);
    if (!folder) return current;

    return {
      ...current,
      pinnedFolders: current.pinnedFolders.filter((item) => item.id !== folderId),
      tabs: current.tabs.map((tab) => (
        tab.folderId === folderId ? { ...tab, folderId: null } : tab
      )),
    };
  });
}

export function movePinToFolder(tabId: string, folderId: string | null): void {
  commitState((current) => {
    const tab = current.tabs.find((item) => item.id === tabId);
    if (!tab) return current;
    if (folderId !== null && !current.pinnedFolders.some((f) => f.id === folderId)) {
      return current;
    }

    const anchor = tab.pinAnchor ?? getTabCurrentDestination(tab) ?? undefined;
    const updatedTab: BrowserTab = {
      ...tab,
      pinned: true,
      groupId: null,
      folderId,
      pinAnchor: anchor,
    };

    const groups = tab.groupId
      ? current.groups.map((group) => {
          if (group.id !== tab.groupId) return group;
          const nextTabIds = group.tabIds.filter((id) => id !== tabId);
          return {
            ...group,
            tabIds: nextTabIds,
            lastActiveTabId: group.lastActiveTabId === tabId ? (nextTabIds[0] ?? null) : group.lastActiveTabId,
          };
        })
      : current.groups;

    const pinnedFolders = current.pinnedFolders.map((folder) => {
      const withoutTab = folder.tabIds.filter((id) => id !== tabId);
      if (folder.id === folderId) {
        return { ...folder, tabIds: [...withoutTab, tabId] };
      }
      return withoutTab.length === folder.tabIds.length ? folder : { ...folder, tabIds: withoutTab };
    });

    return {
      ...current,
      tabs: current.tabs.map((item) => (item.id === tabId ? updatedTab : item)),
      groups,
      pinnedFolders,
    };
  });
}

function moveIdInArray(ids: string[], sourceId: string, targetId: string): string[] {
  const fromIdx = ids.indexOf(sourceId);
  const toIdx = ids.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return ids;
  const copy = [...ids];
  const [moved] = copy.splice(fromIdx, 1);
  copy.splice(toIdx, 0, moved);
  return copy;
}

export function reorderTabs(sourceTabId: string, targetTabId: string): void {
  if (sourceTabId === targetTabId) return;
  commitState((current) => {
    const source = current.tabs.find((t) => t.id === sourceTabId);
    const target = current.tabs.find((t) => t.id === targetTabId);
    if (!source || !target) return current;

    if (!source.pinned && !target.pinned && source.groupId && source.groupId === target.groupId) {
      return {
        ...current,
        groups: current.groups.map((group) => (
          group.id === source.groupId
            ? { ...group, tabIds: moveIdInArray(group.tabIds, sourceTabId, targetTabId) }
            : group
        )),
      };
    }

    if (source.pinned && target.pinned && source.folderId && source.folderId === target.folderId) {
      return {
        ...current,
        pinnedFolders: current.pinnedFolders.map((folder) => (
          folder.id === source.folderId
            ? { ...folder, tabIds: moveIdInArray(folder.tabIds, sourceTabId, targetTabId) }
            : folder
        )),
      };
    }

    if (source.pinned && target.pinned && !source.folderId && !target.folderId) {
      const fromIdx = current.tabs.findIndex((t) => t.id === sourceTabId);
      const toIdx = current.tabs.findIndex((t) => t.id === targetTabId);
      if (fromIdx === -1 || toIdx === -1) return current;
      const copy = [...current.tabs];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return { ...current, tabs: copy };
    }

    return current;
  });
}

function pruneTabWorkspace(tab: BrowserTab, workspaceId: string): BrowserTab | null {
  const keptIndices: number[] = [];
  const nextHistory: NavHistoryEntry[] = [];

  tab.history.forEach((entry, index) => {
    if (entry.destination.kind === "workspace" && entry.destination.workspaceId === workspaceId) {
      return;
    }
    keptIndices.push(index);
    nextHistory.push(entry);
  });

  if (nextHistory.length === 0) return null;

  let nextCursor = 0;
  for (let i = 0; i < keptIndices.length; i += 1) {
    if (keptIndices[i] <= tab.cursor) {
      nextCursor = i;
    }
  }

  const nextAnchor = tab.pinAnchor?.kind === "workspace" && tab.pinAnchor.workspaceId === workspaceId
    ? nextHistory[nextCursor].destination
    : tab.pinAnchor;

  return {
    ...tab,
    history: nextHistory,
    cursor: nextCursor,
    title: nextHistory[nextCursor].title,
    pinAnchor: nextAnchor,
  };
}

export function pruneDeletedWorkspace(workspaceId: string): void {
  commitState((current) => {
    const survivingTabs: BrowserTab[] = [];
    const removedIds = new Set<string>();

    for (const tab of current.tabs) {
      const pruned = pruneTabWorkspace(tab, workspaceId);
      if (pruned) {
        survivingTabs.push(pruned);
      } else {
        removedIds.add(tab.id);
      }
    }

    const recentVisits = current.recentVisits.filter(
      (visit) => !(visit.destination.kind === "workspace" && visit.destination.workspaceId === workspaceId),
    );

    const closedTabs: ClosedTabRecord[] = [];
    for (const record of current.closedTabs) {
      const pruned = pruneTabWorkspace(record.tab, workspaceId);
      if (pruned) {
        closedTabs.push({ ...record, tab: pruned });
      }
    }

    const groups = current.groups.map((group) => {
      const nextTabIds = group.tabIds.filter((id) => !removedIds.has(id));
      const nextLastActive = group.lastActiveTabId && !removedIds.has(group.lastActiveTabId)
        ? group.lastActiveTabId
        : (nextTabIds[0] ?? null);
      return { ...group, tabIds: nextTabIds, lastActiveTabId: nextLastActive };
    });

    const pinnedFolders = current.pinnedFolders.map((folder) => ({
      ...folder,
      tabIds: folder.tabIds.filter((id) => !removedIds.has(id)),
    }));

    let activeTabId = current.activeTabId;
    if (activeTabId && removedIds.has(activeTabId)) {
      const activeGroup = groups.find((g) => g.id === current.activeGroupId) ?? groups[0];
      activeTabId = activeGroup.lastActiveTabId ?? activeGroup.tabIds[0] ?? survivingTabs.find((t) => t.pinned)?.id ?? null;
    }

    return {
      ...current,
      tabs: survivingTabs,
      groups,
      pinnedFolders,
      closedTabs,
      recentVisits,
      activeTabId,
    };
  });
}

export function jumpToTabHistoryIndex(index: number): NavDestination | null {
  let targetDest: NavDestination | null = null;
  commitState((current) => {
    if (!current.activeTabId) return current;
    const tab = current.tabs.find((t) => t.id === current.activeTabId);
    if (!tab || tab.history.length === 0) return current;
    const clamped = Math.max(0, Math.min(tab.history.length - 1, index));
    if (clamped === tab.cursor) {
      targetDest = tab.history[clamped]?.destination ?? null;
      return current;
    }
    const entry = tab.history[clamped];
    if (!entry) return current;
    targetDest = entry.destination;
    return {
      ...current,
      tabs: current.tabs.map((t) => (
        t.id === tab.id ? { ...t, cursor: clamped, title: entry.title } : t
      )),
    };
  });
  return targetDest;
}

export function resetBrowserNavStore(): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(BROWSER_NAV_STORAGE_KEY);
    } catch {
      // Ignore storage errors during reset.
    }
  }
  browserNavStore.setState(createDefaultState(null));
}

export function hydrateBrowserNavStoreFromStorage(): void {
  browserNavStore.setState(readPersistedState());
}
