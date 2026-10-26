import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILTIN_TOOL_SCHEMAS } from "../../src/tools/builtin-schemas.ts";
import { declarationVersion, generateToolSchemas, paths } from "../../scripts/gen-tool-schemas.mjs";

function declarations(): { source: string; version: string } {
  if (!existsSync(paths.toolDeclarations)) {
    throw new Error("the Claude Code declarations are missing; run npm run types:sync first");
  }
  return {
    source: readFileSync(paths.toolDeclarations, "utf8"),
    version: declarationVersion(readFileSync(paths.versionDeclarations, "utf8")),
  };
}

// The generated file holds one JSON object literal; this reads it back.
function registryOf(text: string): Record<string, unknown> {
  const match = /BUILTIN_TOOL_SCHEMAS: Readonly<Record<string, JsonSchema>> = (\{[\s\S]*\});\n$/.exec(text);
  if (match?.[1] === undefined) throw new Error("the generated registry has no object literal");
  return JSON.parse(match[1]) as Record<string, unknown>;
}

describe("built-in tool schema registry", () => {
  it("matches a fresh regeneration from the installed declarations byte for byte", () => {
    const { source, version } = declarations();
    expect(generateToolSchemas(source, version, () => undefined)).toBe(readFileSync(paths.output, "utf8"));
  });

  it("has one entry per BuiltinToolInputs key", () => {
    const { source } = declarations();
    // Only the BuiltinToolInputs block: the same file also declares BuiltinToolResults.
    const start = source.indexOf("interface BuiltinToolInputs {");
    const block = source.slice(start, source.indexOf("\n  }\n", start));
    // Tool names are bare or quoted (a name with dashes), and an empty tool is written `{}`.
    const keys = [...block.matchAll(/^ {4}(?:"([^"]+)"|(\w+)): \{/gm)].map((match) => match[1] ?? match[2]);
    expect(Object.keys(BUILTIN_TOOL_SCHEMAS).sort()).toEqual(keys.sort());
  });

  it("gives every tool an object schema", () => {
    for (const schema of Object.values(BUILTIN_TOOL_SCHEMAS)) {
      expect(schema.type).toBe("object");
    }
  });

  it("maps required, optional, enum, array and record members, and names what it cannot express", () => {
    const warnings: string[] = [];
    const source = `declare module 'claude-code' {
  interface BuiltinToolInputs {
    Demo: {
      /** A name. */
      name: string
      count?: number
      mode?: "a" | "b"
      tags: string[]
      labels?: Record<string, number>
      extra: number | string
    }
  }
}`;
    const registry = registryOf(generateToolSchemas(source, "9.9.9", (message) => warnings.push(message)));
    expect(registry.Demo).toEqual({
      type: "object",
      properties: {
        name: { type: "string", description: "A name." },
        count: { type: "number" },
        mode: { type: "string", enum: ["a", "b"] },
        tags: { type: "array", items: { type: "string" } },
        labels: { type: "object", additionalProperties: { type: "number" } },
        extra: {},
      },
      required: ["name", "tags", "extra"],
      additionalProperties: false,
    });
    expect(warnings).toEqual(["gen-tool-schemas: Demo.extra has an unsupported type (UnionType); its schema is {}"]);
  });
});
