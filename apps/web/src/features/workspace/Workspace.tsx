import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  Check,
  Circle,
  FileText,
  Layers,
  Link2,
  Loader2,
  Pencil,
  RotateCw,
  Unlink,
} from "lucide-react";
import { ThemeToggle, useTheme } from "../../app/theme";
import { contentOf } from "../../domain/project/project";
import type {
  Project,
  ProjectContent,
  ProjectReference,
  Snapshot,
} from "../../domain/project/project";
import { saveProject } from "../../domain/project/api";
import { Autosave } from "../../domain/project/autosave";
import type { SaveStatus } from "../../domain/project/autosave";

const DocumentEditor = lazy(
  () => import("../../integrations/document/DocumentEditor"),
);
const CanvasEditor = lazy(
  () => import("../../integrations/canvas/CanvasEditor"),
);

type FocusRequest = { id: string; request: number } | null;
type BrokenReference = { referenceId: string; message: string } | null;

function documentHasBlock(snapshot: Snapshot, blockId: string) {
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(visit);
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    const attrs = record.attrs;
    if (
      attrs &&
      typeof attrs === "object" &&
      (attrs as Record<string, unknown>).blockId === blockId
    )
      return true;
    return Object.values(record).some(visit);
  };
  return visit(snapshot.data);
}

function canvasHasElement(snapshot: Snapshot, elementId: string) {
  const elements = snapshot.data.elements;
  if (!Array.isArray(elements)) return false;
  return elements.some((value) => {
    if (!value || typeof value !== "object") return false;
    const element = value as Record<string, unknown>;
    return element.id === elementId && element.isDeleted !== true;
  });
}

class EditorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="editor-loading" role="alert">
        This editor could not open. Your stored content is preserved. Reload to
        retry.
      </div>
    ) : (
      this.props.children
    );
  }
}

export function Workspace({
  project,
}: {
  project: Project;
}) {
  const { dark } = useTheme();
  const current = useRef<ProjectContent>(contentOf(project));
  const [ratio, setRatio] = useState(project.splitRatio);
  const [references, setReferences] = useState(project.references);
  const [status, setStatus] = useState<SaveStatus>({ state: "saved" });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [documentFocus, setDocumentFocus] = useState<FocusRequest>(null);
  const [canvasFocus, setCanvasFocus] = useState<FocusRequest>(null);
  const [brokenReference, setBrokenReference] =
    useState<BrokenReference>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState(project.title);
  const [renameError, setRenameError] = useState("");
  const navigationRequest = useRef(0);
  const [saver] = useState(
    () =>
      new Autosave(project.version, (value: ProjectContent, version) =>
        saveProject(project.id, value, version),
      ),
  );
  const split = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  useEffect(() => saver.subscribe(setStatus), [saver]);
  useBlocker({
    shouldBlockFn: async () => {
      try {
        await saver.flush();
        return false;
      } catch {
        return true;
      }
    },
    enableBeforeUnload: () => saver.dirty,
  });
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden")
        void saver.flush().catch(() => {});
    };
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      void saver.flush().catch(() => {});
    };
  }, [saver]);

  const update = useCallback(
    (patch: Partial<ProjectContent>) => {
      current.current = { ...current.current, ...patch };
      if (patch.references !== undefined) setReferences(patch.references);
      saver.schedule(current.current);
    },
    [saver],
  );
  const updateDocument = useCallback(
    (document: Snapshot) => update({ document }),
    [update],
  );
  const updateCanvas = useCallback(
    (canvas: Snapshot) => update({ canvas }),
    [update],
  );
  const createReference = useCallback(() => {
    if (!selectedBlockId || !selectedElementId) return;
    if (
      current.current.references.some(
        (reference) =>
          reference.blockId === selectedBlockId &&
          reference.elementId === selectedElementId,
      )
    )
      return;
    update({
      references: [
        ...current.current.references,
        {
          id: crypto.randomUUID(),
          blockId: selectedBlockId,
          elementId: selectedElementId,
        },
      ],
    });
    setBrokenReference(null);
  }, [selectedBlockId, selectedElementId, update]);

  const blockReference = selectedBlockId
    ? references.find((reference) => reference.blockId === selectedBlockId)
    : undefined;
  const elementReference = selectedElementId
    ? references.find((reference) => reference.elementId === selectedElementId)
    : undefined;

  function navigateToCanvas(reference: ProjectReference) {
    if (!canvasHasElement(current.current.canvas, reference.elementId)) {
      setBrokenReference({
        referenceId: reference.id,
        message:
          "Linked canvas object no longer exists. The reference was kept until you remove it explicitly.",
      });
      return;
    }
    setBrokenReference(null);
    setCanvasFocus({
      id: reference.elementId,
      request: ++navigationRequest.current,
    });
  }

  function navigateToDocument(reference: ProjectReference) {
    if (!documentHasBlock(current.current.document, reference.blockId)) {
      setBrokenReference({
        referenceId: reference.id,
        message:
          "Linked document block no longer exists. The reference was kept until you remove it explicitly.",
      });
      return;
    }
    setBrokenReference(null);
    setDocumentFocus({
      id: reference.blockId,
      request: ++navigationRequest.current,
    });
  }

  function removeReference(referenceId: string) {
    update({
      references: current.current.references.filter(
        (reference) => reference.id !== referenceId,
      ),
    });
    setBrokenReference(null);
  }

  function resize(value: number) {
    const next = Math.max(0.25, Math.min(0.7, value));
    setRatio(next);
    update({ splitRatio: next });
  }
  async function renameWorkspace(event: React.FormEvent) {
    event.preventDefault();
    const next = renameTitle.trim();
    if (!next || next === project.title) { setRenameOpen(false); return; }
    update({ title: next });
    setRenameOpen(false);
  }
  return (
    <div className="workspace-shell">
      <main className="workspace-main">
        <header className="topbar workspace-header">
          <div className="workspace-identity">
            <Link to="/" className="icon-button" aria-label="Back to library">
              <ArrowLeft size={18} />
            </Link>
            <span className="header-divider" />
            <button className="workspace-title-button" onClick={() => { setRenameTitle(current.current.title); setRenameError(""); setRenameOpen(true); }} title="Rename workspace"><span className="workspace-title">{current.current.title}</span><Pencil size={13} /></button>
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="Link selections"
              title="Link selected document block and canvas object"
              disabled={!selectedBlockId || !selectedElementId}
              onClick={createReference}
            >
              <Link2 size={16} />
            </button>
            {blockReference && (
              <button
                className="icon-button"
                aria-label="Go to linked canvas object"
                title="Go to linked canvas object"
                onClick={() => navigateToCanvas(blockReference)}
              >
                <Layers size={16} />
              </button>
            )}
            {elementReference && (
              <button
                className="icon-button"
                aria-label="Go to linked document block"
                title="Go to linked document block"
                onClick={() => navigateToDocument(elementReference)}
              >
                <FileText size={16} />
              </button>
            )}
            <span
              className={`save-status status-${status.state}`}
              role="status"
              aria-live="polite"
            >
              {status.state === "saved" ? (
                <Check size={14} />
              ) : status.state === "saving" ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Circle size={10} />
              )}
              {status.state === "saved"
                ? "All changes saved"
                : status.state === "saving"
                  ? "Saving…"
                  : status.state === "error"
                    ? "Not saved"
                    : "Unsaved changes"}
            </span>
            <ThemeToggle />
          </div>
        </header>
        {status.state === "error" && (
          <div className="save-error" role="alert">
            <span>{status.message}</span>
            <button
              className="secondary"
              onClick={() => void saver.flush().catch(() => {})}
            >
              <RotateCw size={14} />
              Retry save
            </button>
          </div>
        )}
        {brokenReference && (
          <div className="save-error" role="alert">
            <span>{brokenReference.message}</span>
            <button
              className="secondary"
              onClick={() => removeReference(brokenReference.referenceId)}
            >
              <Unlink size={14} /> Remove broken link
            </button>
          </div>
        )}
        <div
          className="workspace-split"
          ref={split}
          style={{
            gridTemplateColumns: `minmax(0, ${ratio}fr) 7px minmax(0, ${1 - ratio}fr)`,
          }}
        >
          <section className="document-pane" aria-label="Document pane">
            <div className="pane-label">
              <FileText size={15} />
              <span>DOCUMENT</span>
              <span className="pane-hint">Write clearly</span>
            </div>
            <EditorBoundary>
              <Suspense
                fallback={
                  <div className="editor-loading">Opening document…</div>
                }
              >
                <DocumentEditor
                  initial={project.document}
                  onChange={updateDocument}
                  onBlockSelect={setSelectedBlockId}
                  focusRequest={documentFocus}
                />
              </Suspense>
            </EditorBoundary>
            <div className="document-footer">
              <span>Space to think out loud.</span>
              <span>Document + Canvas</span>
            </div>
          </section>
          <div
            role="separator"
            tabIndex={0}
            aria-label="Resize document and canvas"
            aria-orientation="vertical"
            aria-valuemin={25}
            aria-valuemax={70}
            aria-valuenow={Math.round(ratio * 100)}
            className="splitter"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                resize(ratio + (event.key === "ArrowLeft" ? -0.025 : 0.025));
              }
              if (event.key === "Home") {
                event.preventDefault();
                resize(0.45);
              }
            }}
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (dragging.current && split.current) {
                const bounds = split.current.getBoundingClientRect();
                resize((event.clientX - bounds.left) / bounds.width);
              }
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
            onDoubleClick={() => resize(0.45)}
          >
            <span />
          </div>
          <section className="canvas-pane" aria-label="Canvas pane">
            <div className="pane-label">
              <Layers size={15} />
              <span>CANVAS</span>
              <span className="pane-hint">Map the connections</span>
            </div>
            <EditorBoundary>
              <Suspense
                fallback={<div className="editor-loading">Opening canvas…</div>}
              >
                <CanvasEditor
                  initial={project.canvas}
                  onChange={updateCanvas}
                  onElementSelect={setSelectedElementId}
                  focusRequest={canvasFocus}
                  dark={dark}
                />
              </Suspense>
            </EditorBoundary>
          </section>
        </div>
        <Dialog.Root open={renameOpen} onOpenChange={setRenameOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content create-dialog"><Dialog.Title>Rename workspace</Dialog.Title><Dialog.Description>Give this workspace a name you will recognize later.</Dialog.Description><form onSubmit={renameWorkspace}><input className="seamless-input" aria-label="Workspace title" autoFocus autoComplete="off" maxLength={160} required value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} /><p className="form-error" role="alert">{renameError}</p><div className="dialog-actions"><Dialog.Close className="secondary">Cancel</Dialog.Close><button className="primary" disabled={!renameTitle.trim()}>Save workspace</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
      </main>
    </div>
  );
}
