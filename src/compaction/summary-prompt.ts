// The summarizer's instructions. The request puts the transcript first and these
// after it, so the model reads the structure it must answer in last.

export const SUMMARY_SYSTEM_PROMPT = [
  "You summarize a conversation between a user and a coding assistant so the work can continue from the summary.",
  "Write the summary in the structure requested. Never continue the conversation and never answer its pending questions.",
  "Output only the summary.",
].join("\n");

export const SUMMARY_STRUCTURE = [
  "Write the summary with these sections, in this order:",
  "## Goal",
  "## Constraints & Preferences",
  "## Progress",
  "### Done",
  "### In Progress",
  "### Blocked",
  "## Key Decisions",
  "## Next Steps",
  "## Critical Context",
  "",
  "Keep exact file paths, function names and error messages. Keep any pending user request word for word.",
].join("\n");
