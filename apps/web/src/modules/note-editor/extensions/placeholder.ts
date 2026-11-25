import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const placeholderPluginKey = new PluginKey<{ focused: boolean }>("notePlaceholder");
const NOTE_PLACEHOLDER_TEXT = "Write a note, or type / for commands…";

/** Shows a CSS-only placeholder decoration on an empty focused/editable Note without mutating document text. */
export const NotePlaceholder = Extension.create({
  name: "notePlaceholder",
  addProseMirrorPlugins() {
    return [
      new Plugin<{ focused: boolean }>({
        key: placeholderPluginKey,
        state: {
          init: () => ({ focused: false }),
          apply: (tr, value) => {
            const meta = tr.getMeta(placeholderPluginKey) as { focused?: boolean } | undefined;
            return typeof meta?.focused === "boolean" ? { focused: meta.focused } : value;
          },
        },
        props: {
          handleDOMEvents: {
            focus: (view) => {
              const current = placeholderPluginKey.getState(view.state);
              if (!current?.focused) {
                view.dispatch(
                  view.state.tr
                    .setMeta(placeholderPluginKey, { focused: true })
                    .setMeta("addToHistory", false),
                );
              }
              return false;
            },
            blur: (view) => {
              const current = placeholderPluginKey.getState(view.state);
              if (current?.focused) {
                view.dispatch(
                  view.state.tr
                    .setMeta(placeholderPluginKey, { focused: false })
                    .setMeta("addToHistory", false),
                );
              }
              return false;
            },
          },
          decorations: (state) => {
            if (!this.editor.isEditable) return DecorationSet.empty;
            const pluginState = placeholderPluginKey.getState(state);
            const focused = pluginState?.focused || this.editor.isFocused;
            if (!focused) return DecorationSet.empty;
            const { doc } = state;
            const first = doc.firstChild;
            if (
              doc.childCount !== 1
              || !first
              || first.type.name !== "paragraph"
              || first.content.size > 0
            ) {
              return DecorationSet.empty;
            }
            return DecorationSet.create(doc, [
              Decoration.node(0, first.nodeSize, {
                class: "notespace-note-empty",
                "data-placeholder": NOTE_PLACEHOLDER_TEXT,
              }),
            ]);
          },
        },
      }),
    ];
  },
});
