// Model ids are `provider/model`. A provider may already prefix its own ids (a
// ClinePass list returns `cline-pass/<model>`), so one leading `provider/` is
// stripped before the prefix is added. Provider ids never contain a slash, so
// the first slash splits an id.

export type ParsedModelId = { readonly provider: string; readonly model: string };

export function toModelId(provider: string, model: string): string {
  const prefix = `${provider}/`;
  const bare = model.startsWith(prefix) ? model.slice(prefix.length) : model;
  return `${provider}/${bare}`;
}

export function parseModelId(id: string): ParsedModelId | undefined {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1) return undefined;
  return { provider: id.slice(0, slash), model: id.slice(slash + 1) };
}
