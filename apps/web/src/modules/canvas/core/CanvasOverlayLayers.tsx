import { useCallback } from "react";
import type { Note } from "../../../platform/api/note-api";
import type { NoteDocument } from "../../../entities/note";
import { useStore } from "../../../shared/lib/use-store";
import type { CanvasNoteStore, NoteActivationPoint } from "../../note-editor";
import { CanvasFrameStyleLayer } from "../objects/frame/CanvasFrameStyleLayer";
import { CanvasWorkspaceShortcutLayer } from "../objects/shortcut/CanvasWorkspaceShortcutLayer";
import { CanvasCodeBlockLayer, type CodeBlockViewOptions } from "../objects/code-block/CanvasCodeBlockLayer";
import type { CanvasCodeBlockData } from "../objects/code-block/model/canvas-code-block";
import type { CodeRunView } from "../objects/code-block/execution/use-code-runner";
import { CanvasNoteCardLayer } from "../objects/note-card/CanvasNoteCardLayer";
import { useCanvasController } from "./CanvasControllerContext";

/**
 * Isolated viewport-subscribed overlay leaf.
 * Subscribes to `controller.viewport` locally so high-frequency camera pan/zoom
 * updates ONLY re-render positioned canvas overlays, never the parent CanvasEditor chrome/menus.
 */
export function CanvasOverlayLayers({
  workspaceId,
  noteStore,
  dark,
  trashNoteId,
  noteActivationPoint,
  highlightedBlock,
  codeRuns,
  codeBlockViews,
  onUpdateCodeBlock,
  onRunCodeBlock,
  onAutoFitCodeBlock,
  onEditingNoteChange,
  onTrashNoteChange,
  onDockToSideCards,
  onFocusNote,
  workspaceTitles,
  onOpenWorkspaceShortcut,
  onRemoveMissingShortcut,
  onRegisterNoteFlush,
  onRegisterNoteDocuments,
  onUpdateNote,
  onAutoResizeNote,
  onRemoveMissingNote,
  onSuccess,
  onError,
}: {
  workspaceId: string;
  noteStore?: CanvasNoteStore;
  dark: boolean;
  trashNoteId: string | null;
  noteActivationPoint: NoteActivationPoint | null;
  highlightedBlock: { noteId: string; blockId: string } | null;
  codeRuns: Record<string, CodeRunView>;
  codeBlockViews: Record<string, CodeBlockViewOptions>;
  onUpdateCodeBlock: (elementId: string, block: CanvasCodeBlockData) => void;
  onRunCodeBlock: (id: string, block: CanvasCodeBlockData) => void;
  onAutoFitCodeBlock: (elementId: string, height: number) => void;
  onEditingNoteChange: (elementId: string | null) => void;
  onTrashNoteChange: (noteId: string | null) => void;
  onDockToSideCards?: (noteId: string) => void;
  onFocusNote: (noteId: string) => void;
  workspaceTitles?: ReadonlyMap<string, string>;
  onOpenWorkspaceShortcut?: (workspaceId: string, options?: { background?: boolean }) => void;
  onRemoveMissingShortcut?: (elementId: string) => void;
  onRegisterNoteFlush: (flush: () => Promise<void>) => (() => void) | void;
  onRegisterNoteDocuments: (read: () => Record<string, NoteDocument>) => (() => void) | void;
  onUpdateNote: (noteId: string, document: NoteDocument, expectedRevision: number) => Promise<Note>;
  onAutoResizeNote: (elementId: string, height: number) => void;
  onRemoveMissingNote: (elementId: string) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const controller = useCanvasController();
  const viewport = useStore(controller.viewport);
  const scene = useStore(controller.scene);
  const selection = useStore(controller.selection);
  const overlay = useStore(controller.overlay);

  const editingCodeBlockId = overlay.kind === "editing-code" ? overlay.elementId : null;
  const editingNoteElementId = overlay.kind === "editing-note" ? overlay.elementId : null;
  const expandedNoteElementId = overlay.kind === "expanded-note" ? overlay.elementId : null;
  const infoNoteId = overlay.kind === "note-info" ? overlay.noteId : null;

  const handleEditingCodeChange = useCallback((id: string | null) => {
    controller.setOverlay(id ? { kind: "editing-code", elementId: id } : { kind: "none" });
  }, [controller]);

  const handleExpandedNoteChange = useCallback((id: string | null) => {
    controller.setOverlay(id ? { kind: "expanded-note", elementId: id } : { kind: "none" });
  }, [controller]);

  const handleInfoNoteChange = useCallback((noteId: string | null) => {
    controller.setOverlay(noteId ? { kind: "note-info", noteId } : { kind: "none" });
  }, [controller]);

  return (
    <>
      <CanvasFrameStyleLayer elements={scene.elements} viewport={viewport} appDark={dark} />
      {workspaceTitles && onOpenWorkspaceShortcut && (
        <CanvasWorkspaceShortcutLayer
          elements={scene.elements}
          viewport={viewport}
          workspaceTitles={workspaceTitles}
          selectedElementId={selection.selectedElementId}
          onOpenWorkspace={onOpenWorkspaceShortcut}
          onRemoveMissing={onRemoveMissingShortcut}
        />
      )}
      <CanvasCodeBlockLayer
        elements={scene.overlayElements}
        viewport={viewport}
        appDark={dark}
        selectedElementId={selection.selectedElementId}
        editingElementId={editingCodeBlockId}
        runs={codeRuns}
        views={codeBlockViews}
        onUpdate={onUpdateCodeBlock}
        onEditingChange={handleEditingCodeChange}
        onRun={onRunCodeBlock}
        onAutoFit={onAutoFitCodeBlock}
      />
      <CanvasNoteCardLayer
        workspaceId={workspaceId}
        noteStore={noteStore}
        elements={scene.elements}
        viewport={viewport}
        selectedElementId={selection.selectedElementId}
        editingElementId={editingNoteElementId}
        expandedElementId={expandedNoteElementId}
        infoNoteId={infoNoteId}
        trashNoteId={trashNoteId}
        activationPoint={noteActivationPoint}
        highlightNoteId={highlightedBlock?.noteId ?? null}
        highlightBlockId={highlightedBlock?.blockId ?? null}
        onEditingChange={onEditingNoteChange}
        onExpandedChange={handleExpandedNoteChange}
        onInfoNoteChange={handleInfoNoteChange}
        onTrashNoteChange={onTrashNoteChange}
        onDockToSideCards={onDockToSideCards}
        onFocusNote={onFocusNote}
        onRegisterFlush={onRegisterNoteFlush}
        onRegisterDocuments={onRegisterNoteDocuments}
        onUpdateNote={onUpdateNote}
        onAutoResize={onAutoResizeNote}
        onRemoveMissing={onRemoveMissingNote}
        onSuccess={onSuccess}
        onError={onError}
      />
    </>
  );
}
