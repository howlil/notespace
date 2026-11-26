import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolderTree, Plus, Search, StickyNote } from "lucide-react";
import type { Workspace } from "../../entities/workspace";
import { NotespaceLogo } from "../../shared/ui/brand/NotespaceLogo";
import { Button, Input, Kbd } from "../../shared/ui";
import { useToast } from "../../shared/ui/feedback/toast-provider";
import { openAppSettings, openQuickOpen } from "../shell/app-shell-store";

type Props = {
  onCreateWorkspace: (title: string) => Promise<Workspace>;
};

export function HomePage({ onCreateWorkspace }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      const workspace = await onCreateWorkspace(trimmed);
      setTitle("");
      setCreating(false);
      await navigate({
        to: "/workspaces/$workspaceId",
        params: { workspaceId: workspace.id },
        search: { noteId: undefined },
      });
    } catch (err) {
      showToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not create workspace.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
      <section className="flex w-full flex-col items-center gap-6" aria-label="Welcome to Notespace">
        <div className="flex flex-col items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl border border-line bg-surface">
            <NotespaceLogo size="md" showWordmark={false} />
          </div>
          <h1 className="m-0 text-[24px] font-semibold tracking-tight text-ink">
            Welcome to Notespace
          </h1>
          <p className="m-0 max-w-md text-[13px] leading-relaxed text-muted">
            Spatial knowledge workspace. Map ideas across nested canvases and connect reusable Markdown cards.
          </p>
        </div>

        {!creating ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              onClick={() => {
                setCreating(true);
                setTitle("");
              }}
            >
              <Plus size={15} aria-hidden="true" />
              <span>Create Workspace</span>
            </Button>
            <Link
              to="/map"
              search={{}}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-xs font-medium text-ink transition-colors hover:border-accent/45 hover:bg-tint hover:text-accent"
            >
              <FolderTree size={14} aria-hidden="true" />
              <span>Workspace Map</span>
            </Link>
            <Link
              to="/cards"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-xs font-medium text-ink transition-colors hover:border-accent/45 hover:bg-tint hover:text-accent"
            >
              <StickyNote size={14} aria-hidden="true" />
              <span>Card Library</span>
            </Link>
          </div>
        ) : (
          <form className="grid w-full max-w-sm gap-2" onSubmit={(event) => void handleSubmit(event)}>
            <Input
              autoFocus
              aria-label="Workspace name"
              placeholder="Workspace name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={loading}
            />
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" type="submit" disabled={!title.trim() || loading}>
                {loading ? "Creating…" : "Create"}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={() => {
                  setCreating(false);
                  setTitle("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs text-muted">
          <button
            type="button"
            onClick={openQuickOpen}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 hover:bg-tint hover:text-ink"
          >
            <Search size={12} aria-hidden="true" />
            <span>Quick Open</span>
            <Kbd tone="surface">⌘K</Kbd>
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => openAppSettings("data")}
            className="rounded px-2 py-1 hover:bg-tint hover:text-ink"
          >
            Restore backup
          </button>
        </div>
      </section>
    </div>
  );
}
