import assert from "node:assert/strict";
import test from "node:test";
import {
  BROWSER_NAV_STORAGE_KEY,
  MAX_CLOSED_TABS,
  MAX_RECENT_VISITS,
  MAX_TAB_HISTORY,
  browserNavStore,
  canGoBack,
  canGoForward,
  closeTab,
  createPinnedFolder,
  createTabGroup,
  deletePinnedFolder,
  deleteTabGroup,
  destinationKey,
  duplicateTab,
  goBackInActiveTab,
  goForwardInActiveTab,
  hydrateBrowserNavStoreFromStorage,
  jumpToTabHistoryIndex,
  movePinToFolder,
  moveTabToGroup,
  openBackgroundTab,
  openDestinationInCurrentTab,
  pinTab,
  pruneDeletedWorkspace,
  renamePinnedFolder,
  renameTabGroup,
  reopenClosedTab,
  reorderTabs,
  resetBrowserNavStore,
  selectTab,
  switchTabGroup,
  syncRouteToActiveTab,
  togglePinnedFolder,
  unpinTab,
} from "./browser-nav-store.ts";

function installMockStorage(initial: Record<string, string> = {}, options?: { throwOnSet?: boolean }) {
  const map = new Map<string, string>(Object.entries(initial));
  const mockStorage: Storage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      if (options?.throwOnSet) {
        throw new Error("QuotaExceededError");
      }
      map.set(key, value);
    },
  };

  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: mockStorage,
  });

  return {
    map,
    restore() {
      if (previous) {
        Object.defineProperty(globalThis, "localStorage", previous);
      } else {
        delete (globalThis as Record<string, unknown>).localStorage;
      }
    },
  };
}

test("open, dedupe, duplicate, and background tab behavior", () => {
  resetBrowserNavStore();
  try {
    syncRouteToActiveTab({ kind: "home" }, "Home");
    const firstState = browserNavStore.getSnapshot();
    assert.equal(firstState.tabs.length, 1);
    const homeTabId = firstState.activeTabId!;

    // Open a background tab: activeTabId stays on Home
    const bgId = openBackgroundTab({ kind: "workspace", workspaceId: "ws-1" }, "Workspace 1");
    assert.equal(browserNavStore.getSnapshot().activeTabId, homeTabId);
    assert.equal(browserNavStore.getSnapshot().tabs.length, 2);

    // Dedupe: opening ws-1 in current tab focuses the existing ws-1 tab instead of creating a duplicate
    openDestinationInCurrentTab({ kind: "workspace", workspaceId: "ws-1" }, "Workspace 1");
    assert.equal(browserNavStore.getSnapshot().activeTabId, bgId);
    assert.equal(browserNavStore.getSnapshot().tabs.length, 2);

    // Duplicate creates a separate tab next to source and activates it
    const dupId = duplicateTab(bgId);
    assert.ok(dupId);
    assert.notEqual(dupId, bgId);
    assert.equal(browserNavStore.getSnapshot().activeTabId, dupId);
    assert.equal(browserNavStore.getSnapshot().tabs.length, 3);
  } finally {
    resetBrowserNavStore();
  }
});

test("close active tab falls back to neighbor and handles closing the last tab", () => {
  resetBrowserNavStore();
  try {
    syncRouteToActiveTab({ kind: "home" }, "Home");
    const tab1 = browserNavStore.getSnapshot().activeTabId!;
    const tab2 = openBackgroundTab({ kind: "cards" }, "Cards");
    const tab3 = openBackgroundTab({ kind: "workspace", workspaceId: "ws-1" }, "WS 1");

    selectTab(tab2);
    closeTab(tab2);
    assert.equal(browserNavStore.getSnapshot().activeTabId, tab3);

    closeTab(tab3);
    assert.equal(browserNavStore.getSnapshot().activeTabId, tab1);

    // Closing the last tab leaves activeTabId null
    closeTab(tab1);
    assert.equal(browserNavStore.getSnapshot().tabs.length, 0);
    assert.equal(browserNavStore.getSnapshot().activeTabId, null);
    assert.equal(browserNavStore.getSnapshot().closedTabs.length, 3);
  } finally {
    resetBrowserNavStore();
  }
});

test("per-tab Back/Forward navigation and forward branch truncation", () => {
  resetBrowserNavStore();
  try {
    syncRouteToActiveTab({ kind: "home" }, "Home");
    syncRouteToActiveTab({ kind: "cards" }, "Cards");
    syncRouteToActiveTab({ kind: "workspace", workspaceId: "ws-1" }, "WS 1");

    const tab = () => browserNavStore.getSnapshot().tabs[0];
    assert.equal(canGoBack(tab()), true);
    assert.equal(canGoForward(tab()), false);

    const back1 = goBackInActiveTab();
    assert.deepEqual(back1, { kind: "cards" });
    assert.equal(canGoBack(tab()), true);
    assert.equal(canGoForward(tab()), true);

    const back2 = goBackInActiveTab();
    assert.deepEqual(back2, { kind: "home" });
    assert.equal(canGoBack(tab()), false);
    assert.equal(canGoForward(tab()), true);

    const fwd1 = goForwardInActiveTab();
    assert.deepEqual(fwd1, { kind: "cards" });

    // Navigating to a new destination from middle of history truncates forward branch (ws-1)
    syncRouteToActiveTab({ kind: "workspace", workspaceId: "ws-2" }, "WS 2");
    assert.equal(canGoForward(tab()), false);
    assert.deepEqual(
      tab().history.map((h) => destinationKey(h.destination)),
      ["home", "cards", "workspace:ws-2"],
    );
  } finally {
    resetBrowserNavStore();
  }
});

test("TabGroup create, switch, rename, move tab, and delete", () => {
  resetBrowserNavStore();
  try {
    syncRouteToActiveTab({ kind: "home" }, "Home");
    const defaultGroupId = browserNavStore.getSnapshot().activeGroupId;
    const homeTabId = browserNavStore.getSnapshot().activeTabId!;

    const workGroupId = createTabGroup("Work");
    renameTabGroup(workGroupId, "Workspaces");
    assert.equal(browserNavStore.getSnapshot().activeGroupId, workGroupId);
    assert.equal(browserNavStore.getSnapshot().activeTabId, null);

    syncRouteToActiveTab({ kind: "workspace", workspaceId: "ws-9" }, "WS 9");
    const workTabId = browserNavStore.getSnapshot().activeTabId!;

    // Switch back to default group restores its lastActiveTabId
    switchTabGroup(defaultGroupId);
    assert.equal(browserNavStore.getSnapshot().activeGroupId, defaultGroupId);
    assert.equal(browserNavStore.getSnapshot().activeTabId, homeTabId);

    // Move homeTabId to Workspaces group
    moveTabToGroup(homeTabId, workGroupId);
    assert.equal(browserNavStore.getSnapshot().activeGroupId, workGroupId);
    const workGroup = browserNavStore.getSnapshot().groups.find((g) => g.id === workGroupId)!;
    assert.ok(workGroup.tabIds.includes(homeTabId));
    assert.ok(workGroup.tabIds.includes(workTabId));

    // Delete Workspaces group falls back to default group and records closed tabs
    deleteTabGroup(workGroupId);
    assert.equal(browserNavStore.getSnapshot().groups.length, 1);
    assert.equal(browserNavStore.getSnapshot().activeGroupId, defaultGroupId);
    assert.equal(browserNavStore.getSnapshot().closedTabs.length, 2);
  } finally {
    resetBrowserNavStore();
  }
});

test("Pinned tab anchor and PinnedFolder delete promotes pins to ungrouped", () => {
  resetBrowserNavStore();
  try {
    syncRouteToActiveTab({ kind: "workspace", workspaceId: "ws-pin" }, "Pinned WS");
    const tabId = browserNavStore.getSnapshot().activeTabId!;

    pinTab(tabId);
    let tab = browserNavStore.getSnapshot().tabs.find((t) => t.id === tabId)!;
    assert.equal(tab.pinned, true);
    assert.equal(tab.groupId, null);
    assert.deepEqual(tab.pinAnchor, { kind: "workspace", workspaceId: "ws-pin" });

    // Navigating inside pinned tab preserves pinAnchor
    syncRouteToActiveTab({ kind: "cards" }, "Cards");
    tab = browserNavStore.getSnapshot().tabs.find((t) => t.id === tabId)!;
    assert.deepEqual(tab.pinAnchor, { kind: "workspace", workspaceId: "ws-pin" });

    const folderId = createPinnedFolder("Docs");
    renamePinnedFolder(folderId, "Important");
    togglePinnedFolder(folderId);
    assert.equal(browserNavStore.getSnapshot().pinnedFolders[0].collapsed, true);

    movePinToFolder(tabId, folderId);
    tab = browserNavStore.getSnapshot().tabs.find((t) => t.id === tabId)!;
    assert.equal(tab.folderId, folderId);

    // Deleting folder promotes pin back to ungrouped pinned list
    deletePinnedFolder(folderId);
    assert.equal(browserNavStore.getSnapshot().pinnedFolders.length, 0);
    tab = browserNavStore.getSnapshot().tabs.find((t) => t.id === tabId)!;
    assert.equal(tab.pinned, true);
    assert.equal(tab.folderId, null);

    unpinTab(tabId);
    tab = browserNavStore.getSnapshot().tabs.find((t) => t.id === tabId)!;
    assert.equal(tab.pinned, false);
    assert.equal(tab.pinAnchor, undefined);
    assert.equal(tab.groupId, browserNavStore.getSnapshot().activeGroupId);
  } finally {
    resetBrowserNavStore();
  }
});

test("recent-close restore, reorderTabs, and pruneDeletedWorkspace", () => {
  resetBrowserNavStore();
  try {
    syncRouteToActiveTab({ kind: "home" }, "Home");
    const tab1 = browserNavStore.getSnapshot().activeTabId!;
    const tab2 = openBackgroundTab({ kind: "workspace", workspaceId: "ws-del" }, "Delete Me");

    reorderTabs(tab2, tab1);
    assert.deepEqual(browserNavStore.getSnapshot().groups[0].tabIds, [tab2, tab1]);

    closeTab(tab2);
    assert.equal(browserNavStore.getSnapshot().tabs.length, 1);

    const restored = reopenClosedTab();
    assert.ok(restored);
    assert.equal(restored.id, tab2);
    assert.equal(browserNavStore.getSnapshot().activeTabId, tab2);

    pruneDeletedWorkspace("ws-del");
    assert.equal(browserNavStore.getSnapshot().tabs.some((t) => t.id === tab2), false);
    assert.equal(browserNavStore.getSnapshot().activeTabId, tab1);
  } finally {
    resetBrowserNavStore();
  }
});

test("bounded retention for history, closedTabs, and recentVisits", () => {
  resetBrowserNavStore();
  try {
    syncRouteToActiveTab({ kind: "home" }, "Home");
    for (let i = 0; i < MAX_TAB_HISTORY + 15; i += 1) {
      syncRouteToActiveTab({ kind: "workspace", workspaceId: `ws-hist-${i}` }, `WS ${i}`);
    }
    assert.equal(browserNavStore.getSnapshot().tabs[0].history.length, MAX_TAB_HISTORY);

    for (let i = 0; i < MAX_RECENT_VISITS + 20; i += 1) {
      syncRouteToActiveTab({ kind: "workspace", workspaceId: `ws-visit-${i}` }, `Visit ${i}`);
    }
    assert.equal(browserNavStore.getSnapshot().recentVisits.length, MAX_RECENT_VISITS);

    for (let i = 0; i < MAX_CLOSED_TABS + 10; i += 1) {
      const id = openBackgroundTab({ kind: "workspace", workspaceId: `ws-close-${i}` }, `Close ${i}`);
      closeTab(id);
    }
    assert.equal(browserNavStore.getSnapshot().closedTabs.length, MAX_CLOSED_TABS);
  } finally {
    resetBrowserNavStore();
  }
});

test("corrupted storage recovery and write failure fallback", () => {
  const storage = installMockStorage({
    [BROWSER_NAV_STORAGE_KEY]: "{not-valid-json",
  });
  try {
    hydrateBrowserNavStoreFromStorage();
    const recovered = browserNavStore.getSnapshot();
    assert.ok(recovered.storageWarning);
    assert.equal(recovered.groups.length, 1);
    assert.equal(recovered.tabs.length, 0);
  } finally {
    storage.restore();
    resetBrowserNavStore();
  }

  const failingStorage = installMockStorage({}, { throwOnSet: true });
  try {
    resetBrowserNavStore();
    syncRouteToActiveTab({ kind: "home" }, "Home");
    const state = browserNavStore.getSnapshot();
    assert.ok(state.storageWarning);
    assert.equal(state.tabs.length, 1);
  } finally {
    failingStorage.restore();
    resetBrowserNavStore();
  }
});

test("map destination and jumpToTabHistoryIndex", () => {
  resetBrowserNavStore();
  try {
    syncRouteToActiveTab({ kind: "home" }, "Welcome");
    syncRouteToActiveTab({ kind: "map" }, "Workspace Map");
    syncRouteToActiveTab({ kind: "cards" }, "Card Library");

    const jumped = jumpToTabHistoryIndex(0);
    assert.deepEqual(jumped, { kind: "home" });
    const tab = browserNavStore.getSnapshot().tabs[0];
    assert.equal(tab.cursor, 0);
    assert.equal(tab.title, "Welcome");

    const jumpedMap = jumpToTabHistoryIndex(1);
    assert.deepEqual(jumpedMap, { kind: "map" });
    assert.equal(browserNavStore.getSnapshot().tabs[0].cursor, 1);

    syncRouteToActiveTab({ kind: "card", noteId: "note-1" }, "Card One");
    assert.equal(destinationKey({ kind: "card", noteId: "note-1" }), "card:note-1");
    assert.equal(browserNavStore.getSnapshot().recentVisits.some((v) => v.destination.kind === "card"), true);
  } finally {
    resetBrowserNavStore();
  }
});
