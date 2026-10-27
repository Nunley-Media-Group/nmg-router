import type { CommandRunInput, CommandRunResult } from "claude-code";
import type { HubController, HubHost } from "./hub-controller.ts";
import { recordRecentUse } from "./recent.ts";

// `/model`. With arguments, the switch records the recent use and runs on through
// next(e), so Claude Code's own /model makes the switch. Bare, it opens the hub and
// answers at once: the hook's time budget cannot wait on the person's picks, which
// the hub's closures handle.

export type ModelNext = (input: CommandRunInput) => Promise<CommandRunResult>;

export async function handleModelCommand(
  host: HubHost,
  input: CommandRunInput,
  next: ModelNext,
  hub: HubController,
): Promise<CommandRunResult> {
  const arg = input.args.trim();
  if (arg !== "") {
    await recordRecentUse(host, arg, Date.now()).catch(() => undefined);
    return next(input);
  }
  await hub.open(host);
  return {};
}
