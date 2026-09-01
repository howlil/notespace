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
import {
  ArrowLeft,
  Check,
  Circle,
  FileText,
  Layers,
  Link2,
  Loader2,
  RotateCw,
  Unlink,
} from "lucide-react";
import { Sidebar } from "../../app/Sidebar";
import { ThemeToggle, useTheme } from "../../app/theme";
import { contentOf } from "../../domain/project/project";
import type {
  Project,
  ProjectContent,
  ProjectReference,
  ProjectSummary,
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
type ReferenceNotice = {
  referenceId: string;
  message: string;
  broken: boolean;
} | null;

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
  projects,
}: {
  project: Project;
  projects: ProjectSummary[];
}) {
  const { dark } = useTheme();
  const current = useRef<ProjectContent>(contentOf(project));
  const [title, setTitle] = useState(project.title);
  const [ratio, setRatio] = useState(project.splitRatio);
  const [references, setReferences] = useState(project.references);
  const [status, setStatus] = useState<SaveStatus>({ state: "saved" });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [documentFocus, setDocumentFocus] = useState<FocusRequest>(null);
  const [canvasFocus, setCanvasFocus] = useState<FocusRequest>(null);
  const [referenceNotice, setReferenceNotice] =
    useState<ReferenceNotice>(null);
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
    setReferenceNotice(null);
  }, [selectedBlockId, selectedElementId, update]);

  const blockReference = selectedBlockId
    ? references.find((reference) => reference.blockId === selectedBlockId)
    : undefined;
  const elementReference = selectedElementId
    ? references.find((reference) => reference.elementId === selectedElementId)
    : undefined;

  function navigateToCanvas(reference: ProjectReference) {
    if (!canvasHasElement(current.current.canvas, reference.elementId)) {
      setReferenceNotice({
        referenceId: reference.id,
        message:
          "Linked canvas object no longer exists. The reference was kept until you remove it explicitly.",
        broken: true,
      });
      return;
    }
    setCanvasFocus({
      id: reference.elementId,
      request: ++navigationRequest.current,
    });
    setReferenceNotice({
      referenceId: reference.id,
      message: "Linked canvas object selected.",
      broken: false,
    });
  }

  function navigateToDocument(reference: ProjectReference) {
    if (!documentHasBlock(current.current.document, reference.blockId)) {
      setReferenceNotice({
        referenceId: reference.id,
        message:
          "Linked document block no longer exists. The reference was kept until you remove it explicitly.",
        broken: true,
      });
      return;
    }
    setDocumentFocus({
      id: reference.blockId,
      request: ++navigationRequest.current,
    });
    setReferenceNotice({
      referenceId: reference.id,
      message: "Linked document block focused.",
      broken: false,
    });
  }

  function removeReference(referenceId: string) {
    update({
      references: current.current.references.filter(
        (reference) => reference.id !== referenceId,
      ),
    });
    setReferenceNotice(null);
  }

  function resize(value: number) {
    const next = Math.max(0.25, Math.min(0.7, value));
    setRatio(next);
    update({ splitRatio: next });
  }
  return (
    <div className="app-shell workspace-shell">
      <Sidebar
        projects={projects.map((p) =>
          p.id === project.id ? { ...p, title } : p,
        )}
        selected={project.id}
      />
      <main className="workspace-main">
        <header className="topbar workspace-header">
          <div className="workspace-identity">
            <Link to="/" className="icon-button" aria-label="Back to projects">
              <ArrowLeft size={18} />
            </Link>
            <span className="header-divider" />
            <input
              className="title-input"
              aria-label="Project title"
              maxLength={160}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                update({ title: event.target.value });
              }}
            />
          </div>
          <div className="header-actions">
            <button
              className="secondary"
              disabled={!selectedBlockId || !selectedElementId}
              onClick={createReference}
            >
              <Link2 size={14} /> Link selections
            </button>
            {blockReference && (
              <button
                className="secondary"
                onClick={() => navigateToCanvas(blockReference)}
              >
                <Layers size={14} /> Go to canvas
              </button>
            )}
            {elementReference && (
              <button
                className="secondary"
                onClick={() => navigateToDocument(elementReference)}
              >
                <FileText size={14} /> Go to note
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
        {referenceNotice && (
          <div
            className={`reference-notice${referenceNotice.broken ? " reference-broken" : ""}`}
            role={referenceNotice.broken ? "alert" : "status"}
          >
            <span>{referenceNotice.message}</span>
            {referenceNotice.broken && (
              <button
                className="secondary"
                onClick={() => removeReference(referenceNotice.referenceId)}
              >
                <Unlink size={14} /> Remove broken link
              </button>
            )}
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
              <span className="pane-hint">Put it into words</span>
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
              <span className="pane-hint">See the connections</span>
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
      </main>
    </div>
  );
}
