import type { Elements, RenderChildren, RenderElement } from "claude-code";
import type { HubRow } from "./sources.ts";
import type { HubView, SidebarEntry, VisibleRow } from "./hub-state.ts";

// Draws the hub's view model with Box, Text, Input and Button only. Each action is a
// closure the controller supplies, so the drawing holds no state of its own. The
// elements include Select for a login the controller draws in the hub's pane.
//
// The host's focus ring holds a position in document order, not a key. So the main
// column, with the search field first, is drawn before the sidebar: a search that
// turns sidebar buttons into text moves nothing ahead of the field.

export type HubElements = Pick<Elements["terminal"], "Box" | "Text" | "Button" | "Input" | "Select">;

export type HubActions = {
  selectScope(id: string): void;
  setQuery(text: string): void;
  pick(row: HubRow): void;
  submit(): void;
  login(providerId: string): void;
};

const FOOTER = "Enter switch · Tab/↑↓ move · type to search · Esc clear/close";

function drawSidebar(elements: HubElements, entries: readonly SidebarEntry[], actions: HubActions): RenderElement {
  const { Box, Text, Button } = elements;
  return Box({
    width: 26,
    flexDirection: "column",
    children: entries.map((entry) =>
      entry.focusable
        ? Button({
            key: `scope:${entry.id}`,
            label: entry.label,
            dimColor: entry.dimmed,
            onPress: () => actions.selectScope(entry.id),
          })
        : Text({ dimColor: true, children: entry.label }),
    ),
  });
}

// A Button draws its Text children run together, so each row is one line: the id
// padded to the widest one shown, then the columns.
function drawRow(elements: HubElements, row: VisibleRow, width: number, actions: HubActions): RenderElement {
  const { Button, Text } = elements;
  const label = row.right === "" ? row.left : `${row.left.padEnd(width)}  ${row.right}`;
  return Button({
    key: row.key,
    dimColor: row.overContext,
    onPress: () => actions.pick(row.row),
    children: [Text({ tabular: true, dimColor: row.overContext, children: label })],
  });
}

function listChildren(elements: HubElements, view: HubView, actions: HubActions): RenderChildren[] {
  const { Text, Input } = elements;
  const children: RenderChildren[] = [
    Input({
      key: "search",
      placeholder: "Type to search",
      value: view.query,
      autoFocus: true,
      onInput: (text) => actions.setQuery(text),
      onSubmit: () => actions.submit(),
    }),
  ];
  // The notice, the detail line and the footer sit above the rows, so a list taller than the pane never hides them.
  if (view.notice !== undefined) children.push(Text({ color: "warning", children: view.notice }));
  if (view.detail !== undefined) children.push(Text({ children: view.detail }));
  children.push(Text({ dimColor: true, children: FOOTER }));
  if (view.rows.length === 0) {
    const empty = view.query.trim() === "" ? "No models in this list yet." : "No matching models.";
    children.push(Text({ dimColor: true, children: empty }));
  }
  const width = Math.max(0, ...view.rows.map((row) => row.left.length));
  for (const row of view.rows) children.push(drawRow(elements, row, width, actions));
  return children;
}

function lockedChildren(elements: HubElements, view: HubView, actions: HubActions): RenderChildren[] {
  const { Text, Button } = elements;
  const locked = view.locked;
  if (locked === undefined) return [];
  const children: RenderChildren[] = [
    Text({ bold: true, children: `${locked.label} has no credentials.` }),
    Text({ dimColor: true, children: `${locked.rows.length} ${locked.rows.length === 1 ? "model" : "models"} in catalog:` }),
    ...locked.rows.map((row) => Text({ dimColor: true, children: row.switchArg })),
    Button({
      key: "login",
      label: `Log in to ${locked.label}`,
      autoFocus: true,
      onPress: () => actions.login(locked.id),
    }),
    Text({ dimColor: true, children: FOOTER }),
  ];
  return children;
}

export function drawHub(elements: HubElements, view: HubView, actions: HubActions): RenderElement {
  const { Box } = elements;
  const main = Box({
    flexDirection: "column",
    flexGrow: 1,
    children: view.mode === "locked" ? lockedChildren(elements, view, actions) : listChildren(elements, view, actions),
  });
  return Box({
    flexDirection: "row-reverse",
    children: [main, drawSidebar(elements, view.sidebar, actions)],
  });
}

// The keys of the elements the ring can rest on, in the order drawHub draws them.
export function focusableKeys(view: HubView): string[] {
  const main = view.mode === "locked" ? ["login"] : ["search", ...view.rows.map((row) => row.key)];
  const sidebar = view.sidebar.filter((entry) => entry.focusable).map((entry) => `scope:${entry.id}`);
  return [...main, ...sidebar];
}
