import type { Elements, RenderChildren, RenderElement } from "claude-code";
import type { HostPort } from "../host.ts";
import { fuzzyFilter } from "./fuzzy.ts";
import { applyInput, maskOf } from "./masked-input.ts";

// One pane, drawn from the controller's current view. `open` resolves once the
// person picks, submits or closes; a close raised by the host resolves it as
// cancelled. A pending pane settles exactly once.
//
// The host places a pane at any width only when the person's command, prompt or
// press is behind its open; one opened later waits undrawn below 144 columns. A
// command therefore opens the pane with `begin` inside its hook and holds it:
// each step's `open` swaps the drawn view, and `end` closes it after the flow.

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

export type PaneBegin = { readonly isPlaced: true } | { readonly isPlaced: false; readonly reason: string };

export type PaneController = {
  // Opens and holds the pane for a command's flow. Called inside the command's
  // hook, so the open answers the person's command and is placed at any width.
  begin(host: PaneHost, title: string): Promise<PaneBegin>;
  // Closes a held pane once the flow is done; a pane already gone is left alone.
  end(): Promise<void>;
  open(host: PaneHost, view: PaneView): Promise<PaneResult>;
  draw(elements: PaneElements): RenderElement;
  // Called on `ui.close` for the pane. A close the controller asked for has
  // already settled, so it does nothing.
  closedByHost(): void;
  isOpen(): boolean;
};

export function createPaneController(): PaneController {
  let pending: Pending | undefined;
  // The host of a pane held open by `begin`, until `end` or the host closes it.
  let held: PaneHost | undefined;

  function settle(result: PaneResult, closePane: boolean): void {
    const current = pending;
    if (current === undefined || current.settled) return;
    current.settled = true;
    pending = undefined;
    current.resolve(result);
    if (held !== undefined) {
      // A held pane stays up for the flow's next step.
      redraw(current);
      return;
    }
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

  const OPEN_ARGS = { id: PANE_ID, focus: true, closeOnEscape: true, holdToasts: true } as const;

  return {
    async begin(host, title) {
      settle({ kind: "cancelled" }, false);
      held = host;
      try {
        const opened = await host.ui.open({ ...OPEN_ARGS, title });
        if (opened.isPlaced) return { isPlaced: true };
        await this.end();
        return { isPlaced: false, reason: opened.reason };
      } catch {
        held = undefined;
        return { isPlaced: false, reason: "the host refused to open it" };
      }
    },
    async end() {
      const host = held;
      held = undefined;
      settle({ kind: "cancelled" }, false);
      if (host !== undefined) await host.ui.close({ id: PANE_ID }).catch(() => undefined);
    },
    async open(host, view) {
      settle({ kind: "cancelled" }, false);
      const result = new Promise<PaneResult>((resolve) => {
        pending = { view, host, resolve, query: "", secret: "", typed: "", settled: false };
      });
      if (held !== undefined) {
        // The held pane is already placed; reopening it would be an unasked open.
        host.ui.invalidate("ui.render");
        return result;
      }
      try {
        const opened = await host.ui.open({ ...OPEN_ARGS, title: view.title });
        if (!opened.isPlaced) {
          // An undrawn pane cannot be answered, so the step ends instead of waiting.
          host.ui.log(`The login pane could not be shown: ${opened.reason}`);
          settle({ kind: "cancelled" }, true);
        }
      } catch {
        settle({ kind: "cancelled" }, false);
      }
      return result;
    },
    draw(elements) {
      const state = pending;
      if (state === undefined) {
        // Between a held pane's steps, while the flow works on the last answer.
        const working = elements.Text({ dimColor: true, children: "Working…" });
        return elements.Box({ children: held === undefined ? [] : [working] });
      }
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
      held = undefined;
      settle({ kind: "cancelled" }, false);
    },
    isOpen() {
      return pending !== undefined;
    },
  };
}
