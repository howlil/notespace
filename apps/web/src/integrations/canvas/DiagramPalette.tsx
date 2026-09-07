import {
  Activity,
  AlertTriangle,
  Archive,
  Box,
  Cloud,
  Code2,
  Database,
  Globe2,
  Network,
  Search,
  Server,
  TerminalSquare,
  Workflow,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  filterDiagramCatalog,
  type DiagramCatalogItem,
  type DiagramCategory,
  type DiagramIconKey,
} from "./diagram";

const iconMap = {
  activity: Activity,
  alert: AlertTriangle,
  archive: Archive,
  database: Database,
  server: Server,
  terminal: TerminalSquare,
  code: Code2,
  globe: Globe2,
  cloud: Cloud,
  box: Box,
  network: Network,
  workflow: Workflow,
} satisfies Record<DiagramIconKey, typeof Activity>;

const categories: Array<DiagramCategory | "All"> = ["All", "General", "Tech", "Cloud"];

export default function DiagramPalette({
  onClose,
  onInsert,
  onInsertArchitecture,
  onInsertFlowchart,
}: {
  onClose: () => void;
  onInsert: (item: DiagramCatalogItem) => void;
  onInsertArchitecture: () => void;
  onInsertFlowchart: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DiagramCategory | "All">("All");
  const items = useMemo(
    () => filterDiagramCatalog(query, category === "All" ? undefined : category),
    [category, query],
  );

  return (
    <section
      className="absolute left-3 top-3 z-[5] w-[310px] overflow-hidden rounded-xl border border-line bg-canvas/95 shadow-xl backdrop-blur-md"
      aria-label="Diagram palette"
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-ink">Diagram</h2>
          <p className="text-[11px] text-muted">Insert connected technical shapes.</p>
        </div>
        <button type="button" onClick={onClose} className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink" aria-label="Close diagram palette">
          <X size={15} />
        </button>
      </div>

      <div className="p-3">
        <label className="flex h-8 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 text-muted focus-within:border-accent">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search icons"
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
          />
        </label>

        <div className="mt-2 flex gap-1" aria-label="Diagram icon categories">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-md px-2 py-1 text-[11px] ${category === item ? "bg-active text-ink" : "text-muted hover:bg-hover hover:text-ink"}`}
            >
              {item}
            </button>
          ))}
        </div>

        {!query && category === "All" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={onInsertArchitecture} className="rounded-lg border border-line p-2.5 text-left hover:bg-hover">
              <Network size={16} className="text-accent" />
              <strong className="mt-2 block text-xs font-medium text-ink">Architecture</strong>
              <span className="mt-0.5 block text-[10px] leading-4 text-muted">Frontend → API → data stores</span>
            </button>
            <button type="button" onClick={onInsertFlowchart} className="rounded-lg border border-line p-2.5 text-left hover:bg-hover">
              <Workflow size={16} className="text-accent" />
              <strong className="mt-2 block text-xs font-medium text-ink">Flowchart</strong>
              <span className="mt-0.5 block text-[10px] leading-4 text-muted">Start → process → decision</span>
            </button>
          </div>
        )}

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Components</span>
            <span className="text-[10px] text-muted">{items.length}</span>
          </div>
          <div className="grid max-h-[300px] grid-cols-4 gap-1 overflow-y-auto pr-1">
            {items.map((item) => {
              const Icon = iconMap[item.icon];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onInsert(item)}
                  title={`${item.label} — ${item.description}`}
                  className="group flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-lg border border-line px-1 py-2 text-center hover:border-accent hover:bg-hover"
                >
                  <Icon size={18} className="text-ink" />
                  <span className="w-full truncate text-[10px] text-muted group-hover:text-ink">{item.label}</span>
                </button>
              );
            })}
          </div>
          {items.length === 0 && <p className="py-7 text-center text-xs text-muted">No matching components.</p>}
        </div>
      </div>
    </section>
  );
}
