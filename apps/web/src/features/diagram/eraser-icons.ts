import generatedIconMetadata from "./catalog/eraser-icons.generated.json" with { type: "json" };

export const ERASER_ICON_BASE_URL = "/api/icons/eraser";
export const ERASER_ICON_PREVIEW_BASE_URL = "https://storage.googleapis.com/eraser-public-assets/canvas-icons";

const iconNameByCatalogKey: Readonly<Record<string, string>> = {
  process: "square",
  decision: "diamond",
  start: "circle",
  database: "database",
  browser: "globe",
  server: "server",
  queue: "list",
  user: "user",

  react: "react",
  nodejs: "node",
  go: "go",
  postgresql: "postgres",
  redis: "redis",
  docker: "docker",
  kubernetes: "kubernetes",
  github: "github",

  aws: "aws",
  "aws-lambda": "aws-lambda",
  "aws-ec2": "aws-ec2",
  "aws-s3": "aws-simple-storage-service",
  "aws-rds": "aws-rds",
  "aws-dynamodb": "aws-dynamodb",

  gcp: "google-cloud",
  "gcp-run": "gcp-cloud-run",
  "gcp-compute": "gcp-compute-engine",
  "gcp-storage": "gcp-cloud-storage",
  "gcp-bigquery": "gcp-bigquery",
  "gcp-pubsub": "gcp-pubsub",

  azure: "azure",
  "azure-functions": "azure-function-apps",
  "azure-app-service": "azure-app-services",
  "azure-blob": "azure-storage-accounts",
  "azure-sql": "azure-sql",
  "azure-cosmos": "azure-cosmos-db",
};

const generatedIconNames = new Set(generatedIconMetadata.map((item) => item.name));
const warmedPreviewUrls = new Set<string>();

export function eraserIconName(catalogKey: string) {
  return iconNameByCatalogKey[catalogKey] ?? (generatedIconNames.has(catalogKey) ? catalogKey : null);
}

// Canvas insertion keeps using the same-origin gateway so external SVG is
// validated before it is persisted into a workspace asset.
export function eraserIconUrl(iconName: string) {
  return `${ERASER_ICON_BASE_URL}/${encodeURIComponent(iconName)}`;
}

// Palette previews are isolated <img> resources, so they can safely use the
// public Eraser CDN directly and avoid the extra Notespace -> GCS proxy hop.
export function eraserIconPreviewUrl(iconName: string) {
  return `${ERASER_ICON_PREVIEW_BASE_URL}/${encodeURIComponent(iconName)}.svg`;
}

export function eraserIconUrlForCatalogKey(catalogKey: string) {
  const iconName = eraserIconName(catalogKey);
  return iconName ? eraserIconPreviewUrl(iconName) : null;
}

// Warm only a small likely-to-be-visible set. The browser HTTP cache owns the
// bytes, so opening the palette later reuses them without an application cache.
export function warmEraserIconPreviews(catalogKeys: readonly string[], limit = 12) {
  if (typeof Image === "undefined") return;

  for (const catalogKey of catalogKeys.slice(0, limit)) {
    const url = eraserIconUrlForCatalogKey(catalogKey);
    if (!url || warmedPreviewUrls.has(url)) continue;
    warmedPreviewUrls.add(url);
    const image = new Image();
    image.decoding = "async";
    image.src = url;
  }
}

export function eraserIconFileId(iconName: string) {
  return `eraser-icon-${iconName}`;
}

export function eraserNodeIconElementId(nodeElementId: string) {
  return `${nodeElementId}-eraser-icon`;
}

export function eraserNodeRenderGroupId(nodeId: string) {
  return `notespace-diagram-node-${nodeId}`;
}
