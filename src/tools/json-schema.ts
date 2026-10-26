// The JSON Schema subset the generated tool registry emits and the wires send.
// Anything the generator cannot express is `{}`, which every wire accepts.

export type JsonSchema = {
  readonly type?: "object" | "string" | "number" | "boolean" | "array";
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | JsonSchema;
  readonly items?: JsonSchema;
  readonly enum?: readonly string[];
};
