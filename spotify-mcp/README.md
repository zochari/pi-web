# spotify-mcp (royal-household service)

A container in the royal-household deployment that stands up
[spotify-mcp-server](https://github.com/marcelmarais/spotify-mcp-server)
(Marcel Marais) and makes it available to an MCP client (Claude Desktop,
Cursor, Cline, …) over the server's native **stdio** transport via
`docker exec -i`. See `docs/adr/0016-spotify-mcp-service.md` for the shape
decision (a service in this deployment, not a sibling repo).

The server is built **unmodified** from a pinned, checksummed upstream tarball
(`spotify-mcp/Dockerfile`) and runs in an idling container; the client launches
it per session with `docker exec -i spotify-mcp node /app/build/index.js`. No
HTTP/SSE bridge, no tailscale sidecar, no published port.

> **Status: ready, awaiting secrets.** The image builds and the service
> validates/starts with **no** secrets — the `just spotify-*` verbs skip the
> root `secrets` manifest, so this service is ready independently of the
> profile-host's provider-key state (ADR-0016). The only thing left to you is
> the Spotify config — clientId/clientSecret (Spotify Developer Dashboard) +
> OAuth tokens (a one-time `npm run auth` on a machine with a browser). See
> [Prerequisites](#prerequisites).

## How it works

```
 your MCP client (Claude Desktop, Cursor, …)
        │  spawns per session:
        ▼
 docker exec -i spotify-mcp node /app/build/index.js
        │  stdio (JSON-RPC over stdin/stdout)
        ▼
 ┌─────────────────────────────────────────────────────┐
 │ container: spotify-mcp  (idles: sleep infinity)     │
 │   node /app/build/index.js                           │
 │     reads /app/spotify-config.json                   │
 │       → symlink → /data/spotify-config.json          │
 │          (bind-mounted from spotify-mcp/.appdata)    │
 │     on token refresh, rewrites that file             │
 └─────────────────────────────────────────────────────┘
        │  Spotify Web API (outbound, host net)
        ▼
 api.spotify.com
```

The config (`spotify-config.json`) is the single secret: `clientId`,
`clientSecret`, `redirectUri`, and after OAuth `accessToken`/`refreshToken`/
`expiresAt`. It is delivered from `pass` by `just spotify-config` and lives on
the `spotify-mcp/.appdata` bind-mount — never in the image, never in the repo.

## Prerequisites

You need a **Spotify Premium** account (playback tools require it) and a
registered Spotify Developer application.

### 1. Create a Spotify Developer app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/).
2. Create an app; note the **Client ID** and **Client Secret**.
3. Under **Edit Settings**, add the Redirect URI `http://127.0.0.1:8888/callback`
   and save. (The server's `auth.ts` hard-requires a localhost redirect URI —
   `http://127.0.0.1:8888/callback` is the canonical one.)

### 2. Run OAuth once, on a machine with a browser

The server's auth binds the callback to `127.0.0.1:8888`, so OAuth **must** run
where your browser is (your laptop) — not inside the home-k12 container
(ADR-0016). Pick one:

**Option A — clone upstream (no Docker needed on the laptop):**
```bash
git clone https://github.com/marcelmarais/spotify-mcp-server.git
cd spotify-mcp-server
cp spotify-config.example.json spotify-config.json
# edit spotify-config.json: set clientId, clientSecret,
#   redirectUri = http://127.0.0.1:8888/callback  (leave the token fields as-is)
npm install
npm run auth      # opens a browser; after you approve, tokens are written
                   # into spotify-config.json
```

**Option B — use this service's image on the laptop (if you have Docker there):**
```bash
# build the image on the laptop (clone royal-household there, then):
just spotify-build          # -> homelab-spotify-mcp:latest
cp spotify-config.example.json spotify-config.json   # from upstream, or:
#   docker run --rm homelab-spotify-mcp:latest cat /app/spotify-config.example.json > spotify-config.json
# edit spotify-config.json: clientId, clientSecret, redirectUri as above
docker run --rm -it -p 8888:8888 \
  -v "$PWD/spotify-config.json:/app/spotify-config.json" \
  homelab-spotify-mcp:latest npm run auth
# after you approve in the browser, tokens are written to ./spotify-config.json
```

You now have a `spotify-config.json` with `accessToken`/`refreshToken`/`expiresAt`.

### 3. Store the config in pass (on home-k12)

```bash
# copy the file to home-k12 (scp, git, …), then:
pass insert royal-household/spotify-mcp/spotify-config.json    # paste the whole JSON; Ctrl-D
```

## Stand it up (on home-k12)

```bash
cd ~/agents/royal-household
just spotify-build        # builds the image (no secrets needed)
just spotify-config        # pass show -> spotify-mcp/.appdata/spotify-config.json (chmod 600)
just spotify up -d         # idle container up (no port published)
just spotify-smoke         # optional: end-to-end check (see below)
```

`just spotify-build` and `just spotify config` (compose validate, scoped to the
service) work **before** any secret exists — that is the "ready, awaiting
secrets" state. `just spotify-config` and `just spotify-smoke` need the `pass`
entry from step 3.

## Wire your MCP client

Add the server to your client's MCP config. The command launches the server in
the idling container per session; stdio flows through `docker exec -i`.

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "spotify": {
      "command": "docker",
      "args": ["exec", "-i", "spotify-mcp", "node", "/app/build/index.js"]
    }
  }
}
```

**Cursor / Cline** (`cline_mcp_settings.json` — same shape):
```json
{
  "mcpServers": {
    "spotify": {
      "command": "docker",
      "args": ["exec", "-i", "spotify-mcp", "node", "/app/build/index.js"],
      "autoApprove": ["getNowPlaying", "searchSpotify"]
    }
  }
}
```

> **Client not on home-k12?** `docker exec` runs against your *local* Docker
> daemon. If your client is on a laptop and the container is on home-k12, point
> the laptop's Docker at home-k12 with
> `export DOCKER_HOST=ssh://home-k12` (requires SSH access to home-k12). Then
> `docker exec -i spotify-mcp …` from the laptop talks to home-k12's container.
> Alternatively, run the image on the laptop directly with
> `docker run --rm -i homelab-spotify-mcp node /app/build/index.js` (and mount
> the config locally too).

## Smoke test

`just spotify-smoke` pipes an MCP `initialize` + a `getAvailableDevices` tool
call into the server (via `docker run --rm -i`, no need for the service to be
up) and prints the responses. A valid device list (or a clean Spotify API
error) means the build, the stdio plumbing, the config, and the tokens all
work. A `Spotify configuration file not found` error means `just spotify-config`
hasn't run yet (the "awaiting secrets" state) — the plumbing is fine, only the
config is missing.

## Verbs

```
just spotify-build        # build the image (pinned upstream + node digest)
just spotify up -d        # start the idling service
just spotify logs -f      # follow logs (it just sleeps, so this is quiet)
just spotify ps           # service status
just spotify stop         # stop the service (NOT `down` — that nukes the whole deployment)
just spotify-config       # pass show -> spotify-mcp/.appdata/spotify-config.json
just spotify-smoke        # end-to-end stdio check via docker run --rm -i
just spotify <verb>       # any compose verb scoped to spotify-mcp
                           # (e.g. `just spotify exec spotify-mcp sh`)
```

`just spotify-*` verbs do NOT load the root `secrets` manifest, so they work
before the profile-host's provider keys are in `pass`.

## Update

Bump the upstream pin in `spotify-mcp/Dockerfile` (`SPOTIFY_MCP_REF` +
`SPOTIFY_MCP_CHECKSUM` — re-fetch the tarball and `sha256sum` it) and/or the
`node:22-slim` digest (see the re-resolve snippet in the Dockerfile header).
Then `just spotify-build && just spotify up -d`. The server itself never needs
re-auth unless the refresh token expires (Spotify rotates refresh tokens, but
an unused app's tokens can lapse after ~6 months; if `just spotify-smoke`
reports `invalid_grant`, re-run [Prerequisites §2](#2-run-oauth-once-on-a-machine-with-a-browser)
and `pass insert` the new config).

## Troubleshooting

- **`Spotify configuration file not found at /app/spotify-config.json`** — run
  `just spotify-config` (and `pass insert royal-household/spotify-mcp/spotify-config.json`
  first).
- **`invalid_grant` on token refresh** — the refresh token expired/revoked; the
  server discards it. Re-run OAuth (Prerequisites §2) and `pass insert` the new
  config, then `just spotify-config`.
- **`docker exec` errors with "no such container"** — `just spotify up -d`
  first (the container must be idling).
- **Client on a laptop can't reach the container** — set `DOCKER_HOST` (see
  "Client not on home-k12?" above) or run the image on the laptop.
- **OAuth redirect fails** — confirm the Redirect URI in the Spotify Dashboard
  is exactly `http://127.0.0.1:8888/callback` and that you ran `npm run auth`
  on the same machine as the browser.