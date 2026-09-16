import generatedIconMetadata from "./catalog/eraser-icons.generated.json" with { type: "json" };

export type DiagramKind = "architecture" | "flowchart";
export type DiagramCategory = "general" | "tech" | "aws" | "gcp" | "azure" | "oracle" | "kubernetes" | "networking";
export type DiagramNodeShape = "rectangle" | "diamond" | "ellipse";
// `component` remains readable for old snapshots. New creation paths are icon-only.
export type DiagramNodeRenderMode = "component" | "icon";

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
  renderMode?: DiagramNodeRenderMode;
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
  edgeId: string | null;
  groupId: string | null;
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

export function emptyDiagramSelection(): DiagramSelection {
  return { diagramId: null, nodeIds: [], edgeId: null, groupId: null };
}

export function diagramNodeLabelElementId(nodeElementId: string) {
  return `${nodeElementId}-diagram-label`;
}

// Compatibility metadata remains so previously stored structured diagrams can
// still resolve their historic spec keys. Only the generic system-design subset
// is surfaced from this list in the picker.
const compatibilityCatalog: readonly DiagramCatalogItem[] = [
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

const categoryValues = new Set<DiagramCategory>(["general", "tech", "aws", "gcp", "azure", "oracle", "kubernetes", "networking"]);

function iconGlyph(label: string) {
  return label.split(/\s+/).map((word) => word[0]).join("").slice(0, 3).toUpperCase() || "ICON";
}

function uniqueCatalog(items: readonly DiagramCatalogItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

const generatedEraserCatalog: readonly DiagramCatalogItem[] = generatedIconMetadata
  .filter((item): item is { name: string; category: string; label: string } => typeof item.name === "string" && typeof item.category === "string" && typeof item.label === "string")
  .filter((item) => categoryValues.has(item.category as DiagramCategory))
  .map((item) => ({
    key: item.name,
    label: item.label,
    category: item.category as DiagramCategory,
    glyph: iconGlyph(item.label),
    iconKey: item.name,
    keywords: [item.name, item.category, ...item.label.toLowerCase().split(/\s+/)],
  }));

// The Eraser source also contains generic UI/action glyphs such as alignment
// controls. Those are valid icons, but they are not architecture components.
// Keep the raw catalog readable for existing snapshots while exposing only a
// curated generic set plus technology/provider icons in the Diagram picker.
const genericSystemDesignCatalog = compatibilityCatalog.filter((item) => item.category === "general");
export const eraserDiagramCatalog: readonly DiagramCatalogItem[] = uniqueCatalog([
  ...genericSystemDesignCatalog,
  ...generatedEraserCatalog.filter((item) => item.category !== "general"),
]);
export const diagramPickerIconCount = eraserDiagramCatalog.length;

// Full catalog remains available to resolve historic spec keys, including
// general icons that are no longer offered for new insertion.
export const diagramCatalog: readonly DiagramCatalogItem[] = uniqueCatalog([...compatibilityCatalog, ...generatedEraserCatalog]);

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

export function searchEraserCatalog(query: string, category: DiagramCategory | "all" = "all") {
  const normalized = query.trim().toLowerCase();
  return eraserDiagramCatalog.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (!normalized) return true;
    return [item.label, item.key, item.category, ...item.keywords].some((value) => value.toLowerCase().includes(normalized));
  });
}

export function getCatalogItem(key: string) {
  return diagramCatalog.find((item) => item.key === key) ?? diagramCatalog[0];
}

function createNode(specKey: string, label: string, x: number, y: number, idFactory: IdFactory, renderMode: DiagramNodeRenderMode): DiagramNode {
  return {
    id: idFactory("node"),
    specKey,
    label,
    elementId: idFactory("shape"),
    x,
    y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    renderMode,
  };
}

function createEdge(from: string, to: string, label: string, idFactory: IdFactory): DiagramEdge {
  return { id: idFactory("edge"), from, to, label, elementId: idFactory("arrow") };
}

export function createDiagramWithNode(kind: DiagramKind, item: DiagramCatalogItem, origin: { x: number; y: number }, idFactory: IdFactory = makeDiagramId, renderMode: "icon" = "icon"): StructuredDiagram {
  const node = createNode(item.key, item.label, origin.x, origin.y, idFactory, renderMode);
  return {
    id: idFactory("diagram"),
    kind,
    title: kind === "architecture" ? "Architecture diagram" : "Flowchart",
    nodes: [{ ...node, width: 56, height: 56 }],
    edges: [],
    groups: [],
  };
}

export function addCatalogNode(diagram: StructuredDiagram, item: DiagramCatalogItem, origin: { x: number; y: number }, idFactory: IdFactory = makeDiagramId, renderMode: "icon" = "icon"): StructuredDiagram {
  const node = { ...createNode(item.key, item.label, origin.x, origin.y, idFactory, renderMode), width: 56, height: 56 };
  return { ...diagram, nodes: [...diagram.nodes, node] };
}

export function renameDiagramNode(diagram: StructuredDiagram, nodeId: string, label: string) {
  const nextLabel = label.trim();
  if (!nextLabel) return diagram;
  return { ...diagram, nodes: diagram.nodes.map((node) => node.id === nodeId ? { ...node, label: nextLabel } : node) };
}

export function connectDiagramNodes(diagram: StructuredDiagram, from: string, to: string, idFactory: IdFactory = makeDiagramId) {
  if (from === to || !diagram.nodes.some((node) => node.id === from) || !diagram.nodes.some((node) => node.id === to)) return diagram;
  if (diagram.edges.some((edge) => edge.from === from && edge.to === to)) return diagram;
  return { ...diagram, edges: [...diagram.edges, createEdge(from, to, "", idFactory)] };
}

export function renameDiagramEdge(diagram: StructuredDiagram, edgeId: string, label: string) {
  const nextLabel = label.trim();
  return { ...diagram, edges: diagram.edges.map((edge) => edge.id === edgeId ? { ...edge, label: nextLabel } : edge) };
}

export function removeDiagramEdge(diagram: StructuredDiagram, edgeId: string) {
  return { ...diagram, edges: diagram.edges.filter((edge) => edge.id !== edgeId) };
}

export function groupDiagramNodes(diagram: StructuredDiagram, nodeIds: readonly string[], idFactory: IdFactory = makeDiagramId) {
  const unique = [...new Set(nodeIds)].filter((id) => diagram.nodes.some((node) => node.id === id));
  if (unique.length < 2) return diagram;
  const selected = new Set(unique);
  const remainingGroups = diagram.groups
    .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => !selected.has(id)) }))
    .filter((group) => group.nodeIds.length >= 2);
  const remainingGroupIds = new Set(remainingGroups.map((group) => group.id));
  const id = idFactory("group");
  const group: DiagramGroup = {
    id,
    label: `Group ${diagram.groups.length + 1}`,
    elementId: idFactory("group-shape"),
    nodeIds: unique,
  };
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      if (selected.has(node.id)) return { ...node, groupId: id };
      if (node.groupId && !remainingGroupIds.has(node.groupId)) return { ...node, groupId: undefined };
      return node;
    }),
    groups: [...remainingGroups, group],
  };
}

export function renameDiagramGroup(diagram: StructuredDiagram, groupId: string, label: string) {
  const nextLabel = label.trim();
  if (!nextLabel) return diagram;
  return { ...diagram, groups: diagram.groups.map((group) => group.id === groupId ? { ...group, label: nextLabel } : group) };
}

export function ungroupDiagramNodes(diagram: StructuredDiagram, groupId: string) {
  if (!diagram.groups.some((group) => group.id === groupId)) return diagram;
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => node.groupId === groupId ? { ...node, groupId: undefined } : node),
    groups: diagram.groups.filter((group) => group.id !== groupId),
  };
}

function layerByNode(diagram: StructuredDiagram) {
  const nodeIds = new Set(diagram.nodes.map((node) => node.id));
  const indegree = new Map(diagram.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(diagram.nodes.map((node) => [node.id, [] as string[]]));
  const layer = new Map(diagram.nodes.map((node) => [node.id, 0]));

  for (const edge of diagram.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = diagram.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const visited = new Set<string>();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    visited.add(id);
    for (const next of outgoing.get(id) ?? []) {
      layer.set(next, Math.max(layer.get(next) ?? 0, (layer.get(id) ?? 0) + 1));
      const nextIndegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextIndegree);
      if (nextIndegree === 0) queue.push(next);
    }
  }

  // Cycles have no zero-indegree entry point. Keep them together in one stable
  // layer instead of repeatedly increasing depth on every layout pass.
  const fallbackLayer = Math.max(0, ...layer.values());
  for (const node of diagram.nodes) {
    if (!visited.has(node.id)) layer.set(node.id, fallbackLayer);
  }
  return layer;
}

export function layoutDiagram(diagram: StructuredDiagram, origin?: { x: number; y: number }): StructuredDiagram {
  if (!diagram.nodes.length) return diagram;
  const startX = origin?.x ?? Math.min(...diagram.nodes.map((node) => node.x));
  const startY = origin?.y ?? Math.min(...diagram.nodes.map((node) => node.y));
  const layer = layerByNode(diagram);
  const rows = new Map<number, number>();
  const horizontal = diagram.kind === "architecture";
  const maxWidth = Math.max(...diagram.nodes.map((node) => node.width || NODE_WIDTH));
  const maxHeight = Math.max(...diagram.nodes.map((node) => node.height || NODE_HEIGHT));
  const horizontalStep = maxWidth + 120;
  const verticalStep = maxHeight + 72;

  const nodes = diagram.nodes.map((node) => {
    const nodeLayer = layer.get(node.id) ?? 0;
    const row = rows.get(nodeLayer) ?? 0;
    rows.set(nodeLayer, row + 1);
    return {
      ...node,
      x: horizontal ? startX + nodeLayer * horizontalStep : startX + row * (maxWidth + 64),
      y: horizontal ? startY + row * verticalStep : startY + nodeLayer * (maxHeight + 96),
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
    && typeof node.width === "number" && typeof node.height === "number"
    && (node.renderMode === undefined || node.renderMode === "component" || node.renderMode === "icon");
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
    ...diagram.nodes.flatMap((node) => [node.elementId, diagramNodeLabelElementId(node.elementId)]),
    ...diagram.edges.map((edge) => edge.elementId),
    ...diagram.groups.map((group) => group.elementId),
  ]);
}

export function selectionForElements(diagrams: readonly StructuredDiagram[], selectedElementIds: readonly string[], elements: readonly ElementGeometry[] = []): DiagramSelection {
  const selected = new Set(selectedElementIds);
  const selectedContainers = new Set(elements.filter((element) => selected.has(element.id) && element.containerId).map((element) => element.containerId as string));
  for (const diagram of diagrams) {
    const nodeIds = diagram.nodes
      .filter((node) => selected.has(node.elementId) || selected.has(diagramNodeLabelElementId(node.elementId)) || selectedContainers.has(node.elementId))
      .map((node) => node.id);
    if (nodeIds.length) return { diagramId: diagram.id, nodeIds, edgeId: null, groupId: null };

    const edge = diagram.edges.find((candidate) => selected.has(candidate.elementId) || selectedContainers.has(candidate.elementId));
    if (edge) return { diagramId: diagram.id, nodeIds: [], edgeId: edge.id, groupId: null };

    const group = diagram.groups.find((candidate) => selected.has(candidate.elementId) || selectedContainers.has(candidate.elementId));
    if (group) return { diagramId: diagram.id, nodeIds: [], edgeId: null, groupId: group.id };
  }
  return emptyDiagramSelection();
}

function boundText(shape: ElementGeometry, live: Map<string, ElementGeometry>) {
  const textId = shape.boundElements?.find((bound) => bound.type === "text")?.id;
  return textId ? live.get(textId)?.text : undefined;
}

function normalizedLabel(text: string) {
  return text.trim().replace(/\s*\n\s*/g, " ");
}

function boundLabel(shape: ElementGeometry, live: Map<string, ElementGeometry>, fallback: string) {
  const text = boundText(shape, live);
  return text?.trim() ? normalizedLabel(text) : fallback;
}

function nodeLabel(node: DiagramNode, shape: ElementGeometry, live: Map<string, ElementGeometry>) {
  const iconLabel = live.get(diagramNodeLabelElementId(node.elementId))?.text;
  if (iconLabel?.trim()) return normalizedLabel(iconLabel);
  const text = boundText(shape, live);
  if (!text?.trim()) return node.label;
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
        label: nodeLabel(node, shape, live),
        x: typeof shape.x === "number" ? shape.x : node.x,
        y: typeof shape.y === "number" ? shape.y : node.y,
        width: typeof shape.width === "number" && shape.width > 0 ? shape.width : node.width,
        height: typeof shape.height === "number" && shape.height > 0 ? shape.height : node.height,
      }];
    });
    if (!nodes.length) return [];

    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = diagram.edges.flatMap((edge) => {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return [];
      const shape = live.get(edge.elementId);
      if (!shape) return [];
      return [{ ...edge, label: boundLabel(shape, live, edge.label) }];
    });
    const groups = diagram.groups.flatMap((group) => {
      const members = group.nodeIds.filter((id) => nodeIds.has(id));
      const shape = live.get(group.elementId);
      if (members.length < 2 || !shape) return [];
      return [{ ...group, label: boundLabel(shape, live, group.label), nodeIds: members }];
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
