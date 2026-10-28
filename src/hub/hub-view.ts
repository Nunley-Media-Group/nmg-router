import type { Elements, RenderChildren, RenderElement } from "claude-code";
import type { HubRow } from "./sources.ts";
import type { HubView, VisibleRow } from "./hub-state.ts";

// Draws the hub's view model with Box, Text, Input and Select. Each action is a
// closure the controller supplies, so the drawing holds no state of its own.
//
// A pane holding the keyboard scrolls its body on the arrows and lets the left
// arrow through to the prompt, which leaves the session for the agents list. A
// Select keeps every arrow while it holds the ring, so the models and the
// providers are each one Select, and Tab walks the models, the providers and the
// search field. The ring starts on the models, so the arrows move through them at once.
//
// A Select away from the ring draws one line, its selected option. So each draws
// the options after it as dim text until it takes the ring: the providers all, the
// models a few, which keeps the body inside the pane.
//
// The host's focus ring holds a position in document order, not a key. So the main
// column, with the search field first, is drawn before the sidebar.

export type HubElements = Pick<Elements["terminal"], "Box" | "Text" | "Input" | "Select">;

export type HubActions = {
  selectScope(id: string): void;
  setQuery(text: string): void;
  pick(row: HubRow): void;
  submit(): void;
};

export const MODELS_KEY = "models";
export const SCOPES_KEY = "scopes";

const FOOTER = "↑↓ choose · Enter switch · Tab providers/search · Esc clear/close";
const PREVIEW_ROWS = 8;

// The dim lines a Select away from the ring draws after its selected option.
function preview(elements: HubElements, labels: readonly string[], limit: number): RenderChildren[] {
  const { Text } = elements;
  const shown = labels.slice(0, limit).map((label) => Text({ dimColor: true, children: `  ${label}` }));
  const more = labels.length - limit;
  return more > 0 ? [...shown, Text({ dimColor: true, children: `  … ${more} more` })] : shown;
}

function drawSidebar(elements: HubElements, view: HubView, actions: HubActions, ring: string | undefined): RenderElement {
  const { Box, Select } = elements;
  const others = view.sidebar.filter((entry) => entry.id !== view.scope).map((entry) => entry.label);
  return Box({
    width: 26,
    flexDirection: "column",
    children: [
      Select({
        key: SCOPES_KEY,
        options: view.sidebar.map((entry) => ({ value: entry.id, label: entry.label })),
        value: view.scope,
        onSelect: (id) => actions.selectScope(id),
      }),
      ...(ring === SCOPES_KEY ? [] : preview(elements, others, others.length)),
    ],
  });
}

// Each option is one line: the id padded to the widest one shown, then the columns.
export function rowLabel(row: VisibleRow, width: number): string {
  return row.right === "" ? row.left : `${row.left.padEnd(width)}  ${row.right}`;
}

function listChildren(elements: HubElements, view: HubView, actions: HubActions, ring: string | undefined): RenderChildren[] {
  const { Text, Input, Select } = elements;
  const children: RenderChildren[] = [
    Input({
      key: "search",
      placeholder: "Type to search",
      value: view.query,
      onInput: (text) => actions.setQuery(text),
      onSubmit: () => actions.submit(),
    }),
  ];
  // The notice, the detail line and the footer sit above the list, so a list taller than the pane never hides them.
  if (view.notice !== undefined) children.push(Text({ color: "warning", children: view.notice }));
  if (view.detail !== undefined) children.push(Text({ children: view.detail }));
  children.push(Text({ dimColor: true, children: FOOTER }));
  if (view.rows.length === 0) {
    const empty = view.query.trim() === "" ? "No models in this list yet." : "No matching models.";
    children.push(Text({ dimColor: true, children: empty }));
    return children;
  }
  const width = Math.max(0, ...view.rows.map((row) => row.left.length));
  children.push(
    Select({
      key: MODELS_KEY,
      options: view.rows.map((row) => ({ value: row.key, label: rowLabel(row, width) })),
      value: view.selected,
      autoFocus: true,
      onSelect: (key) => {
        const picked = view.rows.find((row) => row.key === key);
        if (picked !== undefined) actions.pick(picked.row);
      },
    }),
  );
  if (ring !== MODELS_KEY) {
    const others = view.rows.filter((row) => row.key !== view.selected).map((row) => rowLabel(row, width));
    children.push(...preview(elements, others, PREVIEW_ROWS));
  }
  return children;
}

// `ring` is the key of the element holding the focus ring, when the controller knows it.
export function drawHub(elements: HubElements, view: HubView, actions: HubActions, ring?: string): RenderElement {
  const { Box } = elements;
  const main = Box({
    flexDirection: "column",
    flexGrow: 1,
    children: listChildren(elements, view, actions, ring),
  });
  return Box({
    flexDirection: "row-reverse",
    children: [main, drawSidebar(elements, view, actions, ring)],
  });
}

// The keys of the elements the ring can rest on, in the order drawHub draws them.
export function focusableKeys(view: HubView): string[] {
  const main = ["search", ...(view.rows.length > 0 ? [MODELS_KEY] : [])];
  return [...main, SCOPES_KEY];
}

// Where the ring goes when it has no place of its own: the models, else the search field.
export function homeKey(view: HubView): string {
  return view.rows.length > 0 ? MODELS_KEY : "search";
}
