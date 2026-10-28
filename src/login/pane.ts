import type { Elements, PaneOpenArgs, RenderChildren, RenderElement } from "claude-code";
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
//
// `autoFocus` places the focus ring only as the pane takes the keyboard, and the
// keys go back to the prompt while the pane holds nothing focusable. So the
// "Working…" view between steps keeps a Cancel button, and each held step moves
// the ring onto its field with `ui.focus`, asking for the keys again if the pane
// lost them. A `begin` hands back its hold, and only that hold's `end` closes the
// pane, so a flow superseded by the next command cannot close that command's pane.

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

// One command's claim on the held pane. `closed` once the person closes it, so
// the flow's later steps end instead of reopening a pane nobody asked for.
export type PaneHold = { readonly host: PaneHost; closed: boolean };

export type PaneBegin = { readonly isPlaced: true; readonly hold: PaneHold } | { readonly isPlaced: false; readonly reason: string };

export type PaneController = {
  // Opens and holds the pane for a command's flow. Called inside the command's
  // hook, so the open answers the person's command and is placed at any width.
  begin(host: PaneHost, title: string): Promise<PaneBegin>;
  // Closes the pane `hold` holds once its flow is done. A hold a later `begin`
  // replaced, or a pane already gone, is left alone.
  end(hold: PaneHold): Promise<void>;
  open(host: PaneHost, view: PaneView): Promise<PaneResult>;
  draw(elements: PaneElements): RenderElement;
  // Called on `ui.close` for the pane. A close the controller asked for has
  // already settled, so it does nothing.
  closedByHost(): void;
  isOpen(): boolean;
};

export function createPaneController(): PaneController {
  const openArgs: PaneOpenArgs = { id: PANE_ID, focus: true, closeOnEscape: true, holdToasts: true };
  let pending: Pending | undefined;
  // The pane held open by the latest `begin`, until its `end`.
  let held: PaneHold | undefined;

  async function closeSite(host: PaneHost): Promise<void> {
    await host.ui.close({ id: PANE_ID }).catch(() => undefined);
  }

  function settle(result: PaneResult, closePane: boolean): void {
    const current = pending;
    if (current === undefined || current.settled) return;
    current.settled = true;
    pending = undefined;
    current.resolve(result);
    if (held !== undefined && !held.closed) {
      // A held pane stays up for the flow's next step.
      redraw(current);
      return;
    }
    if (closePane && held === undefined) void closeSite(current.host);
  }

  function redraw(state: Pending): void {
    state.host.ui.invalidate("ui.render");
  }

  // The element a step's keys belong to, by the key it is drawn under.
  function fieldOf(view: PaneView): string {
    if (view.kind === "secret") return "secret";
    if (view.kind === "text") return "paste";
    if (view.rows.length > SEARCH_THRESHOLD) return "search";
    return view.rows.length === 0 ? "cancel" : "pick";
  }

  // Puts the ring on the step's field. A held pane that lost the keyboard while
  // the flow worked asks for it again, as its first open did, and retries once.
  async function focusStep(hold: PaneHold, view: PaneView): Promise<void> {
    const target = { requestId: PANE_ID, key: fieldOf(view) };
    try {
      if ((await hold.host.ui.focus(target)).deny === undefined || hold !== held || hold.closed) return;
      const opened = await hold.host.ui.open({ ...openArgs, title: view.title });
      if (opened.isPlaced && hold === held && !hold.closed) await hold.host.ui.focus(target);
    } catch {
      // The person can still click or Tab into the field.
    }
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
    return Box({ flexDirection: "column", children });
  }

  function drawSecret(elements: PaneElements, state: Pending, view: Extract<PaneView, { kind: "secret" }>): RenderElement {
    const { Box, Text, Input, Button } = elements;
    // The host draws a person's typing or paste in an Input until the hook draws
    // again, and the Input has no masking. So the field takes the keys inside a
    // zero-height clip that draws none of it, and a Text shows the bullets.
    const masked = maskOf(state.secret);
    const children: RenderChildren[] = [
      Text({ bold: true, children: view.title }),
      ...view.hint.map((line) => Text({ dimColor: true, children: line })),
      Text({ children: `${view.label}: ${masked === "" ? "(paste or type the key)" : masked}` }),
      Box({
        height: 0,
        overflow: "hidden",
        children: [
          Input({
            key: "secret",
            label: view.label,
            value: masked,
            autoFocus: true,
            onInput: (value) => {
              state.secret = applyInput(state.secret, value);
              redraw(state);
            },
            onSubmit: () => settle({ kind: "submitted", value: state.secret }, true),
          }),
        ],
      }),
      Button({ key: "cancel", label: "Cancel", onPress: () => settle({ kind: "cancelled" }, true) }),
    ];
    return Box({ flexDirection: "column", children });
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
    return Box({ flexDirection: "column", children });
  }

  return {
    async begin(host, title) {
      settle({ kind: "cancelled" }, false);
      const hold: PaneHold = { host, closed: false };
      held = hold;
      try {
        const opened = await host.ui.open({ ...openArgs, title });
        if (opened.isPlaced) return { isPlaced: true, hold };
        await this.end(hold);
        return { isPlaced: false, reason: opened.reason };
      } catch {
        if (held === hold) held = undefined;
        return { isPlaced: false, reason: "the host refused to open it" };
      }
    },
    async end(hold) {
      if (hold !== held) return;
      held = undefined;
      settle({ kind: "cancelled" }, false);
      if (!hold.closed) await closeSite(hold.host);
    },
    async open(host, view) {
      settle({ kind: "cancelled" }, false);
      const result = new Promise<PaneResult>((resolve) => {
        pending = { view, host, resolve, query: "", secret: "", typed: "", settled: false };
      });
      if (held !== undefined) {
        // The person closed the held pane while the flow worked: the step ends.
        if (held.closed) settle({ kind: "cancelled" }, false);
        else {
          host.ui.invalidate("ui.render");
          void focusStep(held, view);
        }
        return result;
      }
      try {
        const opened = await host.ui.open({ ...openArgs, title: view.title });
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
        // The button keeps a focusable element in the pane, so it keeps the keys.
        const hold = held;
        if (hold === undefined || hold.closed) return elements.Box({ children: [] });
        const { Box, Text, Button } = elements;
        return Box({
          flexDirection: "column",
          children: [
            Text({ dimColor: true, children: "Working…" }),
            Button({
              key: "cancel",
              label: "Cancel",
              autoFocus: true,
              onPress: () => {
                hold.closed = true;
                void closeSite(hold.host);
              },
            }),
          ],
        });
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
      if (held !== undefined) held.closed = true;
      settle({ kind: "cancelled" }, false);
    },
    isOpen() {
      return pending !== undefined;
    },
  };
}
