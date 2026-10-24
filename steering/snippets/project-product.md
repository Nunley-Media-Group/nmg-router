# nmg-router Product Steering

## Vision

nmg-router is a Claude Code mod (a function-hooks plugin) that puts models from the user's other provider plans, such as ChatGPT/Codex, OpenCode Go, ClinePass and xAI, into Claude Code's native `/model` picker next to the Claude models. One Claude Code toolchain then drives every model in one session: the same tools, permissions, hooks, skills, CLAUDE.md and MCP servers.

## Primary User

A solo developer, starting with the maintainer, who pays for a Claude subscription and for cheaper provider plans and wants to offset Claude usage without paying API prices. They start Claude Code with plain `claude` and switch models mid-session with `/model`, with no restart, launcher or mode toggle.

## Hard Requirements

- Plain `claude` starts it. There is no separate launcher, proxy service, port or desktop app to keep running.
- One `/model` list holds the Claude models and the routed models together, and switching between them keeps the conversation.
- Claude models go from Claude Code straight to Anthropic on the user's own login. The mod never reads, stores, intercepts or forwards Claude credentials and never relays Anthropic traffic. Anthropic's terms forbid third-party tools that collect, store or intermediate subscription credentials.
- No request for a routed model is ever answered by an Anthropic model. Nothing falls back silently to another provider or to Claude.
- Non-Claude providers are reached through the user's own provider logins held by oh-my-pi (`omp`), using plan or subscription access rather than pay-per-use API keys where the provider allows it.
- Fully open source (MIT) with no hosted component.
- The mod never commits, logs or stores a credential.

## Rejected Alternatives

Do not re-propose these; each failed a hard requirement during discovery on 2026-10-24:

- CC Switch aggregation mode: it cannot include Claude subscription models, so the user would have to switch modes and restart.
- A local proxy that carries the Claude subscription login (CLIProxyAPI, claude-code-router, LiteLLM): against Anthropic's terms. LiteLLM also had a supply-chain compromise in October 2026.
- Claude through an Anthropic API key: the user avoids API spending.
- A separate cheap-model Claude Code profile, a second tool for cheap models, or cheap models only as helpers Claude calls: each breaks the one-list, one-session requirement.
- Copying oh-my-pi's provider code into the mod: replaced by calling `omp auth-gateway stdio` for each request.

## v1 Success Criteria

- A routed model picked in `/model` completes a full agentic turn with Claude Code's built-in tools (Read, Edit, Write, Bash, Grep, Glob and the rest), with no Anthropic usage for routed steps.
- A session moves between a Claude model and a routed model in either direction with its context intact.
- `/login` offers a provider picker. Choosing Anthropic runs Claude Code's built-in login unchanged.
- An automated test shows that a routed request cannot be answered by an Anthropic model.
- The mod installs with one `/plugin install` from the repository's marketplace file.

## Spike Evidence

From a throwaway spike on 2026-10-24 with Claude Code 2.1.310 and `omp` 18.12.6:

- A `turn.step` hook that yields without calling `next` answered requests from OpenCode Go (Kimi, GLM, DeepSeek).
- Claude Code accepted a non-Claude model id (`--model ocg/<id>`) while logged in with a subscription.
- Read and Edit calls from routed models ran through Claude Code's own tools.
- A session started on Claude Haiku continued on DeepSeek with its context intact. Routed steps cost nothing on Anthropic.
- `omp auth-gateway stdio` accepts Anthropic Messages requests and returned correct `tool_use` for openai-codex.
- Found: the oh-my-pi gateway answered an opencode-go request with `anthropic/claude-opus-5-5`, because the user's oh-my-pi model roles and fallbacks include an Anthropic login. This is why the router needs an isolated, Anthropic-free gateway profile.
- Found: under auto mode, Bash calls from a routed model got no verdict from the server-side permission classifier and were blocked.
- Found: OpenCode Go lists Claude Code as a supported client; it asks for a stable session id and an honest user agent.

## Known Risks

- The mods API is new and may change between Claude Code releases.
- The mods API exposes tool names but not their input schemas.
- Using the ChatGPT subscription through the Codex login carries a small OpenAI-side account risk, which the user accepted.
- Routed models are weaker than Claude at Claude Code's tool use.
- `$.http.fetch` returns whole responses, so streaming needs a different path.
- Background requests such as compaction and session titles still go to Claude.

## Out of Scope for v1

Team or organization governance, budgets and shared configuration; any hosted gateway; provider implementations inside the mod; local-model hosting.
