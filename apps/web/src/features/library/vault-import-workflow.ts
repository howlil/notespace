import { workspaceContentOf } from "../../domain/workspace/workspace.ts";
import type { Workspace, WorkspaceContent } from "../../domain/workspace/workspace.ts";
import { importedDocumentTitle, markdownWithVaultImages, normalizeVaultPath, resolveVaultReference } from "./vault-import.ts";

export type VaultImportOperations = {
  createWorkspace: (title: string, categoryId?: string) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  deleteTrashedWorkspace: (id: string) => Promise<void>;
  saveWorkspace: (id: string, content: WorkspaceContent, version: number) => Promise<unknown>;
  createLocalAssetId: () => string;
  storeImageAsset: (workspaceId: string, id: string, source: Blob) => Promise<unknown>;
};

export type VaultImportResult = { imported: number; failed: number; cleanupFailed: number };

function filePath(file: File) {
  return normalizeVaultPath(file.webkitRelativePath || file.name);
}

function findVaultFile(files: Map<string, File>, sourcePath: string) {
  const direct = files.get(sourcePath);
  if (direct) return direct;
  const basename = sourcePath.split("/").pop();
  if (!basename) return null;
  const matches = [...files.entries()].filter(([path]) => path.split("/").pop() === basename);
  return matches.length === 1 ? matches[0][1] : null;
}

export async function importVaultFiles(files: readonly File[], categoryId: string, operations: VaultImportOperations): Promise<VaultImportResult> {
  const markdownFiles = files.filter((file) => /\.(?:md|markdown)$/i.test(file.name));
  const filesByPath = new Map(files.map((file) => [filePath(file), file]));
  let imported = 0;
  let failed = 0;
  let cleanupFailed = 0;

  for (const markdownFile of markdownFiles) {
    let createdWorkspaceId: string | null = null;
    try {
      const path = filePath(markdownFile);
      const markdown = await markdownFile.text();
      const plannedAssets = new Map<string, { id: string; file: File }>();
      const document = markdownWithVaultImages(markdown, (source) => {
        const resolvedPath = resolveVaultReference(path, source);
        if (!resolvedPath) return null;
        const imageFile = findVaultFile(filesByPath, resolvedPath);
        if (!imageFile || !imageFile.type.startsWith("image/")) return null;
        let planned = plannedAssets.get(resolvedPath);
        if (!planned) {
          planned = { id: operations.createLocalAssetId(), file: imageFile };
          plannedAssets.set(resolvedPath, planned);
        }
        return { assetId: planned.id, src: `notespace-asset://${planned.id}` };
      });
      const title = importedDocumentTitle(path, markdown);
      const workspace = await operations.createWorkspace(title, categoryId);
      createdWorkspaceId = workspace.id;
      for (const asset of plannedAssets.values()) {
        await operations.storeImageAsset(workspace.id, asset.id, asset.file);
      }
      const content = workspaceContentOf(workspace);
      const now = new Date().toISOString();
      const seedNote = content.notes[0];
      await operations.saveWorkspace(workspace.id, {
        ...content,
        title,
        document,
        notes: [{ ...seedNote, title, document, updatedAt: now }],
      }, workspace.version);
      imported += 1;
    } catch {
      failed += 1;
      if (createdWorkspaceId) {
        try {
          await operations.deleteWorkspace(createdWorkspaceId);
          await operations.deleteTrashedWorkspace(createdWorkspaceId);
        } catch {
          cleanupFailed += 1;
        }
      }
    }
  }

  return { imported, failed, cleanupFailed };
}
