import { useState, type DragEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderPlus,
  FolderTree,
  Home,
  Layers,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import {
  CardEntityIcon,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  IconButton,
  Input,
  WorkspaceEntityIcon,
  cn,
} from "../../../shared/ui";

export type BrowserNavDestination =
  | { kind: "home" }
  | { kind: "map" }
  | { kind: "cards" }
  | { kind: "card"; noteId: string }
  | { kind: "workspace"; workspaceId: string };

export type BrowserRecentItem = {
  destination: BrowserNavDestination;
  title: string;
  visitedAt: number;
};

export type BrowserNavTabItem = {
  id: string;
  groupId: string | null;
  pinned: boolean;
  folderId: string | null;
  title: string;
  destination: BrowserNavDestination | null;
};

export type BrowserNavGroupItem = {
  id: string;
  name: string;
  tabIds: string[];
};

export type BrowserNavPinnedFolderItem = {
  id: string;
  name: string;
  collapsed: boolean;
  tabIds: string[];
};

type BrowserTabsSectionProps = {
  activeGroupId: string;
  activeTabId: string | null;
  groups: BrowserNavGroupItem[];
  tabs: BrowserNavTabItem[];
  pinnedFolders: BrowserNavPinnedFolderItem[];
  recentItems?: BrowserRecentItem[];
  storageWarning?: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onOpenRecent?: (destination: BrowserNavDestination, title: string) => void;
  onOpenRecentInNewTab?: (destination: BrowserNavDestination, title: string) => void;
  onDuplicateTab: (tabId: string) => void;
  onPinTab: (tabId: string) => void;
  onUnpinTab: (tabId: string) => void;
  onMoveTabToGroup: (tabId: string, groupId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onReorderTabs: (sourceTabId: string, targetTabId: string) => void;
  onSwitchGroup: (groupId: string) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onCreatePinnedFolder: (name: string) => void;
  onRenamePinnedFolder: (folderId: string, name: string) => void;
  onTogglePinnedFolder: (folderId: string) => void;
  onDeletePinnedFolder: (folderId: string) => void;
  onMovePinToFolder: (tabId: string, folderId: string | null) => void;
};

function DestinationIcon({ destination }: { destination: BrowserNavDestination | null }) {
  if (!destination || destination.kind === "home") {
    return <Home size={13} className="shrink-0 opacity-75" aria-hidden="true" />;
  }
  if (destination.kind === "map") {
    return <FolderTree size={13} className="shrink-0 opacity-75" aria-hidden="true" />;
  }
  if (destination.kind === "cards") {
    return <StickyNote size={13} className="shrink-0 opacity-75" aria-hidden="true" />;
  }
  if (destination.kind === "card") {
    return <CardEntityIcon size={13} className="opacity-80" />;
  }
  return <WorkspaceEntityIcon size={13} className="opacity-80" />;
}

export function BrowserTabsSection({
  activeGroupId,
  activeTabId,
  groups,
  tabs,
  pinnedFolders,
  recentItems = [],
  storageWarning,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onOpenRecent,
  onOpenRecentInNewTab,
  onDuplicateTab,
  onPinTab,
  onUnpinTab,
  onMoveTabToGroup,
  onCloseOtherTabs,
  onReorderTabs,
  onSwitchGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onCreatePinnedFolder,
  onRenamePinnedFolder,
  onTogglePinnedFolder,
  onDeletePinnedFolder,
  onMovePinToFolder,
}: BrowserTabsSectionProps) {
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupDraft, setGroupDraft] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [recentCollapsed, setRecentCollapsed] = useState(false);

  const tabById = new Map(tabs.map((tab) => [tab.id, tab]));
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];
  const openTabs = (activeGroup?.tabIds ?? [])
    .map((id) => tabById.get(id))
    .filter((tab): tab is BrowserNavTabItem => Boolean(tab && !tab.pinned));
  const ungroupedPins = tabs.filter((tab) => tab.pinned && !tab.folderId);

  function handleTabDragStart(tabId: string, event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData("text/notespace-browser-tab", tabId);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleTabDrop(targetTabId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOverTabId(null);
    const sourceTabId = event.dataTransfer.getData("text/notespace-browser-tab");
    if (sourceTabId && sourceTabId !== targetTabId) {
      onReorderTabs(sourceTabId, targetTabId);
    }
  }

  function renderTabRow(tab: BrowserNavTabItem) {
    const isActive = tab.id === activeTabId;
    const otherGroups = groups.filter((group) => group.id !== tab.groupId);

    return (
      <ContextMenu key={tab.id}>
        <ContextMenuTrigger asChild>
          <div
            draggable
            onDragStart={(event) => handleTabDragStart(tab.id, event)}
            onDragOver={(event) => {
              event.preventDefault();
              if (dragOverTabId !== tab.id) setDragOverTabId(tab.id);
            }}
            onDragLeave={() => {
              if (dragOverTabId === tab.id) setDragOverTabId(null);
            }}
            onDrop={(event) => handleTabDrop(tab.id, event)}
            className={cn(
              "group flex h-[26px] min-w-0 items-center gap-1.5 rounded-md px-1.5 text-xs transition-colors",
              isActive
                ? "bg-surface font-medium text-ink ring-1 ring-inset ring-line/80"
                : "text-ink/80 hover:bg-ink/[0.05] hover:text-ink",
              dragOverTabId === tab.id && "ring-1 ring-accent",
            )}
          >
            <button
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              title={tab.title}
            >
              <span className={cn("shrink-0", isActive ? "text-accent" : "text-muted")}>
                <DestinationIcon destination={tab.destination} />
              </span>
              <span className="truncate">{tab.title}</span>
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onCloseTab(tab.id);
              }}
              className="hidden h-4 w-4 shrink-0 items-center justify-center rounded text-muted hover:bg-ink/10 hover:text-ink group-hover:flex"
            >
              <X size={11} aria-hidden="true" />
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {tab.pinned ? (
            <ContextMenuItem onSelect={() => onUnpinTab(tab.id)}>
              <PinOff size={13} aria-hidden="true" />
              Unpin tab
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onSelect={() => onPinTab(tab.id)}>
              <Pin size={13} aria-hidden="true" />
              Pin tab
            </ContextMenuItem>
          )}
          {tab.pinned && pinnedFolders.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Folder size={13} aria-hidden="true" />
                Move to folder
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {tab.folderId !== null && (
                  <ContextMenuItem onSelect={() => onMovePinToFolder(tab.id, null)}>
                    Ungrouped pins
                  </ContextMenuItem>
                )}
                {pinnedFolders.map((folder) => (
                  <ContextMenuItem
                    key={folder.id}
                    disabled={tab.folderId === folder.id}
                    onSelect={() => onMovePinToFolder(tab.id, folder.id)}
                  >
                    {folder.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuItem onSelect={() => onDuplicateTab(tab.id)}>
            <Copy size={13} aria-hidden="true" />
            Duplicate
          </ContextMenuItem>
          {otherGroups.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Layers size={13} aria-hidden="true" />
                Move to group
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {otherGroups.map((group) => (
                  <ContextMenuItem key={group.id} onSelect={() => onMoveTabToGroup(tab.id, group.id)}>
                    {group.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuItem onSelect={() => onCloseOtherTabs(tab.id)}>
            Close others
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCloseTab(tab.id)}>
            <X size={13} aria-hidden="true" />
            Close
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <section
      aria-label="Browser navigation"
      className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto border-t border-line/70 pt-2 no-scrollbar"
    >
      {storageWarning && (
        <p className="mx-1 rounded bg-tint px-2 py-1 text-[11px] text-muted" role="status">
          {storageWarning}
        </p>
      )}

      {/* Pinned Section (ungrouped pins + 1-level Pinned Folders) */}
      {(ungroupedPins.length > 0 || pinnedFolders.length > 0 || creatingFolder) && (
        <div className="flex flex-col gap-0.5 px-0.5 pb-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Pinned
            </span>
            <button
              type="button"
              onClick={() => setCreatingFolder(true)}
              aria-label="Create pinned folder"
              title="New pinned folder"
              className="rounded p-0.5 text-muted hover:bg-ink/[0.05] hover:text-ink"
            >
              <FolderPlus size={12} aria-hidden="true" />
            </button>
          </div>

          {creatingFolder && (
            <form
              className="px-1 py-0.5"
              onSubmit={(event) => {
                event.preventDefault();
                if (folderDraft.trim()) onCreatePinnedFolder(folderDraft.trim());
                setFolderDraft("");
                setCreatingFolder(false);
              }}
            >
              <Input
                autoFocus
                value={folderDraft}
                onChange={(event) => setFolderDraft(event.target.value)}
                onBlur={() => {
                  setCreatingFolder(false);
                  setFolderDraft("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setCreatingFolder(false);
                    setFolderDraft("");
                  }
                }}
                placeholder="Folder name"
                className="h-6 px-1.5 text-xs"
                aria-label="New pinned folder name"
              />
            </form>
          )}

          {pinnedFolders.map((folder) => {
            const folderTabs = folder.tabIds
              .map((id) => tabById.get(id))
              .filter((tab): tab is BrowserNavTabItem => Boolean(tab && tab.pinned));

            return (
              <div key={folder.id} className="flex flex-col gap-0.5">
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div className="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted hover:bg-ink/[0.05] hover:text-ink">
                      <button
                        type="button"
                        onClick={() => onTogglePinnedFolder(folder.id)}
                        className="flex min-w-0 flex-1 items-center gap-1 text-left"
                      >
                        {folder.collapsed ? (
                          <ChevronRight size={12} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={12} aria-hidden="true" />
                        )}
                        <Folder size={12} aria-hidden="true" />
                        {renamingFolderId === folder.id ? (
                          <Input
                            autoFocus
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (renameDraft.trim()) onRenamePinnedFolder(folder.id, renameDraft.trim());
                                setRenamingFolderId(null);
                              } else if (event.key === "Escape") {
                                setRenamingFolderId(null);
                              }
                            }}
                            onBlur={() => setRenamingFolderId(null)}
                            className="h-5 px-1 text-xs"
                            aria-label="Rename pinned folder"
                          />
                        ) : (
                          <span className="truncate font-medium">{folder.name}</span>
                        )}
                      </button>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onSelect={() => {
                        setRenamingFolderId(folder.id);
                        setRenameDraft(folder.name);
                      }}
                    >
                      Rename folder
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onDeletePinnedFolder(folder.id)}>
                      <Trash2 size={13} aria-hidden="true" />
                      Delete folder
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>

                {!folder.collapsed && (
                  <div className="flex flex-col gap-0.5 pl-3">
                    {folderTabs.map((tab) => renderTabRow(tab))}
                  </div>
                )}
              </div>
            );
          })}

          {ungroupedPins.map((tab) => renderTabRow(tab))}
        </div>
      )}

      {/* Tab Group Switcher + Tabs Header */}
      {groups.length > 1 || creatingGroup ? (
        <div className="flex min-h-6 items-center justify-between gap-1 px-0.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {groups.map((group) => {
              const selected = group.id === activeGroupId;
              return (
                <ContextMenu key={group.id}>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onSwitchGroup(group.id)}
                      className={cn(
                        "max-w-[100px] truncate rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                        selected
                          ? "bg-surface text-ink ring-1 ring-inset ring-line/80"
                          : "text-muted hover:bg-ink/[0.05] hover:text-ink",
                      )}
                    >
                      {group.name}
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onSelect={() => {
                        const nextName = window.prompt("Rename tab group", group.name);
                        if (nextName) onRenameGroup(group.id, nextName);
                      }}
                    >
                      Rename group
                    </ContextMenuItem>
                    {groups.length > 1 && (
                      <ContextMenuItem onSelect={() => onDeleteGroup(group.id)}>
                        <Trash2 size={13} aria-hidden="true" />
                        Delete group
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}

            {creatingGroup ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (groupDraft.trim()) onCreateGroup(groupDraft.trim());
                  setGroupDraft("");
                  setCreatingGroup(false);
                }}
              >
                <Input
                  autoFocus
                  value={groupDraft}
                  onChange={(event) => setGroupDraft(event.target.value)}
                  onBlur={() => {
                    setCreatingGroup(false);
                    setGroupDraft("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setCreatingGroup(false);
                      setGroupDraft("");
                    }
                  }}
                  placeholder="Group name"
                  className="h-5 w-24 px-1.5 text-[11px]"
                  aria-label="New group name"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreatingGroup(true)}
                className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-ink/[0.05] hover:text-ink"
              >
                <Plus size={11} aria-hidden="true" />
                <span>Group</span>
              </button>
            )}
          </div>
          <IconButton
            size="xs"
            variant="ghost"
            aria-label="New tab"
            title="New tab · Ctrl+T"
            onClick={onNewTab}
          >
            <Plus size={13} aria-hidden="true" />
          </IconButton>
        </div>
      ) : (
        <div className="flex items-center justify-between px-1.5">
          <span className="text-[11px] font-medium text-muted">Tabs</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setCreatingGroup(true)}
              className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-muted opacity-70 transition-opacity hover:bg-ink/[0.05] hover:text-ink hover:opacity-100"
            >
              <Plus size={10} aria-hidden="true" />
              <span>Group</span>
            </button>
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="New tab"
              title="New tab · Ctrl+T"
              onClick={onNewTab}
            >
              <Plus size={13} aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      )}

      {/* Open Tabs for Active Group */}
      <div className="flex flex-col gap-0.5 px-0.5">
        {openTabs.length === 0 ? (
          <button
            type="button"
            onClick={onNewTab}
            className="flex h-[26px] items-center gap-1.5 rounded-md px-1.5 text-left text-xs text-muted hover:bg-ink/[0.05] hover:text-ink"
          >
            <Plus size={12} aria-hidden="true" />
            <span>New tab</span>
          </button>
        ) : (
          openTabs.map((tab) => renderTabRow(tab))
        )}
      </div>

      {/* Recent Workspaces & Cards */}
      {recentItems.length > 0 && onOpenRecent && (
        <div className="mt-2 flex flex-col gap-0.5 border-t border-line/60 px-0.5 pt-2.5">
          <button
            type="button"
            onClick={() => setRecentCollapsed((prev) => !prev)}
            className="flex items-center gap-1 px-1 py-0.5 text-left text-[11px] font-medium text-muted hover:text-ink"
            aria-expanded={!recentCollapsed}
          >
            {recentCollapsed ? <ChevronRight size={11} aria-hidden="true" /> : <ChevronDown size={11} aria-hidden="true" />}
            <span>Recent</span>
          </button>
          {!recentCollapsed && recentItems.map((item) => {
            const key = item.destination.kind === "workspace"
              ? `ws-${item.destination.workspaceId}`
              : item.destination.kind === "card"
                ? `card-${item.destination.noteId}`
                : `${item.destination.kind}-${item.visitedAt}`;
            return (
              <ContextMenu key={key}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onOpenRecent(item.destination, item.title)}
                    title={item.title}
                    className="flex h-[26px] min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-xs text-ink/80 transition-colors hover:bg-ink/[0.05] hover:text-ink"
                  >
                    <span className="shrink-0 text-muted">
                      <DestinationIcon destination={item.destination} />
                    </span>
                    <span className="truncate">{item.title}</span>
                  </button>
                </ContextMenuTrigger>
                {onOpenRecentInNewTab && (
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => onOpenRecentInNewTab(item.destination, item.title)}>
                      <Plus size={13} aria-hidden="true" />
                      Open in new tab
                    </ContextMenuItem>
                  </ContextMenuContent>
                )}
              </ContextMenu>
            );
          })}
        </div>
      )}
    </section>
  );
}
