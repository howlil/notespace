import { mkdir, writeFile } from "node:fs/promises";

const sourceUrl = "https://docs.eraser.io/icons";
const outputPath = new URL("../apps/web/src/features/diagram/catalog/eraser-icons.generated.json", import.meta.url);

const categoryBySection = {
  "aws-icons": "aws",
  "google-cloud-icons": "gcp",
  "azure-icons": "azure",
  "oracle-cloud-icons": "oracle",
  "kubernetes-icons": "kubernetes",
  "networking-icons": "networking",
  "tech-logos": "tech",
  "general-icons": "general",
};

function decodeHtml(value) {
  return value
    .replaceAll("&#38;", "&")
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"');
}

function labelFor(name) {
  const withoutProvider = name.replace(/^(aws|gcp|azure|oracle|kubernetes|networking)-/, "");
  const acronym = new Map([
    ["api", "API"], ["apis", "APIs"], ["aws", "AWS"], ["cdn", "CDN"], ["db", "DB"],
    ["dns", "DNS"], ["ec2", "EC2"], ["gke", "GKE"], ["gpu", "GPU"], ["iam", "IAM"],
    ["ip", "IP"], ["ipv4", "IPv4"], ["ipv6", "IPv6"], ["k8s", "K8s"], ["mysql", "MySQL"],
    ["nfs", "NFS"], ["oauth", "OAuth"], ["postgres", "Postgres"], ["redis", "Redis"],
    ["rds", "RDS"], ["s3", "S3"], ["sdk", "SDK"], ["sql", "SQL"], ["ssh", "SSH"],
    ["tcp", "TCP"], ["tls", "TLS"], ["udp", "UDP"], ["ui", "UI"], ["url", "URL"],
  ]);
  return withoutProvider
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => acronym.get(part) ?? part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`Could not fetch ${sourceUrl}: HTTP ${response.status}`);
const html = await response.text();
const entries = [];
const sectionPattern = /<section[^>]*data-cat[^>]*>[\s\S]*?<h2[^>]*id="([^"]+)"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)<\/section>/gi;

for (const match of html.matchAll(sectionPattern)) {
  const category = categoryBySection[match[1]];
  if (!category) continue;
  const iconPattern = /data-icon="([^"]+)"/gi;
  for (const icon of match[2].matchAll(iconPattern)) {
    const name = decodeHtml(icon[1]);
    entries.push({ name, category, label: labelFor(name) });
  }
}

const unique = [...new Map(entries.map((entry) => [entry.name, entry])).values()]
  .sort((left, right) => left.name.localeCompare(right.name));
if (unique.length === 0) throw new Error("Eraser icon catalog parser returned no icons");

await mkdir(new URL("./", outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(unique, null, 2)}\n`, "utf8");
console.log(`Wrote ${unique.length} Eraser icon entries to ${outputPath.pathname}`);
