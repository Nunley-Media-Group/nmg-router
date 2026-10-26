import type { ResultBlock, Turn, TurnBlock } from "./types.ts";

// Turns the conversation's Messages API blocks into the wire-neutral turns.
// Thinking and redacted thinking are dropped, so no encoded request carries
// them, and so is every block type this layer does not model.

export type ApiBlock = { readonly type: string; readonly [field: string]: unknown };

export type ApiMessageInput = {
  readonly role: "user" | "assistant";
  readonly content: readonly ApiBlock[];
};

export type NormalizeTarget = {
  // The routed model id, named in the note that replaces an image it cannot read.
  readonly id: string;
  readonly vision: boolean;
};

// Text or image: what a block can become at the content level, and what a tool result holds.
type ContentBlock = Extract<TurnBlock, { kind: "text" | "image" }>;

function omitted(model: NormalizeTarget, reason: string): ContentBlock {
  return { kind: "text", text: `(image omitted: ${model.id} ${reason})` };
}

function imageOf(block: ApiBlock, model: NormalizeTarget): ContentBlock {
  const source = block.source as { type?: unknown; media_type?: unknown; data?: unknown } | undefined;
  const base64 = source?.type === "base64" && typeof source.media_type === "string" && typeof source.data === "string";
  if (!model.vision) return omitted(model, "has no image input");
  if (!base64) return omitted(model, "sent an image source nmg-router cannot read");
  return { kind: "image", mediaType: source.media_type as string, data: source.data as string };
}

function resultBlocksOf(content: unknown, model: NormalizeTarget): ResultBlock[] {
  if (typeof content === "string") return [{ kind: "text", text: content }];
  if (!Array.isArray(content)) return [];
  return content.flatMap((item: ApiBlock): ResultBlock[] => {
    if (item.type === "text" && typeof item.text === "string") return [{ kind: "text", text: item.text }];
    return item.type === "image" ? [imageOf(item, model)] : [];
  });
}

function blockOf(block: ApiBlock, model: NormalizeTarget): TurnBlock[] {
  switch (block.type) {
    case "text":
      return typeof block.text === "string" ? [{ kind: "text", text: block.text }] : [];
    case "image":
      return [imageOf(block, model)];
    case "tool_use":
      return typeof block.id === "string" && typeof block.name === "string"
        ? [{ kind: "tool_use", id: block.id, name: block.name, input: block.input }]
        : [];
    case "tool_result":
      return [
        {
          kind: "tool_result",
          id: typeof block.tool_use_id === "string" ? block.tool_use_id : "",
          isError: block.is_error === true,
          content: resultBlocksOf(block.content, model),
        },
      ];
    default:
      return [];
  }
}

export function normalizeMessages(messages: readonly ApiMessageInput[], model: NormalizeTarget): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const content = Array.isArray(message.content) ? message.content : [];
    const blocks = content.flatMap((block) => blockOf(block, model));
    if (blocks.length > 0) turns.push({ role: message.role, blocks });
  }
  return turns;
}
