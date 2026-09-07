export type DiagramCategory = "General" | "Tech" | "Cloud";

export type DiagramIconKey =
  | "activity"
  | "alert"
  | "archive"
  | "database"
  | "server"
  | "terminal"
  | "code"
  | "globe"
  | "cloud"
  | "box"
  | "network"
  | "workflow";

export type DiagramCatalogItem = {
  id: string;
  label: string;
  description: string;
  category: DiagramCategory;
  icon: DiagramIconKey;
  nodeLabel: string;
};

export type DiagramSkeleton = {
  id?: string;
  type: "rectangle" | "ellipse" | "diamond" | "arrow";
  x: number;
  y: number;
  width?: number;
  height?: number;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  fillStyle?: "solid";
  roughness?: number;
  label?: { text: string; fontSize?: number; strokeColor?: string };
  start?: { id: string };
  end?: { id: string };
};

export const diagramCatalog: DiagramCatalogItem[] = [
  { id: "activity", label: "Activity", description: "Process or runtime activity", category: "General", icon: "activity", nodeLabel: "Activity" },
  { id: "alert", label: "Alert", description: "Warning, incident, or guardrail", category: "General", icon: "alert", nodeLabel: "Alert" },
  { id: "archive", label: "Archive", description: "Stored or retained data", category: "General", icon: "archive", nodeLabel: "Archive" },
  { id: "service", label: "Service", description: "Application or backend service", category: "General", icon: "box", nodeLabel: "Service" },
  { id: "database", label: "Database", description: "Persistent datastore", category: "General", icon: "database", nodeLabel: "Database" },
  { id: "network", label: "Network", description: "Network boundary or transport", category: "General", icon: "network", nodeLabel: "Network" },
  { id: "api", label: "API", description: "HTTP or RPC interface", category: "Tech", icon: "server", nodeLabel: "API" },
  { id: "frontend", label: "Frontend", description: "Web or client application", category: "Tech", icon: "globe", nodeLabel: "Frontend" },
  { id: "worker", label: "Worker", description: "Background worker or consumer", category: "Tech", icon: "workflow", nodeLabel: "Worker" },
  { id: "cli", label: "CLI", description: "Command-line component", category: "Tech", icon: "terminal", nodeLabel: "CLI" },
  { id: "code", label: "Code", description: "Library or code module", category: "Tech", icon: "code", nodeLabel: "Code" },
  { id: "postgres", label: "PostgreSQL", description: "Relational database", category: "Tech", icon: "database", nodeLabel: "PostgreSQL" },
  { id: "redis", label: "Redis", description: "Cache or in-memory store", category: "Tech", icon: "database", nodeLabel: "Redis" },
  { id: "kubernetes", label: "Kubernetes", description: "Container orchestration", category: "Tech", icon: "network", nodeLabel: "Kubernetes" },
  { id: "aws", label: "AWS", description: "Amazon Web Services", category: "Cloud", icon: "cloud", nodeLabel: "AWS" },
  { id: "gcp", label: "Google Cloud", description: "Google Cloud Platform", category: "Cloud", icon: "cloud", nodeLabel: "Google Cloud" },
  { id: "azure", label: "Azure", description: "Microsoft Azure", category: "Cloud", icon: "cloud", nodeLabel: "Azure" },
  { id: "cloud-service", label: "Cloud Service", description: "Generic managed cloud service", category: "Cloud", icon: "cloud", nodeLabel: "Cloud Service" },
];

export function filterDiagramCatalog(query: string, category?: DiagramCategory) {
  const normalized = query.trim().toLowerCase();
  return diagramCatalog.filter((item) => {
    if (category && item.category !== category) return false;
    if (!normalized) return true;
    return `${item.label} ${item.description} ${item.category}`.toLowerCase().includes(normalized);
  });
}

function node(id: string, label: string, x: number, y: number): DiagramSkeleton {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: 176,
    height: 72,
    backgroundColor: "transparent",
    strokeWidth: 1,
    fillStyle: "solid",
    roughness: 0,
    label: { text: label, fontSize: 18 },
  };
}

function arrow(id: string, startId: string, endId: string, x: number, y: number, width = 120): DiagramSkeleton {
  return {
    id,
    type: "arrow",
    x,
    y,
    width,
    height: 0,
    strokeWidth: 1,
    roughness: 0,
    start: { id: startId },
    end: { id: endId },
  };
}

export function buildDiagramNode(item: DiagramCatalogItem, origin: { x: number; y: number }, id: string): DiagramSkeleton[] {
  return [node(id, item.nodeLabel, origin.x, origin.y)];
}

export function buildArchitectureTemplate(origin: { x: number; y: number }, prefix: string): DiagramSkeleton[] {
  const frontend = `${prefix}-frontend`;
  const api = `${prefix}-api`;
  const database = `${prefix}-database`;
  const cache = `${prefix}-cache`;
  return [
    node(frontend, "Frontend", origin.x, origin.y),
    node(api, "API", origin.x + 290, origin.y),
    node(database, "PostgreSQL", origin.x + 580, origin.y - 72),
    node(cache, "Redis", origin.x + 580, origin.y + 72),
    arrow(`${prefix}-frontend-api`, frontend, api, origin.x + 176, origin.y + 36, 114),
    arrow(`${prefix}-api-db`, api, database, origin.x + 466, origin.y + 20, 114),
    arrow(`${prefix}-api-cache`, api, cache, origin.x + 466, origin.y + 52, 114),
  ];
}

export function buildFlowchartTemplate(origin: { x: number; y: number }, prefix: string): DiagramSkeleton[] {
  const start = `${prefix}-start`;
  const process = `${prefix}-process`;
  const decision = `${prefix}-decision`;
  const done = `${prefix}-done`;
  return [
    { ...node(start, "Start", origin.x, origin.y), type: "ellipse", width: 150 },
    node(process, "Process", origin.x + 250, origin.y),
    { ...node(decision, "Decision", origin.x + 520, origin.y), type: "diamond", width: 150, height: 90 },
    { ...node(done, "Done", origin.x + 790, origin.y), type: "ellipse", width: 150 },
    arrow(`${prefix}-start-process`, start, process, origin.x + 150, origin.y + 36, 100),
    arrow(`${prefix}-process-decision`, process, decision, origin.x + 426, origin.y + 36, 94),
    arrow(`${prefix}-decision-done`, decision, done, origin.x + 670, origin.y + 45, 120),
  ];
}
