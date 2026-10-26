import type { CommandRunArgs, CommandRunInput, CommandRunResult } from "claude-code";
import type { HostPort } from "../host.ts";
import type { PaneController } from "./pane.ts";

// The host bounds a `command.run` hook at 10 s of its own time, and the person's
// time in the pane is not a `$` call, so a flow awaited inside the hook runs out
// and the host runs the built-in command in its place. The hook answers at once
// instead, and the flow runs after it: its outcome is a transcript line. An
// Anthropic pick re-runs the command through the host, and the hook hands that
// run to next(e), so Claude Code's own login or logout runs unchanged.
//
// The pane is opened before the hook answers: a `$` call pauses the budget, and
// an open behind the person's command is placed at any width (pane.ts). The flow
// draws its steps in that held pane, and it closes when the flow ends or hands off.

export type FlowHost = Pick<HostPort, "ui"> & {
  readonly command: {
    run(input: CommandRunArgs): Promise<CommandRunResult>;
  };
};

type Next = (input: CommandRunInput) => Promise<CommandRunResult>;

export type CommandFlows = {
  // True for the re-run of an Anthropic pick, which the hook hands to next(e).
  isHandoff(input: CommandRunInput): boolean;
  // Opens the pane, runs `flow` after the hook and returns the hook's answer.
  start(
    host: FlowHost,
    input: CommandRunInput,
    pane: Pick<PaneController, "begin" | "end">,
    flow: (next: Next) => Promise<CommandRunResult>,
  ): Promise<CommandRunResult>;
};

export function createCommandFlows(): CommandFlows {
  const handoffs = new Set<string>();

  return {
    isHandoff(input) {
      if (input.origin.kind !== "plugin" || !handoffs.has(input.command)) return false;
      handoffs.delete(input.command);
      return true;
    },
    async start(host, input, pane, flow) {
      const opened = await pane.begin(host, `/${input.command}`);
      if (!opened.isPlaced) {
        return { text: `The /${input.command} pane could not be shown: ${opened.reason}. Nothing was changed.` };
      }

      let handedOff = false;
      const next: Next = async (received) => {
        handedOff = true;
        // The built-in command draws its own dialog, so the mod's pane goes first.
        await pane.end();
        handoffs.add(received.command);
        try {
          // The built-in command prints its own lines, so its result is not logged again.
          return await host.command.run({ command: received.command, args: received.args });
        } finally {
          handoffs.delete(received.command);
        }
      };
      flow(next)
        .finally(() => pane.end())
        .then(
          (result) => {
            if (!handedOff && result.text !== undefined) host.ui.log(result.text);
          },
          // The error itself is not shown: it may carry a provider's reply.
          () => host.ui.log(`/${input.command} stopped on an unexpected error. Nothing else was changed.`),
        );
      return {};
    },
  };
}
