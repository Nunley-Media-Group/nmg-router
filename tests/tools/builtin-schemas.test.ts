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

type ObjectSchema = { properties?: Record<string, unknown>; required?: string[] };

// A schema without its descriptions, which the host words per session. A member
// named `description` under `properties` is a member, so it is kept.
function shapeOf(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(shapeOf);
  if (typeof schema !== "object" || schema === null) return schema;
  const shape: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "description") continue;
    shape[key] = key === "properties" ? mapValues(value as Record<string, unknown>, shapeOf) : shapeOf(value);
  }
  return shape;
}

function mapValues(record: Record<string, unknown>, map: (value: unknown) => unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, map(value)]));
}

// A tool's shape with only the members both registries declare. The host writes the
// declarations again on every start, and an optional member it gates by account or
// session (Artifact.edits on 2.1.311) comes and goes between starts.
function sharedShape(schema: ObjectSchema, other: ObjectSchema): unknown {
  const shared = Object.keys(schema.properties ?? {}).filter((name) => Object.hasOwn(other.properties ?? {}, name));
  return shapeOf({ ...schema, properties: Object.fromEntries(shared.map((name) => [name, schema.properties?.[name]])) });
}

describe("built-in tool schema registry", () => {
  it("matches a fresh regeneration from the installed declarations in every tool's required members and shared member types", () => {
    const { source, version } = declarations();
    const fresh = registryOf(generateToolSchemas(source, version, () => undefined)) as Record<string, ObjectSchema>;
    const committed = BUILTIN_TOOL_SCHEMAS as Record<string, ObjectSchema>;
    expect(Object.keys(committed).sort()).toEqual(Object.keys(fresh).sort());
    for (const [name, schema] of Object.entries(committed)) {
      const regenerated = fresh[name] ?? {};
      expect([name, [...(schema.required ?? [])].sort()]).toEqual([name, [...(regenerated.required ?? [])].sort()]);
      expect([name, sharedShape(schema, regenerated)]).toEqual([name, sharedShape(regenerated, schema)]);
    }
  });

  it("keeps a member the host gates per session out of the comparison only while it is optional", () => {
    const committed: ObjectSchema = { properties: { file_path: { type: "string" } }, required: ["file_path"] };
    const gated: ObjectSchema = { properties: { file_path: { type: "string", description: "Worded again" }, edits: { type: "array" } }, required: ["file_path"] };
    expect(sharedShape(committed, gated)).toEqual(sharedShape(gated, committed));
    expect(sharedShape(committed, { properties: { file_path: { type: "number" } } })).not.toEqual(
      sharedShape({ properties: { file_path: { type: "number" } } }, committed),
    );
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
