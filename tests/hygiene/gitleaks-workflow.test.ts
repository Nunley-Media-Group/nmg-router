import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown> };
type Workflow = { on: Record<string, unknown>; env: Record<string, string>; jobs: Record<string, { steps: Step[] }> };

const workflow = parse(
  readFileSync(join(import.meta.dirname, "..", "..", ".github", "workflows", "gitleaks.yml"), "utf8"),
) as Workflow;
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);

describe("gitleaks workflow", () => {
  it("triggers on every push and pull_request", () => {
    expect(Object.keys(workflow.on)).toEqual(expect.arrayContaining(["push", "pull_request"]));
  });

  it("checks out with full history", () => {
    expect(steps.some((step) => step.uses?.startsWith("actions/checkout") && step.with?.["fetch-depth"] === 0)).toBe(
      true,
    );
  });

  it("pins a gitleaks v8 release and verifies it against that release's checksums", () => {
    expect(workflow.env.GITLEAKS_VERSION).toMatch(/^8\.\d+\.\d+$/);
    const install = steps.find((step) => step.run?.includes("gitleaks_${GITLEAKS_VERSION}_checksums.txt"));
    expect(install?.run).toContain("sha256sum -c");
    expect(install?.run).toContain("linux_x64.tar.gz");
  });

  it("runs gitleaks over the git history and fails the job on a finding", () => {
    expect(steps.some((step) => step.run?.includes("gitleaks git") && step.run.includes("--exit-code 1"))).toBe(true);
  });
});
