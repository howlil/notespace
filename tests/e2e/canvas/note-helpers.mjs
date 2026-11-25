/* Shared Canvas Note E2E helpers (not a standalone test suite). */
import {
  api, assert, click, execute, requestLog, visible, waitSaved as harnessWaitSaved,
} from "../support/harness.mjs";

export async function waitSaved() {
  try {
    await harnessWaitSaved();
  } catch (error) {
    const snapshot = await execute(() => ({
      status: document.querySelector('[aria-label="Workspace save status"]')?.textContent,
      noteDots: [...document.querySelectorAll("[data-note-save]")].map((node) => node.getAttribute("data-note-save")),
      cards: [...document.querySelectorAll("[data-note-element]")].map((node) => node.getAttribute("data-note-state")),
    }));
    const recent = (await requestLog()).slice(-10).map((entry) => `${entry.method} ${entry.path}`);
    console.log("WAITSAVED_TIMEOUT", JSON.stringify({ snapshot, recent }));
    throw error;
  }
}

/** On-screen bounds: Note cards are zoom-scaled with a CSS transform, which WebDriver's rect omits. */
export async function visualBox(selector) {
  await visible(selector);
  return execute((cssSelector) => {
    const { x, y, width, height } = document.querySelector(cssSelector).getBoundingClientRect();
    return { x, y, width, height };
  }, selector);
}

export async function createNoteOnCanvas(workspaceId) {
  const noteTool = '[role="toolbar"][aria-label="Canvas tools"] button[aria-label="Note"]';
  await visible(noteTool);
  await click(noteTool);
  await visible("[data-note-element] .ProseMirror");
  await waitSaved();
  const stored = await api(`/api/workspaces/${workspaceId}`);
  const element = (stored.canvas.data.elements ?? []).find((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote);
  assert.ok(element, "Canvas stores the created Note reference");
  return element.customData.notespaceNote.noteId;
}

export async function canvasNoteIds(workspaceId) {
  const stored = await api(`/api/workspaces/${workspaceId}`);
  return (stored.canvas.data.elements ?? [])
    .filter((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote)
    .map((candidate) => candidate.customData.notespaceNote.noteId);
}

export async function canvasNoteRefs(workspaceId) {
  const stored = await api(`/api/workspaces/${workspaceId}`);
  return (stored.canvas.data.elements ?? [])
    .filter((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote)
    .map((candidate) => candidate.customData.notespaceNote);
}
