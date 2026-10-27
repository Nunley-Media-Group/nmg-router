import type { Elements, RenderChildren, RenderElement } from "claude-code";
import type { HubRow } from "./sources.ts";
import type { HubView, SidebarEntry, VisibleRow } from "./hub-state.ts";

// Draws the hub's view model with Box, Text, Input and Button only. Each action is a
// closure the controller supplies, so the drawing holds no state of its own.

export type HubElements = Pick<Elements["terminal"], "Box" | "Text" | "Button" | "Input">;

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

function drawRow(elements: HubElements, row: VisibleRow, actions: HubActions): RenderElement {
  const { Button, Text } = elements;
  return Button({
    key: row.key,
    dimColor: row.overContext,
    onPress: () => actions.pick(row.row),
    children: [
      Text({ tabular: true, dimColor: row.overContext, children: row.left }),
      Text({ tabular: true, dimColor: true, children: row.right }),
    ],
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
  if (view.rows.length === 0) {
    const empty = view.query.trim() === "" ? "No models in this list yet." : "No matching models.";
    children.push(Text({ dimColor: true, children: empty }));
  }
  for (const row of view.rows) children.push(drawRow(elements, row, actions));
  if (view.detail !== undefined) children.push(Text({ children: view.detail }));
  children.push(Text({ dimColor: true, children: FOOTER }));
  return children;
}

function lockedChildren(elements: HubElements, view: HubView, actions: HubActions): RenderChildren[] {
  const { Text, Button } = elements;
  const locked = view.locked;
  if (locked === undefined) return [];
  const children: RenderChildren[] = [
    Text({ bold: true, children: `${locked.label} has no credentials.` }),
    Text({ dimColor: true, children: `${locked.rows.length} models in catalog:` }),
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
    flexDirection: "row",
    children: [drawSidebar(elements, view.sidebar, actions), main],
  });
}
