import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Tag as TagIcon, Trash2, X } from "lucide-react";
import {
  createTag,
  deleteTag,
  listTags,
  renameTag,
  type Tag,
} from "../../platform/api/tag-api";
import {
  AnchoredPopover,
  Button,
  Input,
  cn,
} from "../../shared/ui";

export type TagPickerChipsProps = {
  tags: Tag[];
  onAssignTag: (tag: Tag) => void | Promise<void>;
  onRemoveTag: (tagId: string) => void | Promise<void>;
  onClickTag?: (tag: Tag) => void;
  availableTags?: Tag[];
  onTagsChanged?: () => void;
  compact?: boolean;
};

export function TagPickerChips({
  tags,
  onAssignTag,
  onRemoveTag,
  onClickTag,
  availableTags,
  onTagsChanged,
  compact = false,
}: TagPickerChipsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allTags, setAllTags] = useState<Tag[]>(availableTags ?? []);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (availableTags) {
      setAllTags(availableTags);
    }
  }, [availableTags]);

  const refreshTags = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const loaded = await listTags();
      setAllTags(loaded);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load tags.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setQuery("");
      setEditingTagId(null);
      setErrorMessage(null);
      return;
    }
    void refreshTags();
  }, [open]);

  const assignedIds = useMemo(() => new Set(tags.map((tag) => tag.id)), [tags]);

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTags;
    return allTags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [allTags, query]);

  const trimmedQuery = query.trim();
  const exactMatchExists = useMemo(() => {
    const normalized = trimmedQuery.toLowerCase();
    return Boolean(
      normalized
      && allTags.some((tag) => tag.name.trim().toLowerCase() === normalized || tag.normalizedKey === normalized),
    );
  }, [allTags, trimmedQuery]);

  const handleToggleTag = async (tag: Tag) => {
    setBusyId(tag.id);
    setErrorMessage(null);
    try {
      if (assignedIds.has(tag.id)) {
        await onRemoveTag(tag.id);
      } else {
        await onAssignTag(tag);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update tag.");
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateTag = async () => {
    if (!trimmedQuery || exactMatchExists) return;
    setBusyId("__create__");
    setErrorMessage(null);
    try {
      const created = await createTag(trimmedQuery);
      setAllTags((prev) => (prev.some((t) => t.id === created.id) ? prev : [...prev, created]));
      setQuery("");
      await onAssignTag(created);
      onTagsChanged?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create tag.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRenameSubmit = async (tagId: string) => {
    const nextName = editingName.trim();
    if (!nextName) {
      setEditingTagId(null);
      return;
    }
    setBusyId(tagId);
    setErrorMessage(null);
    try {
      const updated = await renameTag(tagId, nextName);
      setAllTags((prev) => prev.map((t) => (t.id === tagId ? updated : t)));
      setEditingTagId(null);
      onTagsChanged?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not rename tag.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    setBusyId(tagId);
    setErrorMessage(null);
    try {
      await deleteTag(tagId);
      setAllTags((prev) => prev.filter((t) => t.id !== tagId));
      if (assignedIds.has(tagId)) {
        await onRemoveTag(tagId);
      }
      onTagsChanged?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete tag.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-tag-picker-chips="">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-line bg-tint/55 text-ink",
            compact ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs",
          )}
        >
          {onClickTag ? (
            <button
              type="button"
              className="truncate font-medium text-ink hover:text-accent focus-visible:outline-none"
              onClick={() => onClickTag(tag)}
            >
              #{tag.name}
            </button>
          ) : (
            <span className="truncate font-medium">#{tag.name}</span>
          )}
          <button
            type="button"
            aria-label={`Remove tag ${tag.name}`}
            className="inline-flex size-3.5 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
            onClick={() => void onRemoveTag(tag.id)}
          >
            <X size={10} aria-hidden="true" />
          </button>
        </span>
      ))}

      <Button
        ref={addButtonRef}
        type="button"
        size="xs"
        variant="ghost"
        className="h-6 rounded-md border border-dashed border-line px-2 text-xs text-muted hover:border-accent hover:text-ink"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <Plus size={11} aria-hidden="true" />
        <span>Add tag</span>
      </Button>

      <AnchoredPopover
        open={open}
        anchorRef={addButtonRef}
        onClose={() => setOpen(false)}
        width={256}
        height={280}
        preferredAxis="vertical"
        horizontalAlignment="start"
        aria-label="Manage tags"
        className="w-[256px] max-h-[280px] p-2"
      >
        <div className="space-y-2">
          <Input
            inputSize="sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search or create tag…"
            aria-label="Search or create tag"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter" && trimmedQuery && !exactMatchExists) {
                event.preventDefault();
                void handleCreateTag();
              }
            }}
          />

          {errorMessage && (
            <p className="m-0 text-2xs text-danger">{errorMessage}</p>
          )}

          {trimmedQuery && !exactMatchExists && (
            <Button
              type="button"
              size="xs"
              variant="secondary"
              className="w-full justify-start"
              disabled={busyId === "__create__"}
              onClick={() => void handleCreateTag()}
            >
              <Plus size={12} aria-hidden="true" />
              <span className="truncate">Create “#{trimmedQuery}”</span>
            </Button>
          )}

          <div className="max-h-[180px] space-y-0.5 overflow-y-auto no-scrollbar">
            {loading && allTags.length === 0 ? (
              <p className="m-0 py-3 text-center text-xs text-muted">Loading tags…</p>
            ) : filteredTags.length === 0 ? (
              <p className="m-0 py-3 text-center text-xs text-muted">
                {trimmedQuery ? "No matching tags" : "No tags yet"}
              </p>
            ) : (
              filteredTags.map((tag) => {
                const isAssigned = assignedIds.has(tag.id);
                const isEditing = editingTagId === tag.id;
                const isBusy = busyId === tag.id;

                if (isEditing) {
                  return (
                    <div key={tag.id} className="flex items-center gap-1 px-1 py-0.5">
                      <Input
                        inputSize="sm"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        aria-label={`Rename tag ${tag.name}`}
                        className="h-6 text-xs"
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleRenameSubmit(tag.id);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            setEditingTagId(null);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        disabled={isBusy}
                        aria-label="Save tag name"
                        onClick={() => void handleRenameSubmit(tag.id)}
                      >
                        <Check size={12} aria-hidden="true" />
                      </Button>
                    </div>
                  );
                }

                return (
                  <div
                    key={tag.id}
                    className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-tint/60"
                  >
                    <button
                      type="button"
                      disabled={isBusy}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-ink"
                      onClick={() => void handleToggleTag(tag)}
                    >
                      <TagIcon size={11} className="shrink-0 text-muted" aria-hidden="true" />
                      <span className="truncate font-medium">#{tag.name}</span>
                      {isAssigned && (
                        <Check size={12} className="ml-auto shrink-0 text-accent" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      aria-label={`Rename tag ${tag.name}`}
                      className="hidden size-5 items-center justify-center rounded text-muted hover:bg-surface hover:text-ink group-hover:inline-flex"
                      onClick={() => {
                        setEditingTagId(tag.id);
                        setEditingName(tag.name);
                      }}
                    >
                      <Pencil size={11} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      aria-label={`Delete tag ${tag.name}`}
                      className="hidden size-5 items-center justify-center rounded text-muted hover:bg-surface hover:text-danger group-hover:inline-flex"
                      onClick={() => void handleDeleteTag(tag.id)}
                    >
                      <Trash2 size={11} aria-hidden="true" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </AnchoredPopover>
    </div>
  );
}
