# Local patches

This repo is a fork of [agegr/pi-web](https://github.com/agegr/pi-web). The commits below sit on top of upstream `main` and are not (yet) upstream. Each entry lists what the patch does, the files it touches, whether upstream has an equivalent, and how to disable it at runtime where applicable.

Patches are ordered oldest-first (the order they apply on top of upstream). Drop a patch by reverting its commit; cross-patch dependencies are noted inline.

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
- Files: `lib/ask-user-question-bridge/{index,protocol,server}.ts`, `components/ask-user-question-bridge/AskUserQuestionDialog.tsx`, `lib/rpc-manager.ts`, `lib/types.ts`, `hooks/useAgentSession.ts`, `components/ChatWindow.tsx`.
- Upstream: not upstream. Upstream has generic `createHeadlessCustomUiTui` rendering for `ctx.ui.custom()` (terminal), not a web bridge for `ask_user_question`.
- Disable: `PIWEB_DISABLE_ASK_USER_QUESTION_BRIDGE=1` (the bridge stays inert; the SDK uses its own internal EventBus).

## feat: scope visible models to enabledModels
- Purpose: filter the model list to the user's `enabledModels` in `GET /api/models`, and resolve the default model for a new session within the scoped set (`resolveScopedDefaultModel`) so the SDK's `findInitialModel` doesn't fall through to `openrouter/moonshotai/kimi-k2.6` and ignore the user's `defaultModel`/`enabledModels`. (The pi-web-specific `enabledProviders` provider whitelist was removed — it blocked providers like `opencode-go` when `enabledProviders` was set but the models were in `enabledModels`.)
- Files: `lib/model-scope.ts`, `app/api/models/route.ts`, `app/api/agent/new/route.ts`.
- Upstream: not upstream. Upstream has no model-scope filtering; `/api/models` returns the full registry and new sessions fall back to `findInitialModel`.
- Dependency: `lib/model-scope.ts` is also used by the reloaded-model reconcile patch below.
## fix: reconcile reloaded-session model (avoid silent kimi-k2.6 revert)
- Purpose: on the reload path (an idle session is destroyed, the next request reloads it from disk), `createAgentSession` runs `findInitialModel` before the registry is populated and falls back to `kimi-k2.6`, ignoring the user's model — the session file and UI selector still show the chosen model, so the next prompt silently runs on kimi while the selector looks right. `reconcileReloadedModel` reads the model from the last `model_change` and sets `inner.agent.state.model` directly (not `setModel`, which would append a `model_change` and persist it as the global `defaultModel` on every reload), falling back to the scoped default when the recorded model is no longer registered. Deliberately does not re-clamp `thinkingLevel` (the provider clamps at request time).
- Files: `lib/rpc-manager.ts`, `lib/pi-types.ts` (adds `getAvailable` to `AgentSessionLike.modelRuntime`), `AGENTS.md`.
- Upstream: not upstream.
- Dependency: uses `scopeAvailableModels` from the model-scoping patch.
- See: `AGENTS.md` § "Reloaded sessions silently revert to kimi-k2.6".

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