import { workspaceContentOf } from "../../domain/workspace/workspace.ts";
import type { Workspace, WorkspaceContent } from "../../domain/workspace/workspace.ts";
import { sameWorkspaceContent } from "../../domain/workspace/canvas-merge.ts";
import { importedDocumentTitle, markdownWithVaultImages, normalizeVaultPath, resolveVaultReference } from "./vault-import.ts";

export type VaultImportOperations = {
  createWorkspace: (title: string, categoryId?: string) => Promise<Workspace>;
  getWorkspace: (id: string) => Promise<Workspace | null>;
  deleteWorkspace: (id: string, expectedVersion: number) => Promise<void>;
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

async function cleanupImportedWorkspace(
  created: Workspace,
  expectedContent: WorkspaceContent | null,
  operations: VaultImportOperations,
) {
  try {
    await operations.deleteWorkspace(created.id, created.version);
    await operations.deleteTrashedWorkspace(created.id);
    return;
  } catch {
    // A delete may have committed even if its response was lost.
    try {
      await operations.deleteTrashedWorkspace(created.id);
      return;
    } catch {
      // Otherwise resolve the current active version before deciding whether a retry is safe.
    }
  }

  const current = await operations.getWorkspace(created.id);
  if (!current) {
    await operations.deleteTrashedWorkspace(created.id);
    return;
  }

  const matchesCreated = sameWorkspaceContent(workspaceContentOf(created), current);
  const matchesImport = expectedContent ? sameWorkspaceContent(expectedContent, current) : false;
  if (!matchesCreated && !matchesImport) {
    throw new Error("Imported workspace changed before cleanup.");
  }

  await operations.deleteWorkspace(current.id, current.version);
  await operations.deleteTrashedWorkspace(current.id);
}

export async function importVaultFiles(files: readonly File[], categoryId: string, operations: VaultImportOperations): Promise<VaultImportResult> {
  const markdownFiles = files.filter((file) => /\.(?:md|markdown)$/i.test(file.name));
  const filesByPath = new Map(files.map((file) => [filePath(file), file]));
  let imported = 0;
  let failed = 0;
  let cleanupFailed = 0;

  for (const markdownFile of markdownFiles) {
    let createdWorkspace: Workspace | null = null;
    let expectedContent: WorkspaceContent | null = null;
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
      createdWorkspace = workspace;
      for (const asset of plannedAssets.values()) {
        await operations.storeImageAsset(workspace.id, asset.id, asset.file);
      }
      const content = workspaceContentOf(workspace);
      const now = new Date().toISOString();
      const seedNote = content.notes[0];
      expectedContent = {
        ...content,
        title,
        document,
        notes: [{ ...seedNote, title, document, updatedAt: now }],
      };
      await operations.saveWorkspace(workspace.id, expectedContent, workspace.version);
      imported += 1;
    } catch {
      failed += 1;
      if (createdWorkspace) {
        try {
          await cleanupImportedWorkspace(createdWorkspace, expectedContent, operations);
        } catch {
          cleanupFailed += 1;
        }
      }
    }
  }

  return { imported, failed, cleanupFailed };
}
