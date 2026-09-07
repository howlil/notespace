export type DiagramKind = "architecture" | "flowchart";
export type DiagramCategory = "general" | "tech" | "aws" | "gcp" | "azure";
export type DiagramNodeShape = "rectangle" | "diamond" | "ellipse";

export interface DiagramCatalogItem {
  key: string;
  label: string;
  category: DiagramCategory;
  glyph: string;
  iconKey: string;
  shape?: DiagramNodeShape;
  keywords: readonly string[];
}

export interface DiagramNode {
  id: string;
  specKey: string;
  label: string;
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  groupId?: string;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  elementId: string;
}

export interface DiagramGroup {
  id: string;
  label: string;
  elementId: string;
  nodeIds: string[];
}

export interface StructuredDiagram {
  id: string;
  kind: DiagramKind;
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
}

export interface DiagramSelection {
  diagramId: string | null;
  nodeIds: string[];
}

export interface ElementGeometry {
  id: string;
  isDeleted?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  containerId?: string | null;
  boundElements?: readonly { id: string; type: string }[] | null;
}

export const DIAGRAM_DATA_KEY = "notespaceDiagrams";
export const NODE_WIDTH = 164;
export const NODE_HEIGHT = 72;

export const diagramCatalog: readonly DiagramCatalogItem[] = [
  { key: "process", label: "Process", category: "general", glyph: "□", iconKey: "square", shape: "rectangle", keywords: ["step", "task", "flow"] },
  { key: "decision", label: "Decision", category: "general", glyph: "◇", iconKey: "diamond", shape: "diamond", keywords: ["branch", "condition", "flow"] },
  { key: "start", label: "Start / End", category: "general", glyph: "○", iconKey: "circle", shape: "ellipse", keywords: ["terminator", "flow"] },
  { key: "database", label: "Database", category: "general", glyph: "DB", iconKey: "database", keywords: ["storage", "sql", "data"] },
  { key: "browser", label: "Browser", category: "general", glyph: "WEB", iconKey: "globe", keywords: ["client", "frontend", "web"] },
  { key: "server", label: "Server", category: "general", glyph: "API", iconKey: "server", keywords: ["backend", "service", "api"] },
  { key: "queue", label: "Queue", category: "general", glyph: "MQ", iconKey: "list", keywords: ["message", "broker", "async"] },
  { key: "user", label: "User", category: "general", glyph: "USR", iconKey: "user", keywords: ["actor", "person"] },

  { key: "react", label: "React", category: "tech", glyph: "⚛", iconKey: "code", keywords: ["frontend", "javascript", "typescript"] },
  { key: "nodejs", label: "Node.js", category: "tech", glyph: "JS", iconKey: "braces", keywords: ["javascript", "backend", "runtime"] },
  { key: "go", label: "Go", category: "tech", glyph: "Go", iconKey: "code", keywords: ["golang", "backend", "service"] },
  { key: "postgresql", label: "PostgreSQL", category: "tech", glyph: "PG", iconKey: "database", keywords: ["postgres", "sql", "database"] },
  { key: "redis", label: "Redis", category: "tech", glyph: "R", iconKey: "layers", keywords: ["cache", "database", "memory"] },
  { key: "docker", label: "Docker", category: "tech", glyph: "D", iconKey: "boxes", keywords: ["container", "runtime"] },
  { key: "kubernetes", label: "Kubernetes", category: "tech", glyph: "K8s", iconKey: "boxes", keywords: ["cluster", "container", "orchestration"] },
  { key: "github", label: "GitHub", category: "tech", glyph: "GH", iconKey: "git", keywords: ["git", "repository", "source"] },

  { key: "aws", label: "AWS", category: "aws", glyph: "AWS", iconKey: "cloud", keywords: ["amazon", "cloud"] },
  { key: "aws-lambda", label: "Lambda", category: "aws", glyph: "λ", iconKey: "zap", keywords: ["serverless", "function"] },
  { key: "aws-ec2", label: "EC2", category: "aws", glyph: "EC2", iconKey: "server", keywords: ["compute", "vm", "instance"] },
  { key: "aws-s3", label: "S3", category: "aws", glyph: "S3", iconKey: "archive", keywords: ["storage", "object", "bucket"] },
  { key: "aws-rds", label: "RDS", category: "aws", glyph: "RDS", iconKey: "database", keywords: ["database", "sql"] },
  { key: "aws-dynamodb", label: "DynamoDB", category: "aws", glyph: "DDB", iconKey: "database", keywords: ["nosql", "database"] },

  { key: "gcp", label: "Google Cloud", category: "gcp", glyph: "GCP", iconKey: "cloud", keywords: ["google", "cloud"] },
  { key: "gcp-run", label: "Cloud Run", category: "gcp", glyph: "RUN", iconKey: "boxes", keywords: ["serverless", "container"] },
  { key: "gcp-compute", label: "Compute Engine", category: "gcp", glyph: "GCE", iconKey: "server", keywords: ["compute", "vm"] },
  { key: "gcp-storage", label: "Cloud Storage", category: "gcp", glyph: "GCS", iconKey: "archive", keywords: ["storage", "bucket", "object"] },
  { key: "gcp-bigquery", label: "BigQuery", category: "gcp", glyph: "BQ", iconKey: "database", keywords: ["warehouse", "analytics", "sql"] },
  { key: "gcp-pubsub", label: "Pub/Sub", category: "gcp", glyph: "PS", iconKey: "list", keywords: ["queue", "message", "event"] },

  { key: "azure", label: "Azure", category: "azure", glyph: "AZ", iconKey: "cloud", keywords: ["microsoft", "cloud"] },
  { key: "azure-functions", label: "Functions", category: "azure", glyph: "ƒ", iconKey: "zap", keywords: ["serverless", "function"] },
  { key: "azure-app-service", label: "App Service", category: "azure", glyph: "APP", iconKey: "server", keywords: ["web", "service", "compute"] },
  { key: "azure-blob", label: "Blob Storage", category: "azure", glyph: "BLOB", iconKey: "archive", keywords: ["storage", "object"] },
  { key: "azure-sql", label: "Azure SQL", category: "azure", glyph: "SQL", iconKey: "database", keywords: ["database", "sql"] },
  { key: "azure-cosmos", label: "Cosmos DB", category: "azure", glyph: "CDB", iconKey: "database", keywords: ["nosql", "database"] },
] as const;

export type IdFactory = (prefix: string) => string;

export function makeDiagramId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function searchDiagramCatalog(query: string, category: DiagramCategory | "all" = "all") {
  const normalized = query.trim().toLowerCase();
  return diagramCatalog.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (!normalized) return true;
    return [item.label, item.key, item.category, ...item.keywords].some((value) => value.toLowerCase().includes(normalized));
  });
}

export function getCatalogItem(key: string) {
  return diagramCatalog.find((item) => item.key === key) ?? diagramCatalog[0];
}

function createNode(specKey: string, label: string, x: number, y: number, idFactory: IdFactory): DiagramNode {
  return {
    id: idFactory("node"),
    specKey,
    label,
    elementId: idFactory("shape"),
    x,
    y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  };
}

function createEdge(from: string, to: string, label: string, idFactory: IdFactory): DiagramEdge {
  return { id: idFactory("edge"), from, to, label, elementId: idFactory("arrow") };
}

export function createDiagramWithNode(kind: DiagramKind, item: DiagramCatalogItem, origin: { x: number; y: number }, idFactory: IdFactory = makeDiagramId): StructuredDiagram {
  return {
    id: idFactory("diagram"),
    kind,
    title: kind === "architecture" ? "Architecture diagram" : "Flowchart",
    nodes: [createNode(item.key, item.label, origin.x, origin.y, idFactory)],
    edges: [],
    groups: [],
  };
}

export function createStarterDiagram(kind: DiagramKind, origin: { x: number; y: number }, idFactory: IdFactory = makeDiagramId): StructuredDiagram {
  const specs = kind === "architecture"
    ? [["browser", "Client"], ["server", "API"], ["postgresql", "PostgreSQL"]] as const
    : [["start", "Start"], ["process", "Process"], ["decision", "Decision"]] as const;

  const nodes = specs.map(([specKey, label], index) => createNode(specKey, label, origin.x + index * (NODE_WIDTH + 96), origin.y, idFactory));
  const edges = kind === "architecture"
    ? [createEdge(nodes[0].id, nodes[1].id, "HTTPS", idFactory), createEdge(nodes[1].id, nodes[2].id, "SQL", idFactory)]
    : [createEdge(nodes[0].id, nodes[1].id, "next", idFactory), createEdge(nodes[1].id, nodes[2].id, "check", idFactory)];

  return layoutDiagram({
    id: idFactory("diagram"),
    kind,
    title: kind === "architecture" ? "Architecture diagram" : "Flowchart",
    nodes,
    edges,
    groups: [],
  }, origin);
}

export function addCatalogNode(diagram: StructuredDiagram, item: DiagramCatalogItem, origin: { x: number; y: number }, idFactory: IdFactory = makeDiagramId): StructuredDiagram {
  return { ...diagram, nodes: [...diagram.nodes, createNode(item.key, item.label, origin.x, origin.y, idFactory)] };
}

export function connectDiagramNodes(diagram: StructuredDiagram, from: string, to: string, idFactory: IdFactory = makeDiagramId) {
  if (from === to || !diagram.nodes.some((node) => node.id === from) || !diagram.nodes.some((node) => node.id === to)) return diagram;
  if (diagram.edges.some((edge) => edge.from === from && edge.to === to)) return diagram;
  return { ...diagram, edges: [...diagram.edges, createEdge(from, to, "", idFactory)] };
}

export function groupDiagramNodes(diagram: StructuredDiagram, nodeIds: readonly string[], idFactory: IdFactory = makeDiagramId) {
  const unique = [...new Set(nodeIds)].filter((id) => diagram.nodes.some((node) => node.id === id));
  if (unique.length < 2) return diagram;
  const id = idFactory("group");
  const group: DiagramGroup = {
    id,
    label: `Group ${diagram.groups.length + 1}`,
    elementId: idFactory("group-shape"),
    nodeIds: unique,
  };
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => unique.includes(node.id) ? { ...node, groupId: id } : node),
    groups: [...diagram.groups, group],
  };
}

function depthByNode(diagram: StructuredDiagram) {
  const depth = new Map(diagram.nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < diagram.nodes.length; pass += 1) {
    let changed = false;
    for (const edge of diagram.edges) {
      const next = Math.min(diagram.nodes.length - 1, (depth.get(edge.from) ?? 0) + 1);
      if (next > (depth.get(edge.to) ?? 0)) {
        depth.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return depth;
}

export function layoutDiagram(diagram: StructuredDiagram, origin?: { x: number; y: number }): StructuredDiagram {
  if (!diagram.nodes.length) return diagram;
  const startX = origin?.x ?? Math.min(...diagram.nodes.map((node) => node.x));
  const startY = origin?.y ?? Math.min(...diagram.nodes.map((node) => node.y));
  const depth = depthByNode(diagram);
  const rows = new Map<number, number>();
  const horizontal = diagram.kind === "architecture";

  const nodes = diagram.nodes.map((node) => {
    const layer = depth.get(node.id) ?? 0;
    const row = rows.get(layer) ?? 0;
    rows.set(layer, row + 1);
    return {
      ...node,
      x: horizontal ? startX + layer * (NODE_WIDTH + 104) : startX + row * (NODE_WIDTH + 48),
      y: horizontal ? startY + row * (NODE_HEIGHT + 48) : startY + layer * (NODE_HEIGHT + 88),
      width: node.width || NODE_WIDTH,
      height: node.height || NODE_HEIGHT,
    };
  });
  return { ...diagram, nodes };
}

function isDiagramNode(value: unknown): value is DiagramNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<DiagramNode>;
  return typeof node.id === "string" && typeof node.specKey === "string" && typeof node.label === "string"
    && typeof node.elementId === "string" && typeof node.x === "number" && typeof node.y === "number"
    && typeof node.width === "number" && typeof node.height === "number";
}

function isDiagramEdge(value: unknown): value is DiagramEdge {
  if (!value || typeof value !== "object") return false;
  const edge = value as Partial<DiagramEdge>;
  return typeof edge.id === "string" && typeof edge.from === "string" && typeof edge.to === "string"
    && typeof edge.label === "string" && typeof edge.elementId === "string";
}

function isDiagramGroup(value: unknown): value is DiagramGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<DiagramGroup>;
  return typeof group.id === "string" && typeof group.label === "string" && typeof group.elementId === "string"
    && Array.isArray(group.nodeIds) && group.nodeIds.every((nodeId) => typeof nodeId === "string");
}

function isStructuredDiagram(value: unknown): value is StructuredDiagram {
  if (!value || typeof value !== "object") return false;
  const diagram = value as Partial<StructuredDiagram>;
  return typeof diagram.id === "string" && (diagram.kind === "architecture" || diagram.kind === "flowchart")
    && typeof diagram.title === "string" && Array.isArray(diagram.nodes) && diagram.nodes.every(isDiagramNode)
    && Array.isArray(diagram.edges) && diagram.edges.every(isDiagramEdge)
    && Array.isArray(diagram.groups) && diagram.groups.every(isDiagramGroup);
}

export function readStructuredDiagrams(data: Record<string, unknown>): StructuredDiagram[] {
  const value = data[DIAGRAM_DATA_KEY];
  return Array.isArray(value) ? value.filter(isStructuredDiagram) : [];
}

export function withStructuredDiagrams(data: Record<string, unknown>, diagrams: readonly StructuredDiagram[]) {
  return { ...data, [DIAGRAM_DATA_KEY]: diagrams };
}

export function structuredElementIds(diagram: StructuredDiagram) {
  return new Set([
    ...diagram.nodes.map((node) => node.elementId),
    ...diagram.edges.map((edge) => edge.elementId),
    ...diagram.groups.map((group) => group.elementId),
  ]);
}

export function selectionForElements(diagrams: readonly StructuredDiagram[], selectedElementIds: readonly string[], elements: readonly ElementGeometry[] = []): DiagramSelection {
  const selected = new Set(selectedElementIds);
  const selectedContainers = new Set(elements.filter((element) => selected.has(element.id) && element.containerId).map((element) => element.containerId as string));
  for (const diagram of diagrams) {
    const nodeIds = diagram.nodes
      .filter((node) => selected.has(node.elementId) || selectedContainers.has(node.elementId))
      .map((node) => node.id);
    if (nodeIds.length) return { diagramId: diagram.id, nodeIds };
  }
  return { diagramId: null, nodeIds: [] };
}

function nodeLabel(shape: ElementGeometry, live: Map<string, ElementGeometry>, fallback: string) {
  const textId = shape.boundElements?.find((bound) => bound.type === "text")?.id;
  const text = textId ? live.get(textId)?.text : undefined;
  if (!text?.trim()) return fallback;
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length > 1 ? lines.slice(1).join(" ") : lines[0];
}

export function syncDiagramsFromElements(diagrams: readonly StructuredDiagram[], elements: readonly ElementGeometry[]) {
  const live = new Map(elements.filter((element) => !element.isDeleted).map((element) => [element.id, element]));

  return diagrams.flatMap((diagram) => {
    const nodes = diagram.nodes.flatMap((node) => {
      const shape = live.get(node.elementId);
      if (!shape) return [];
      return [{
        ...node,
        label: nodeLabel(shape, live, node.label),
        x: typeof shape.x === "number" ? shape.x : node.x,
        y: typeof shape.y === "number" ? shape.y : node.y,
        width: typeof shape.width === "number" && shape.width > 0 ? shape.width : node.width,
        height: typeof shape.height === "number" && shape.height > 0 ? shape.height : node.height,
      }];
    });
    if (!nodes.length) return [];

    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = diagram.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && live.has(edge.elementId));
    const groups = diagram.groups.flatMap((group) => {
      const members = group.nodeIds.filter((id) => nodeIds.has(id));
      if (members.length < 2 || !live.has(group.elementId)) return [];
      return [{ ...group, nodeIds: members }];
    });
    const groupIds = new Set(groups.map((group) => group.id));
    return [{
      ...diagram,
      nodes: nodes.map((node) => node.groupId && !groupIds.has(node.groupId) ? { ...node, groupId: undefined } : node),
      edges,
      groups,
    }];
  });
}
