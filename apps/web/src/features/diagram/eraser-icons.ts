export const ERASER_ICON_BASE_URL = "https://storage.googleapis.com/eraser-public-assets/canvas-icons";

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

export function eraserIconName(catalogKey: string) {
  return iconNameByCatalogKey[catalogKey] ?? null;
}

export function eraserIconUrl(iconName: string) {
  return `${ERASER_ICON_BASE_URL}/${encodeURIComponent(iconName)}.svg`;
}

export function eraserIconUrlForCatalogKey(catalogKey: string) {
  const iconName = eraserIconName(catalogKey);
  return iconName ? eraserIconUrl(iconName) : null;
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
