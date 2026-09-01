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
  Loader2,
  RotateCw,
} from "lucide-react";
import { Sidebar } from "../../app/Sidebar";
import { ThemeToggle, useTheme } from "../../app/theme";
import { contentOf } from "../../domain/project/project";
import type {
  Project,
  ProjectContent,
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
  const [status, setStatus] = useState<SaveStatus>({ state: "saved" });
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
