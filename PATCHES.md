# Local patches

This repo is a fork of [agegr/pi-web](https://github.com/agegr/pi-web). The commits below sit on top of upstream `main` and are not (yet) upstream. Each entry lists what the patch does, the files it touches, whether upstream has an equivalent, and how to disable it at runtime where applicable.

Patches are ordered oldest-first (the order they apply on top of upstream). Drop a patch by reverting its commit; cross-patch dependencies are noted inline.

Baseline: merged upstream `main` at v0.8.6 (SDK 0.83.0) on 2026-08-01. Two patches were superseded by that merge — they are marked below and their commits remain only as history.

## chore: ignore .pi/ local agent data
- Purpose: ignore the pi coding agent's local runtime dir (sessions, hindsight, taskflows) so per-machine agent state isn't committed.
- Files: `.gitignore`.
- Upstream: not upstream (upstream `.gitignore` has no `.pi/` entry).
- Disable: remove the `.pi/` line.

## chore: local dev environment — pm2 workflow + dev-origin overrides
- Purpose: document the canonical pm2 dev mode (hot-reload via Next Fast Refresh, restart-on-crash; pm2 `watch` stays off); allow per-host `allowedDevOrigins` overrides via a gitignored `.dev-origins.json` so internal hostnames/subnets aren't committed.
- Files: `AGENTS.md`, `next.config.ts`, `.gitignore`.
- Upstream: not upstream. Upstream pins `allowedDevOrigins` to `['192.168.*.*']` only and documents plain `npm run dev`.
- Disable: delete `.dev-origins.json` (the config falls back to LAN only).

## feat: ask-user-question web bridge
- Purpose: route the `ask_user_question` extension tool's `ctx.ui.custom()` prompt to a web dialog instead of the generic ANSI custom-UI panel. Subscribes to the extension's `ASK_USER_PROMPT_EVENT` on a shared `EventBus` injected into `createAgentSessionServices` via `resourceLoaderOptions.eventBus` (the SDK wires `pi.events` to the resource loader's bus), then hands the same bus to `AgentSessionWrapper`. `custom()` tries the bridge first ("not mine" falls through to upstream's ANSI panel). Pending UI requests are cached and replayed to reconnecting SSE clients and re-surfaced via `get_state`, so a page refresh re-shows an unanswered dialog bound to the original id.
- Files: `lib/ask-user-question/{index,protocol,server}.ts`, `components/ask-user-question/AskUserQuestionDialog.tsx`, `lib/rpc-manager.ts`, `lib/types.ts`, `hooks/useAgentSession.ts`, `components/ChatWindow.tsx`.
- Upstream: not upstream. Upstream has generic `createHeadlessCustomUiTui` rendering for `ctx.ui.custom()` (terminal), not a web bridge for `ask_user_question`.
- Disable: `PIWEB_DISABLE_ASK_USER_QUESTION_BRIDGE=1` (the bridge stays inert; the SDK uses its own internal EventBus).
- Merge note: re-grafted onto upstream's v0.8.6 `startRpcSession` (services-first) as `resourceLoaderOptions: { eventBus }`, alongside upstream's `resourceLoaderReloadOptions` (project-trust gating, #236). In untrusted project cwds the ask-user extension may not load at all — that is upstream's project-trust behavior, not a bridge regression.

## ~~feat: scope visible models to enabledModels~~ — SUPERSEDED by upstream (v0.8.6)
- What it did: filter the model list to the user's `enabledModels` in `GET /api/models` and resolve the new-session default within the scoped set so the SDK's `findInitialModel` didn't fall through to `openrouter/moonshotai/kimi-k2.6`; also removed the `enabledProviders` provider whitelist that blocked providers like `opencode-go`.
- Why dropped: upstream adopted the same idea in richer form — `lib/model-scope.ts` now delegates to the SDK's own `resolveModelScopeWithDiagnostics()` (minimatch globs, fuzzy patterns, `:thinkingLevel` pins, `modelScopeWarnings`), and `startRpcSession`/`GET /api/models`/`app/api/agent/new` share `resolveVisibleModels` + `selectInitialModelScope`. Upstream's `app/api/models` also surfaces `thinkingLevelPins` to the selector.
- Remaining local behavior: the `enabledProviders` provider-whitelist removal was folded into upstream's implementation (no `enabledProviders` filtering exists upstream).

## ~~fix: reconcile reloaded-session model (avoid silent kimi-k2.6 revert)~~ — SUPERSEDED by SDK 0.83.0
- What it did: on the reload path, `createAgentSession` ran `findInitialModel` before the registry was populated and fell back to `kimi-k2.6`; `reconcileReloadedModel` read the model from the last `model_change` and set `agent.state.model` directly (not `setModel`, which would append a `model_change` and persist `defaultModel` to `settings.json` on every reload).
- Why dropped: SDK 0.83.0 fixed this at the root. `createAgentSessionServices` refreshes the model registry before session construction, and `createAgentSessionFromServices` restores the recorded model from the session file directly — no `setModel()`, so no `settings.json` mutation on reload. Known edge (accepted, matches upstream): if the recorded model is no longer registered, the SDK falls back to `findInitialModel` (unscoped settings default) rather than a scoped default.
- Do not re-add: `AGENTS.md` § "Reloaded sessions restore the recorded model" documents why.

## fix: spawn real pi CLI for subagents (PI_SUBAGENT_PI_COMMAND)
- Purpose: the `pi-subagents` extension (edxeth/pi-subagents) treats `process.argv[1]` (the Next.js server script) as the pi binary and re-launches Next.js with pi's flags, so every subagent fails fast. `ensureSubagentPiCommand` sets `PI_SUBAGENT_PI_COMMAND` to the installed `pi-coding-agent` CLI before creating a session; an explicit env value always takes precedence, and the child env is spread from `process.env` so nested pi children inherit it too.
- Files: `lib/rpc-manager.ts`.
- Upstream: not upstream.
- Disable: set `PI_SUBAGENT_PI_COMMAND` explicitly in the environment (the function no-ops when it's already set).

## feat: render rpiv-todo tool calls as a checklist
- Purpose: render the `rpiv-todo` tool's calls as a compact, expandable Todo block (status glyphs, task ids, active-form annotations, blocked-by chains) with a one-line action/result header, instead of the generic tool-call block.
- Files: `components/MessageView.tsx`.
- Upstream: not upstream.
- Disable: revert; non-todo tools are unaffected (the Todo block only matches `toolName === "todo"`).
