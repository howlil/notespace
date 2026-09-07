import {
  Archive,
  Boxes,
  Braces,
  Circle,
  Cloud,
  Code2,
  Database,
  Diamond,
  GitBranch,
  Globe2,
  Layers3,
  Link2,
  List,
  Network,
  Search,
  Server,
  Square,
  Unlink,
  User,
  Wand2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button, IconButton, Input } from "../../components/ui";
import {
  searchDiagramCatalog,
  type DiagramCatalogItem,
  type DiagramCategory,
  type DiagramKind,
} from "./diagram-model";

const iconByKey: Record<string, LucideIcon> = {
  archive: Archive,
  boxes: Boxes,
  braces: Braces,
  circle: Circle,
  cloud: Cloud,
  code: Code2,
  database: Database,
  diamond: Diamond,
  git: GitBranch,
  globe: Globe2,
  layers: Layers3,
  list: List,
  server: Server,
  square: Square,
  user: User,
  zap: Zap,
};

const categories: readonly { id: DiagramCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "general", label: "General" },
  { id: "tech", label: "Tech" },
  { id: "aws", label: "AWS" },
  { id: "gcp", label: "GCP" },
  { id: "azure", label: "Azure" },
];

interface Props {
  open: boolean;
  kind: DiagramKind;
  activeDiagram: boolean;
  selectedNodeCount: number;
  onKindChange: (kind: DiagramKind) => void;
  onCreateStarter: (kind: DiagramKind) => void;
  onInsertNode: (item: DiagramCatalogItem) => void;
  onConnect: () => void;
  onGroup: () => void;
  onAutoLayout: () => void;
  onDetach: () => void;
  onClose: () => void;
}

export function DiagramPalette({
  open,
  kind,
  activeDiagram,
  selectedNodeCount,
  onKindChange,
  onCreateStarter,
  onInsertNode,
  onConnect,
  onGroup,
  onAutoLayout,
  onDetach,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DiagramCategory | "all">("all");
  const items = useMemo(() => searchDiagramCatalog(query, category), [query, category]);

  if (!open) return null;

  return (
    <aside
      className="absolute top-12 right-3 z-[20] flex max-h-[min(620px,calc(100%-60px))] w-[292px] flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-[0_16px_44px_#0002]"
      aria-label="Diagram tools"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-3 py-2.5">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold"><Network size={14} className="text-accent" /> Diagram</div>
          <p className="mt-0.5 mb-0 text-[10px] leading-4 text-muted">Structured nodes, native Excalidraw output.</p>
        </div>
        <IconButton aria-label="Close diagram tools" title="Close" className="size-7" onClick={onClose}><X size={13} /></IconButton>
      </header>

      <div className="grid grid-cols-2 gap-1 border-b border-line p-2">
        <button
          type="button"
          className={`min-h-8 rounded-md border px-2 text-[10px] font-medium transition-colors ${kind === "architecture" ? "border-accent bg-tint text-ink" : "border-line bg-surface text-muted hover:text-ink"}`}
          onClick={() => onKindChange("architecture")}
        >
          Architecture
        </button>
        <button
          type="button"
          className={`min-h-8 rounded-md border px-2 text-[10px] font-medium transition-colors ${kind === "flowchart" ? "border-accent bg-tint text-ink" : "border-line bg-surface text-muted hover:text-ink"}`}
          onClick={() => onKindChange("flowchart")}
        >
          Flowchart
        </button>
        <Button variant="secondary" size="sm" className="col-span-2 mt-1" onClick={() => onCreateStarter(kind)}>
          <Wand2 size={12} /> New {kind === "architecture" ? "architecture" : "flowchart"} starter
        </Button>
      </div>

      <div className="border-b border-line p-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search icons and components"
            aria-label="Search diagram components"
            className="pl-8"
          />
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-medium transition-colors ${category === item.id ? "border-accent bg-tint text-ink" : "border-line bg-surface text-muted hover:text-ink"}`}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length ? (
          <div className="grid grid-cols-4 gap-1.5">
            {items.map((item) => {
              const Icon = iconByKey[item.iconKey] ?? Square;
              return (
                <button
                  key={item.key}
                  type="button"
                  className="group flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-line bg-surface px-1 text-center transition-colors hover:border-accent hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent"
                  title={`Insert ${item.label}`}
                  aria-label={`Insert ${item.label}`}
                  onClick={() => onInsertNode(item)}
                >
                  <Icon size={18} strokeWidth={1.6} className="text-ink" />
                  <span className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-[8px] text-muted group-hover:text-ink">{item.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-24 place-items-center px-4 text-center text-[10px] leading-4 text-muted">No diagram component matches this search.</div>
        )}
      </div>

      {activeDiagram && (
        <footer className="border-t border-line p-2">
          <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[.08em] text-muted">Selected diagram</div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="secondary" size="sm" disabled={selectedNodeCount !== 2} title="Select exactly two diagram nodes" onClick={onConnect}>
              <Link2 size={11} /> Connect
            </Button>
            <Button variant="secondary" size="sm" disabled={selectedNodeCount < 2} title="Select two or more diagram nodes" onClick={onGroup}>
              <Boxes size={11} /> Group
            </Button>
            <Button variant="secondary" size="sm" onClick={onAutoLayout}>
              <Layers3 size={11} /> Auto layout
            </Button>
            <Button variant="ghost" size="sm" title="Keep native shapes but stop structured diagram management" onClick={onDetach}>
              <Unlink size={11} /> Detach
            </Button>
          </div>
        </footer>
      )}
    </aside>
  );
}
