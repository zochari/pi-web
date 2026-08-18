# ADR-0016: spotify-mcp — a service container in the royal-household deployment

Date: 2026-07-22

## Context

We want [spotify-mcp-server](https://github.com/marcelmarais/spotify-mcp-server)
(Marcel Marais) available to an MCP client on the homelab, "deployed in a
container," ready up to the point of passing secret values (Spotify API
credentials + OAuth tokens).

ADR-0013 specializes this repo to one deployment and says a *second deployment*
belongs in a different repo, not a subdir here. The question was whether
spotify-mcp is a second deployment (→ sibling repo) or a container *within* the
royal-household deployment (→ service here). The owner's call: **it is not a
separate deployment** — it is a service container in the royal-household
deployment. This is consistent with the glossary in CONTEXT.md: "a deployment
may bundle several containers" (the hermes profile-host + the webui-ts-node
sidecar are already two; spotify-mcp is a third).

The server is **stdio-only** (`StdioServerTransport` in `src/index.ts`); its
config (`spotify-config.json`) is read from a path fixed relative to the
compiled JS and **rewritten on every token refresh**, so it is mutable runtime
state, not a static secret or a baked-in image file.

## Decision

Add spotify-mcp as a **service in the root `compose.yaml`** (a container in the
royal-household deployment), built from a per-service `spotify-mcp/Dockerfile`.
Consumption is **stdio via `docker exec -i`**: the container idles
(`sleep infinity`) and an MCP client launches the server per session with
`docker exec -i spotify-mcp node /app/build/index.js`. No HTTP/SSE bridge, no
tailscale sidecar, no published port. Config lives on the
`spotify-mcp/.appdata` bind-mount, symlinked from `/app/spotify-config.json`,
delivered from `pass` as a single JSON blob by `just spotify-config`
(`spotify-mcp/secrets` manifest + `spotify-mcp/scripts/deliver-config.sh`).
OAuth runs once, locally, on a machine with a browser (the server's auth binds
`127.0.0.1`, so it cannot run inside a remote container).

New `just spotify-*` verbs (`spotify-build`, `spotify <verb>`, `spotify-config`,
`spotify-smoke`) operate on the `spotify-mcp` service **without** loading the
root `secrets` manifest, so the service is ready independently of the
profile-host's provider-key state.

### Deviations from the one-Dockerfile / one-manifest default (flagged)

This repo's default (AGENTS.md) is one root `Dockerfile` + one root `secrets`
manifest. spotify-mcp adds a **per-service `Dockerfile`** (it needs a `node`
base, not the hermes base) and a **per-service `secrets` manifest**. The latter
mirrors the existing per-profile secrets pattern (`profiles/<profile>/secrets`,
ADR-0012); the per-service Dockerfile is the new shape, recorded here. Both
live in `spotify-mcp/` so the root stays the profile-host's.

## Consequences

- **Not a second deployment** — spotify-mcp is a container in this deployment;
  ADR-0013's "second deployment → different repo" still holds for actual second
  deployments.
- **No upstream modification** — built and run unmodified from a pinned,
  checksummed tarball (mirrors RH-ADR-0007; the no-`package-lock` tradeoff is
  documented in `spotify-mcp/Dockerfile`).
- **No network surface** — no published port; the only "transport" is
  `docker exec`'s stdin/stdout. `network_mode: host` is kept for sibling
  consistency but is moot (outbound-only to api.spotify.com).
- **Client must reach home-k12's Docker** — on home-k12 itself trivial; from a
  laptop, set `DOCKER_HOST=ssh://home-k12` (or run the image on the laptop).
- **Independent of profile-host secrets** — `just spotify-*` verbs skip
  `load-secrets.sh`, so the service builds, validates, and runs before the
  profile-host's provider keys are in `pass`.
- **Per-service Dockerfile + manifest** — a second Dockerfile and a second
  secrets manifest in this repo, both scoped to `spotify-mcp/`.

## Alternatives considered

- **Sibling repo `~/agents/spotify-mcp`** (ADR-0013-literal) — rejected by the
  owner: spotify-mcp is not a separate deployment. Also impractical from the
  session that built it (the agent harness is sandboxed to the royal-household
  cwd and cannot write a sibling repo).
- **HTTP/SSE over tailnet** (RH-ADR-0008 shape) — a stdio→SSE bridge + tailscale
  sidecar so any client reaches a URL. Rejected: adds a bridge dependency, a
  sidecar, and endpoint auth the single-user homelab doesn't need. Revisit if
  remote-URL consumption becomes a requirement.
- **Local stdio, no container** — rejected: contradicts "deployed in a
  container" and ties it to one laptop.
- **Per-session `docker run --rm -i` instead of `docker exec`** — avoids the
  idle container but is slower (cold container per session) and lengthens the
  client config. `docker exec` into a warm idle container is simpler.
- **Bake the config into the image** — rejected: it is rewritten at runtime
  (token refresh) and is a secret.