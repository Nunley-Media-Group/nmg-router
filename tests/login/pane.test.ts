import { describe, expect, it } from "vitest";
import { createPaneController, PANE_ID, type PaneElements, type PaneView, type SelectRow } from "../../src/login/pane.ts";
import { fakeEngine } from "../support/fake-engine.ts";

type Node = { readonly type: string; readonly props: Record<string, any> };

// Constructors that record their tag and props, so a test can read the drawn tree
// and call the handlers it holds.
const elements = {
  Box: (props: Record<string, unknown> = {}) => ({ type: "Box", props }),
  Text: (props: Record<string, unknown> = {}) => ({ type: "Text", props }),
  Button: (props: Record<string, unknown> = {}) => ({ type: "Button", props }),
  Input: (props: Record<string, unknown> = {}) => ({ type: "Input", props }),
  Select: (props: Record<string, unknown> = {}) => ({ type: "Select", props }),
} as unknown as PaneElements;

function nodesOf(tree: unknown, type: string): Node[] {
  const found: Node[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object" || value === null) return;
    const node = value as Node;
    if (node.type === type) found.push(node);
    visit(node.props?.children);
  };
  visit(tree);
  return found;
}

function rows(count: number): SelectRow[] {
  return Array.from({ length: count }, (_, index) => ({ value: `p${index}`, label: `Provider ${index}` }));
}

const selectView = (count: number): PaneView => ({ kind: "select", title: "Select provider to login", rows: rows(count) });

describe("pane picker", () => {
  it("shows a search field above 10 rows and not at 10", () => {
    for (const [count, shown] of [
      [10, false],
      [11, true],
    ] as const) {
      const pane = createPaneController();
      void pane.open(fakeEngine({ platform: "linux" }), selectView(count));
      const tree = pane.draw(elements);
      expect(nodesOf(tree, "Input").some((node) => node.props.key === "search")).toBe(shown);
      pane.closedByHost();
    }
  });

  it("filters the options with the typed search", () => {
    const pane = createPaneController();
    void pane.open(fakeEngine({ platform: "linux" }), selectView(11));
    const search = nodesOf(pane.draw(elements), "Input").find((node) => node.props.key === "search");
    search?.props.onInput("provider 7");
    const select = nodesOf(pane.draw(elements), "Select")[0];
    expect(select?.props.options.map((option: { value: string }) => option.value)).toEqual(["p7"]);
    pane.closedByHost();
  });

  it("says so when nothing matches", () => {
    const pane = createPaneController();
    void pane.open(fakeEngine({ platform: "linux" }), selectView(11));
    const search = nodesOf(pane.draw(elements), "Input").find((node) => node.props.key === "search");
    search?.props.onInput("zzz");
    const texts = nodesOf(pane.draw(elements), "Text").map((node) => node.props.children);
    expect(texts).toContain("No matching providers");
    pane.closedByHost();
  });

  it("resolves picked, opens focused with Escape-to-close, and closes itself", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const pane = createPaneController();
    const picked = pane.open(engine, selectView(3));
    const select = nodesOf(pane.draw(elements), "Select")[0];
    select?.props.onSelect("p1");

    expect(await picked).toEqual({ kind: "picked", value: "p1" });
    expect(engine.recorded.panes[0]).toMatchObject({ id: PANE_ID, focus: true });
    expect(engine.recorded.paneCloses).toEqual([PANE_ID]);
    expect(pane.isOpen()).toBe(false);
  });

  it("ends a step whose pane the host leaves undrawn, instead of waiting on it", async () => {
    // Opened outside the person's command at 91 columns, the host does not place it.
    const engine = fakeEngine({ platform: "linux", columns: 91 });
    const pane = createPaneController();

    expect(await pane.open(engine, selectView(3))).toEqual({ kind: "cancelled" });
    expect(engine.recorded.ui).toEqual(["The login pane could not be shown: unasked below 144 columns (91 now)"]);
    expect(engine.recorded.paneCloses).toEqual([PANE_ID]);
    expect(pane.isOpen()).toBe(false);
  });

  it("holds a begun pane across steps and closes it at the end", async () => {
    const engine = fakeEngine({ platform: "linux", columns: 91 });
    const pane = createPaneController();
    expect(await engine.asking(() => pane.begin(engine, "/login"))).toEqual({ isPlaced: true });

    const picked = pane.open(engine, selectView(3));
    nodesOf(pane.draw(elements), "Select")[0]?.props.onSelect("p1");
    expect(await picked).toEqual({ kind: "picked", value: "p1" });
    expect(nodesOf(pane.draw(elements), "Text").map((node) => node.props.children)).toEqual(["Working…"]);

    const submitted = pane.open(engine, { kind: "secret", title: "t", label: "l", hint: [] });
    nodesOf(pane.draw(elements), "Input")[0]?.props.onSubmit("");
    expect(await submitted).toEqual({ kind: "submitted", value: "" });
    expect(engine.recorded.panes).toHaveLength(1);
    expect(engine.recorded.paneCloses).toEqual([]);

    await pane.end();
    expect(engine.recorded.paneCloses).toEqual([PANE_ID]);
  });

  it("resolves cancelled when the host closes the pane", async () => {
    const pane = createPaneController();
    const cancelled = pane.open(fakeEngine({ platform: "linux" }), selectView(3));
    pane.closedByHost();
    expect(await cancelled).toEqual({ kind: "cancelled" });
  });
});

describe("pane secret field (AC6)", () => {
  it("draws only bullets and submits the typed secret", async () => {
    const engine = fakeEngine({ platform: "linux" });
    const pane = createPaneController();
    const submitted = pane.open(engine, {
      kind: "secret",
      title: "Log in to OpenCode Go",
      label: "OpenCode Go API key",
      hint: [],
    });

    const field = () => nodesOf(pane.draw(elements), "Input").find((node) => node.props.key === "secret");
    field()?.props.onInput("a");
    field()?.props.onInput("•b");
    field()?.props.onInput("•••c");
    const drawn = field()?.props.value;
    expect(drawn).toMatch(/^•+$/);
    field()?.props.onSubmit("•••c");

    expect(await submitted).toEqual({ kind: "submitted", value: "abc" });
    expect(JSON.stringify(engine.recorded.ui)).not.toContain("abc");
  });

  it("resolves cancelled from the Cancel button", async () => {
    const pane = createPaneController();
    const cancelled = pane.open(fakeEngine({ platform: "linux" }), {
      kind: "secret",
      title: "t",
      label: "l",
      hint: [],
    });
    const cancel = nodesOf(pane.draw(elements), "Button").find((node) => node.props.key === "cancel");
    cancel?.props.onPress({});
    expect(await cancelled).toEqual({ kind: "cancelled" });
  });
});
