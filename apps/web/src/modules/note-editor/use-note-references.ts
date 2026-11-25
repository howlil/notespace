import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { getNote, listNotes, type NoteSummary } from "../../platform/api/note-api";
import type { NoteDocument } from "../../entities/note";
import { ensureNoteBlockIds } from "./extensions/block-identity";
import { listNoteBlocks, type NoteBlockSummary } from "./model/note-extract";
import { noteMentionQuery } from "./model/note-slash";
import {
  noteSummaryLabel,
  noteSummaryWorkspace,
  type NoteCreatedConnection,
  type ReferenceState,
} from "./toolbar/editor-positioning";

type UseNoteReferencesOptions = {
  editor: Editor | null;
  noteId: string;
  elementId: string;
  workspaceId: string;
  onCreateAndLinkNote?: (sourceElementId: string, initialDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onError: (message: string) => void;
};

export function useNoteReferences({
  editor,
  noteId,
  elementId,
  workspaceId,
  onCreateAndLinkNote,
  onError,
}: UseNoteReferencesOptions) {
  const [referenceState, setReferenceState] = useState<ReferenceState | null>(null);
  const [referenceResults, setReferenceResults] = useState<NoteSummary[]>([]);
  const [blockResults, setBlockResults] = useState<NoteBlockSummary[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [referenceIndex, setReferenceIndex] = useState(0);

  const referenceResultsRef = useRef<NoteSummary[]>([]);
  const blockResultsRef = useRef<NoteBlockSummary[]>([]);
  const referencePickRef = useRef<(() => void) | null>(null);
  const creatingLinkRef = useRef(false);

  useEffect(() => {
    referenceResultsRef.current = referenceResults;
  }, [referenceResults]);

  useEffect(() => {
    blockResultsRef.current = blockResults;
  }, [blockResults]);

  const referenceQuery = referenceState?.query ?? "";
  const referenceMode = referenceState?.mode ?? null;
  const referenceStep = referenceState?.step ?? null;
  const referenceTargetNoteId = referenceState?.step === "pick-block" ? referenceState.targetNote.noteId : null;

  useEffect(() => {
    if (!referenceMode || referenceStep !== "pick-note") {
      setReferenceResults([]);
      return undefined;
    }
    const query = referenceQuery.trim();
    let active = true;
    const delay = query ? 90 : 0;
    const timer = window.setTimeout(() => {
      void listNotes({ q: query || undefined, limit: 8 })
        .then((notes) => {
          if (!active) return;
          const filtered = notes.filter((summary) => (
            Boolean(summary.id) && (referenceMode !== "slash-embed" || summary.id !== noteId)
          ));
          setReferenceResults(filtered.slice(0, 8));
        })
        .catch(() => {
          if (active) setReferenceResults([]);
        });
    }, delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [noteId, referenceMode, referenceQuery, referenceStep]);

  useEffect(() => {
    if (referenceStep !== "pick-block" || !referenceTargetNoteId) {
      setBlockResults([]);
      setBlocksLoading(false);
      return undefined;
    }
    let active = true;
    setBlocksLoading(true);
    setBlockResults([]);
    void getNote(referenceTargetNoteId)
      .then((target) => {
        if (!active) return;
        setBlockResults(listNoteBlocks(target.document));
        setBlocksLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setBlockResults([]);
        setBlocksLoading(false);
      });
    return () => {
      active = false;
    };
  }, [referenceStep, referenceTargetNoteId]);

  const mentionMatchRange = useCallback(() => {
    if (!editor) return null;
    const beforeCaret = editor.state.doc.textBetween(0, editor.state.selection.from, "\n");
    const mention = noteMentionQuery(beforeCaret);
    if (!mention) return null;
    return {
      from: Math.max(1, editor.state.selection.from - mention.matchLength),
      to: editor.state.selection.from,
    };
  }, [editor]);

  const insertInternalNoteLink = useCallback((
    targetNoteId: string,
    targetWorkspaceId: string,
    label: string,
    from: number,
    to: number,
  ) => {
    if (!editor) return;
    const href = `/workspaces/${encodeURIComponent(targetWorkspaceId)}?noteId=${encodeURIComponent(targetNoteId)}`;
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, label)
      .setTextSelection({ from, to: from + label.length })
      .setLink({ href })
      .setTextSelection(from + label.length)
      .run();
  }, [editor]);

  const applyReference = useCallback((summary: NoteSummary, action: "link" | "embed" | "block" = "link") => {
    if (!editor || !summary.id) return;
    if (action === "embed" && summary.id === noteId) {
      onError("A Note cannot embed itself.");
      return;
    }
    const label = noteSummaryLabel(summary);
    const targetWorkspace = noteSummaryWorkspace(summary, workspaceId);
    if (action === "block") {
      setReferenceIndex(0);
      setReferenceState((previous) => {
        if (!previous || previous.step !== "pick-note") return previous;
        if (previous.mode === "slash-embed") return previous;
        return {
          mode: previous.mode,
          ...(previous.mode === "mention" ? { trigger: previous.trigger, matchLength: previous.matchLength } : {}),
          query: previous.query,
          step: "pick-block",
          targetNote: { noteId: summary.id, workspaceId: targetWorkspace, label },
          position: previous.position,
        };
      });
      return;
    }
    if (referenceState?.mode === "slash-embed") {
      editor.chain().focus().insertContent({
        type: "noteEmbed",
        attrs: { noteId: summary.id, workspaceId: targetWorkspace, label },
      }).run();
      setReferenceState(null);
      return;
    }
    const range = mentionMatchRange();
    if (!range) return;
    if (action === "embed") {
      editor.chain().focus().deleteRange(range).insertContentAt(range.from, {
        type: "noteEmbed",
        attrs: { noteId: summary.id, workspaceId: targetWorkspace, label },
      }).run();
    } else {
      insertInternalNoteLink(summary.id, targetWorkspace, label, range.from, range.to);
    }
    setReferenceState(null);
  }, [editor, insertInternalNoteLink, mentionMatchRange, noteId, onError, referenceState?.mode, workspaceId]);

  const applyBlockReference = useCallback((block: NoteBlockSummary) => {
    if (!editor || referenceState?.step !== "pick-block") return;
    const { targetNote, mode } = referenceState;
    const node = {
      type: "noteBlockReference",
      attrs: {
        noteId: targetNote.noteId,
        workspaceId: targetNote.workspaceId,
        blockId: block.blockId,
      },
    };
    if (mode === "slash-block-ref") {
      editor.chain().focus().insertContent(node).run();
      setReferenceState(null);
      return;
    }
    const range = mentionMatchRange();
    if (!range) return;
    editor.chain().focus().deleteRange(range).insertContentAt(range.from, node).run();
    setReferenceState(null);
  }, [editor, mentionMatchRange, referenceState]);

  const createAndLinkQuery = useCallback(async (rawQuery: string) => {
    if (!editor || !onCreateAndLinkNote || creatingLinkRef.current) return;
    const title = rawQuery.trim();
    if (!title) return;
    const range = mentionMatchRange();
    if (!range) return;
    creatingLinkRef.current = true;
    try {
      const initialDocumentDoc = ensureNoteBlockIds({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: title }] }],
      });
      const created = await onCreateAndLinkNote(elementId, initialDocumentDoc);
      if (!created || editor.isDestroyed) return;
      const latestRange = mentionMatchRange() ?? range;
      insertInternalNoteLink(created.noteId, workspaceId, title, latestRange.from, latestRange.to);
      setReferenceState(null);
    } finally {
      creatingLinkRef.current = false;
    }
  }, [editor, elementId, insertInternalNoteLink, mentionMatchRange, onCreateAndLinkNote, workspaceId]);

  const canCreateAndLink = referenceState?.mode === "mention"
    && referenceState.step === "pick-note"
    && referenceState.query.trim().length > 0
    && Boolean(onCreateAndLinkNote);

  useEffect(() => {
    referencePickRef.current = () => {
      if (!referenceState) return;
      if (referenceState.step === "pick-block") {
        const blocks = blockResultsRef.current;
        const chosen = blocks[referenceIndex % Math.max(1, blocks.length)];
        if (chosen) applyBlockReference(chosen);
        return;
      }
      const results = referenceResultsRef.current;
      const total = results.length + (canCreateAndLink ? 1 : 0);
      if (total === 0) return;
      const activeIndex = referenceIndex % total;
      if (canCreateAndLink && activeIndex === results.length) {
        void createAndLinkQuery(referenceState.query);
        return;
      }
      const result = results[activeIndex];
      if (!result) return;
      const action = referenceState.mode === "slash-embed"
        ? "embed"
        : referenceState.mode === "slash-block-ref"
          ? "block"
          : "link";
      applyReference(result, action);
    };
  }, [applyBlockReference, applyReference, canCreateAndLink, createAndLinkQuery, referenceIndex, referenceState]);

  return {
    referenceState,
    setReferenceState,
    referenceResults,
    blockResults,
    blocksLoading,
    referenceIndex,
    setReferenceIndex,
    canCreateAndLink,
    referenceResultsRef,
    blockResultsRef,
    referencePickRef,
    mentionMatchRange,
    insertInternalNoteLink,
    applyReference,
    applyBlockReference,
    createAndLinkQuery,
  };
}
