import type { CommandRunArgs, CommandRunInput, CommandRunResult } from "claude-code";
import type { HostPort } from "../host.ts";

// The host bounds a `command.run` hook at 10 s of its own time, and the person's
// time in the pane is not a `$` call, so a flow awaited inside the hook runs out
// and the host runs the built-in command in its place. The hook answers at once
// instead, and the flow runs after it: its outcome is a transcript line. An
// Anthropic pick re-runs the command through the host, and the hook hands that
// run to next(e), so Claude Code's own login or logout runs unchanged.

export type FlowHost = Pick<HostPort, "ui"> & {
  readonly command: {
    run(input: CommandRunArgs): Promise<CommandRunResult>;
  };
};

type Next = (input: CommandRunInput) => Promise<CommandRunResult>;

export type CommandFlows = {
  // True for the re-run of an Anthropic pick, which the hook hands to next(e).
  isHandoff(input: CommandRunInput): boolean;
  // Runs `flow` after the hook and returns the hook's immediate answer.
  start(host: FlowHost, input: CommandRunInput, flow: (next: Next) => Promise<CommandRunResult>): CommandRunResult;
};

export function createCommandFlows(): CommandFlows {
  const handoffs = new Set<string>();

  return {
    isHandoff(input) {
      if (input.origin.kind !== "plugin" || !handoffs.has(input.command)) return false;
      handoffs.delete(input.command);
      return true;
    },
    start(host, input, flow) {
      let handedOff = false;
      const next: Next = async (received) => {
        handedOff = true;
        handoffs.add(received.command);
        try {
          // The built-in command prints its own lines, so its result is not logged again.
          return await host.command.run({ command: received.command, args: received.args });
        } finally {
          handoffs.delete(received.command);
        }
      };
      flow(next).then(
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
