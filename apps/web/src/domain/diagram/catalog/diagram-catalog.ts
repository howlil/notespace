import generatedIconMetadata from "./eraser-icons.generated.json" with { type: "json" };

export type DiagramCategory = "general" | "tech" | "aws" | "gcp" | "azure" | "oracle" | "kubernetes" | "networking";
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
