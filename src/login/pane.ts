import type { Elements, RenderChildren, RenderElement } from "claude-code";
import type { HostPort } from "../host.ts";
import { fuzzyFilter } from "./fuzzy.ts";
import { applyInput, maskOf } from "./masked-input.ts";

// One pane, drawn from the controller's current view. `open` resolves once the
// person picks, submits or closes; a close raised by the host resolves it as
// cancelled. A pending pane settles exactly once.

export const PANE_ID = "nmg-router-login";

// Above this many rows the picker shows a search field.
export const SEARCH_THRESHOLD = 10;

export type PaneHost = Pick<HostPort, "ui">;

export type PaneElements = Pick<Elements["terminal"], "Box" | "Text" | "Button" | "Input" | "Select">;

export type SelectRow = {
  readonly value: string;
  readonly label: string;
  readonly status?: string;
};

export type PaneView =
  | {
      readonly kind: "select";
      readonly title: string;
      readonly rows: readonly SelectRow[];
      readonly selected?: string;
    }
  | {
      readonly kind: "secret";
      readonly title: string;
      readonly label: string;
      readonly hint: readonly string[];
    }
  | {
      readonly kind: "text";
      readonly title: string;
      readonly label: string;
      readonly lines: readonly string[];
    };

export type PaneResult = { readonly kind: "picked" | "submitted"; readonly value: string } | { readonly kind: "cancelled" };

type Pending = {
  readonly view: PaneView;
  readonly host: PaneHost;
  readonly resolve: (result: PaneResult) => void;
  query: string;
  secret: string;
  typed: string;
  settled: boolean;
};

export type PaneController = {
  open(host: PaneHost, view: PaneView): Promise<PaneResult>;
  draw(elements: PaneElements): RenderElement;
  // Called on `ui.close` for the pane. A close the controller asked for has
  // already settled, so it does nothing.
  closedByHost(): void;
  isOpen(): boolean;
};

export function createPaneController(): PaneController {
  let pending: Pending | undefined;

  function settle(result: PaneResult, closePane: boolean): void {
    const current = pending;
    if (current === undefined || current.settled) return;
    current.settled = true;
    pending = undefined;
    current.resolve(result);
    if (closePane) current.host.ui.close({ id: PANE_ID }).catch(() => undefined);
  }

  function redraw(state: Pending): void {
    state.host.ui.invalidate("ui.render");
  }

  function drawSelect(elements: PaneElements, state: Pending, view: Extract<PaneView, { kind: "select" }>): RenderElement {
    const { Box, Text, Input, Select, Button } = elements;
    const searchable = view.rows.length > SEARCH_THRESHOLD;
    const rows = searchable
      ? fuzzyFilter(view.rows, state.query, (row) => `${row.label} ${row.value} ${row.status ?? ""}`)
      : [...view.rows];
    const options = rows.map((row) => ({
      value: row.value,
      label: row.status === undefined ? row.label : `${row.label} — ${row.status}`,
    }));
    const selected = rows.some((row) => row.value === view.selected) ? view.selected : rows[0]?.value;

    const children: RenderChildren[] = [Text({ bold: true, children: view.title })];
    if (searchable) {
      children.push(
        Input({
          key: "search",
          placeholder: "Type to search",
          value: state.query,
          autoFocus: true,
          onInput: (value) => {
            state.query = value;
            redraw(state);
          },
          onSubmit: () => {
            const first = rows[0];
            if (first !== undefined) settle({ kind: "picked", value: first.value }, true);
          },
        }),
      );
    }
    if (rows.length === 0) {
      children.push(Text({ dimColor: true, children: "No matching providers" }));
    } else {
      children.push(
        Select({
          key: "pick",
          options,
          value: selected,
          autoFocus: searchable ? undefined : true,
          onSelect: (value) => settle({ kind: "picked", value }, true),
        }),
      );
    }
    children.push(Button({ key: "cancel", label: "Cancel", onPress: () => settle({ kind: "cancelled" }, true) }));
    return Box({ children });
  }

  function drawSecret(elements: PaneElements, state: Pending, view: Extract<PaneView, { kind: "secret" }>): RenderElement {
    const { Box, Text, Input, Button } = elements;
    const children: RenderChildren[] = [
      Text({ bold: true, children: view.title }),
      ...view.hint.map((line) => Text({ dimColor: true, children: line })),
      Input({
        key: "secret",
        label: view.label,
        placeholder: "Paste or type the key",
        value: maskOf(state.secret),
        autoFocus: true,
        onInput: (value) => {
          state.secret = applyInput(state.secret, value);
          redraw(state);
        },
        onSubmit: () => settle({ kind: "submitted", value: state.secret }, true),
      }),
      Button({ key: "cancel", label: "Cancel", onPress: () => settle({ kind: "cancelled" }, true) }),
    ];
    return Box({ children });
  }

  function drawText(elements: PaneElements, state: Pending, view: Extract<PaneView, { kind: "text" }>): RenderElement {
    const { Box, Text, Input, Button } = elements;
    const children: RenderChildren[] = [
      Text({ bold: true, children: view.title }),
      ...view.lines.map((line) => Text({ children: line })),
      Input({
        key: "paste",
        label: view.label,
        placeholder: "Paste here",
        value: state.typed,
        autoFocus: true,
        onInput: (value) => {
          state.typed = value;
        },
        onSubmit: (value) => settle({ kind: "submitted", value }, true),
      }),
      Button({ key: "cancel", label: "Cancel", onPress: () => settle({ kind: "cancelled" }, true) }),
    ];
    return Box({ children });
  }

  return {
    async open(host, view) {
      settle({ kind: "cancelled" }, false);
      const result = new Promise<PaneResult>((resolve) => {
        pending = { view, host, resolve, query: "", secret: "", typed: "", settled: false };
      });
      try {
        const opened = await host.ui.open({
          id: PANE_ID,
          title: view.title,
          focus: true,
          closeOnEscape: true,
          holdToasts: true,
        });
        if (!opened.isPlaced) host.ui.log(`The login pane waits for a wider terminal: ${opened.reason}`);
      } catch {
        settle({ kind: "cancelled" }, false);
      }
      return result;
    },
    draw(elements) {
      const state = pending;
      if (state === undefined) return elements.Box({ children: [] });
      switch (state.view.kind) {
        case "select":
          return drawSelect(elements, state, state.view);
        case "secret":
          return drawSecret(elements, state, state.view);
        case "text":
          return drawText(elements, state, state.view);
      }
    },
    closedByHost() {
      settle({ kind: "cancelled" }, false);
    },
    isOpen() {
      return pending !== undefined;
    },
  };
}
