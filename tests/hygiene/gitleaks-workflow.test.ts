import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, { steps: { run?: string }[] }>;
}

const workflow = parse(
  readFileSync(resolve(import.meta.dirname, "../../.github/workflows/gitleaks.yml"), "utf8"),
) as Workflow;

describe("gitleaks workflow", () => {
  it("triggers on push and pull_request", () => {
    expect(workflow.on).toHaveProperty("push");
    expect(workflow.on).toHaveProperty("pull_request");
  });

  it("runs gitleaks in a job step", () => {
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
    expect(steps.some((step) => step.run?.includes("gitleaks git"))).toBe(true);
  });
});
