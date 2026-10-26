import { describe, expect, it, vi } from "vitest";
import {
  createPaneController,
  PANE_ID,
  type PaneController,
  type PaneElements,
  type PaneHold,
  type PaneView,
  type SelectRow,
} from "../../src/login/pane.ts";
import { fakeEngine, type FakeEngine } from "../support/fake-engine.ts";

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
    const begun = await engine.asking(() => pane.begin(engine, "/login"));
    expect(begun).toMatchObject({ isPlaced: true });
    if (!begun.isPlaced) throw new Error("not placed");

    const picked = pane.open(engine, selectView(3));
    nodesOf(pane.draw(elements), "Select")[0]?.props.onSelect("p1");
    expect(await picked).toEqual({ kind: "picked", value: "p1" });
    expect(nodesOf(pane.draw(elements), "Text").map((node) => node.props.children)).toEqual(["Working…"]);

    const submitted = pane.open(engine, { kind: "secret", title: "t", label: "l", hint: [] });
    nodesOf(pane.draw(elements), "Input")[0]?.props.onSubmit("");
    expect(await submitted).toEqual({ kind: "submitted", value: "" });
    expect(engine.recorded.panes).toHaveLength(1);
    expect(engine.recorded.paneCloses).toEqual([]);

    await pane.end(begun.hold);
    expect(engine.recorded.paneCloses).toEqual([PANE_ID]);
  });

  it("lays each step out as a column, so the URL and field are not squeezed side by side", () => {
    const pane = createPaneController();
    void pane.open(fakeEngine({ platform: "linux" }), { kind: "text", title: "t", label: "l", lines: ["a"] });
    expect((pane.draw(elements) as unknown as Node).props.flexDirection).toBe("column");
    pane.closedByHost();
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

  it("keeps the field in a zero-height clip, so the host's raw echo is never drawn", () => {
    const pane = createPaneController();
    void pane.open(fakeEngine({ platform: "linux" }), {
      kind: "secret",
      title: "Log in to OpenCode Go",
      label: "OpenCode Go API key",
      hint: [],
    });
    const field = () => nodesOf(pane.draw(elements), "Input").find((node) => node.props.key === "secret");
    // The host draws a typed or pasted chunk in the field until the hook draws
    // again, so the field itself must draw nothing.
    field()?.props.onInput("sk-raw1");

    const tree = pane.draw(elements);
    const clip = nodesOf(tree, "Box").find((box) => nodesOf(box.props.children, "Input").length > 0 && box.props.height === 0);
    expect(clip?.props.overflow).toBe("hidden");
    expect(nodesOf(clip?.props.children, "Input").map((node) => node.props.key)).toEqual(["secret"]);
    const shown = nodesOf(tree, "Text").map((node) => String(node.props.children));
    expect(shown).toContain("OpenCode Go API key: •••••••");
    expect(JSON.stringify(tree)).not.toContain("sk-raw1");
    pane.closedByHost();
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

// Opens and holds the pane as a command's hook does, answering the person.
async function held(engine: FakeEngine, pane: PaneController): Promise<PaneHold> {
  const begun = await engine.asking(() => pane.begin(engine, "/login"));
  if (!begun.isPlaced) throw new Error(`not placed: ${begun.reason}`);
  return begun.hold;
}

const textView: PaneView = { kind: "text", title: "Log in to OpenAI Codex", label: "Redirect URL or code", lines: ["url"] };

describe("held pane keyboard focus (AC7)", () => {
  it("moves the ring onto each step's field without reopening the pane", async () => {
    const engine = fakeEngine({ platform: "macos", columns: 91 });
    const pane = createPaneController();
    await held(engine, pane);

    const picked = pane.open(engine, selectView(3));
    await vi.waitFor(() => expect(engine.recorded.focus).toEqual(["pick"]));
    nodesOf(pane.draw(elements), "Select")[0]?.props.onSelect("p1");
    await picked;

    void pane.open(engine, textView);
    await vi.waitFor(() => expect(engine.recorded.focus).toEqual(["pick", "paste"]));
    expect(engine.recorded.panes).toHaveLength(1);
    expect(engine.keyboard()).toBe(PANE_ID);
  });

  it("takes the keyboard back for the paste step when the pane lost it while the flow worked", async () => {
    const engine = fakeEngine({ platform: "macos", columns: 91 });
    const pane = createPaneController();
    await held(engine, pane);
    const picked = pane.open(engine, selectView(3));
    nodesOf(pane.draw(elements), "Select")[0]?.props.onSelect("p1");
    await picked;

    // The keys went back to the prompt between the steps.
    engine.dropKeys();
    const pasted = pane.open(engine, textView);

    await vi.waitFor(() => expect(engine.recorded.focus.at(-1)).toBe("paste"));
    expect(engine.keyboard()).toBe(PANE_ID);
    // The pane is asked to focus again; it is not closed or placed anew.
    expect(engine.recorded.panes.at(-1)).toMatchObject({ id: PANE_ID, focus: true, title: textView.title });
    expect(engine.recorded.paneCloses).toEqual([]);
    expect(engine.recorded.ui).toEqual([]);

    nodesOf(pane.draw(elements), "Input").find((node) => node.props.key === "paste")?.props.onSubmit("code");
    expect(await pasted).toEqual({ kind: "submitted", value: "code" });
  });

  it("keeps a focusable Cancel between steps, which ends the flow's next step without reopening", async () => {
    const engine = fakeEngine({ platform: "macos", columns: 91 });
    const pane = createPaneController();
    const hold = await held(engine, pane);
    const picked = pane.open(engine, selectView(3));
    nodesOf(pane.draw(elements), "Select")[0]?.props.onSelect("p1");
    await picked;

    const cancel = nodesOf(pane.draw(elements), "Button").find((node) => node.props.key === "cancel");
    expect(cancel?.props.autoFocus).toBe(true);
    cancel?.props.onPress({});
    pane.closedByHost();

    expect(await pane.open(engine, textView)).toEqual({ kind: "cancelled" });
    expect(engine.recorded.panes).toHaveLength(1);
    await pane.end(hold);
    expect(engine.recorded.paneCloses).toEqual([PANE_ID]);
  });
});

describe("superseded holds", () => {
  it("leaves the pane of a later begin open when the earlier flow ends", async () => {
    const engine = fakeEngine({ platform: "macos", columns: 91 });
    const pane = createPaneController();
    const first = await held(engine, pane);
    const firstStep = pane.open(engine, selectView(3));

    const second = await held(engine, pane);
    expect(await firstStep).toEqual({ kind: "cancelled" });
    await pane.end(first);
    expect(engine.recorded.paneCloses).toEqual([]);

    // The later flow's step draws in the pane its own begin holds.
    void pane.open(engine, selectView(3));
    expect(nodesOf(pane.draw(elements), "Select")).toHaveLength(1);
    expect(engine.recorded.ui).toEqual([]);
    await pane.end(second);
    expect(engine.recorded.paneCloses).toEqual([PANE_ID]);
  });
});
