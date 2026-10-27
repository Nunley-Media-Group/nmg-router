import type { CommandRunInput, CommandRunResult } from "claude-code";
import type { HubController, HubHost } from "./hub-controller.ts";
import { recordRecentUse } from "./recent.ts";

// `/model`. With arguments, the switch records the recent use and runs on through
// next(e), so Claude Code's own /model makes the switch. Bare, it opens the hub and
// answers at once: the hook's time budget cannot wait on the person's picks, which
// the hub's closures handle.
//
// Core's /model takes a routed id only once Claude Code has loaded its settings row,
// so the switch first waits, within the hook's budget, for `rowLoaded` to see it.

export type ModelNext = (input: CommandRunInput) => Promise<CommandRunResult>;
export type RowLoaded = (model: string) => Promise<boolean>;

export async function handleModelCommand(
  host: HubHost,
  input: CommandRunInput,
  next: ModelNext,
  hub: HubController,
  rowLoaded: RowLoaded = async () => true,
): Promise<CommandRunResult> {
  const arg = input.args.trim();
  if (arg !== "") {
    await recordRecentUse(host, arg, Date.now()).catch(() => undefined);
    if (!(await rowLoaded(arg))) host.ui.log(`nmg-router: Claude Code has not loaded ${arg}'s model picker row yet.`);
    return next(input);
  }
  await hub.open(host);
  return {};
}
