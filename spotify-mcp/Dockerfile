# Dockerfile (spotify-mcp) — build the pinned upstream spotify-mcp-server
# (Marcel Marais) into a runtime image for the royal-household deployment's
# spotify-mcp service. The server is stdio-only (StdioServerTransport) and runs
# UNMODIFIED — we do not patch upstream (ADR-0016). The container idles (compose
# sets `sleep infinity`); an MCP client launches the server per session via
# `docker exec -i spotify-mcp node /app/build/index.js` (ADR-0016).
#
# This is a PER-SERVICE Dockerfile (the royal-household profile-host uses the
# root ./Dockerfile; this service needs a different base image, so it gets its
# own — ADR-0016). Build with `just spotify-build`.
#
# Reproducibility lives here (mirrors royal-household's pin-in-Dockerfile stance,
# RH-ADR-0007): the node base image is pinned by digest, and the upstream source
# is a checksummed release tarball at a pinned commit. The one gap is npm —
# upstream ships NO package-lock.json (it is .gitignore'd upstream), so
# `npm install` resolves transitive versions at BUILD time, not from a lock.
# Re-builds are reproducible up to npm's caret-range resolution; to pin harder,
# vendor a package-lock.json into this dir and switch to `npm ci`.
#
# Re-resolve the node digest on update:
#   TOKEN=$(curl -sf "https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/node:pull" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
#   curl -sf -H "Authorization: Bearer $TOKEN" \
#     -H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json" \
#     -I "https://registry-1.docker.io/v2/library/node/manifests/22-slim" \
#     | grep -i 'docker-content-digest'
FROM docker.io/library/node:22-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3

# Upstream source: pinned commit + checksummed tarball (mirrors the zk / webui
# pattern in the root Dockerfile). Bump both together; the checksum guards
# against a re-tagged or tampered commit.
ARG SPOTIFY_MCP_REF=437edeb2554a1685550d0812ecc6aaf2d92b5b0f
ARG SPOTIFY_MCP_CHECKSUM=9be5af78131988fdf4d5670e1dd9573905fb6596befc5a63e58878123234eb58
ARG SPOTIFY_MCP_REPO=marcelmarais/spotify-mcp-server

RUN set -eux; \
    apt-get update && apt-get install -y --no-install-recommends wget ca-certificates && rm -rf /var/lib/apt/lists/*; \
    wget -qO /tmp/src.tar.gz "https://github.com/${SPOTIFY_MCP_REPO}/archive/${SPOTIFY_MCP_REF}.tar.gz"; \
    echo "${SPOTIFY_MCP_CHECKSUM}  /tmp/src.tar.gz" | sha256sum -c -; \
    mkdir -p /app; \
    tar -xzf /tmp/src.tar.gz -C /app --strip-components=1; \
    rm /tmp/src.tar.gz

WORKDIR /app

# Build upstream: install (no lock shipped — see header), compile, then prune
# devDeps (typescript / biome / @types/node) so the runtime image carries only
# prod deps + the compiled build/. `npm run build` is `tsc && chmod build/index.js`
# — the chmod is cosmetic (we invoke via `node`, not the bin shebang).
RUN npm install \
    && npm run build \
    && npm prune --omit=dev \
    && rm -rf /root/.npm /tmp/*

# Config: the server reads path.join(__dirname, '../spotify-config.json') =>
# /app/spotify-config.json. We bind-mount the host's spotify-mcp/.appdata to
# /data and symlink the config there, so the file target lives on the bind mount
# (not in the image) and token-refresh writes land back on the host (host-owned
# via `user:` in compose). ADR-0016. The file is created by `just spotify-config`
# (pass) — the server fails cleanly if it is absent (loadSpotifyConfig checks
# existence).
RUN mkdir -p /data && ln -s /data/spotify-config.json /app/spotify-config.json

# No ENTRYPOINT/CMD: compose runs `sleep infinity` to idle; the server is
# launched on demand by the MCP client via `docker exec -i ... node /app/build/index.js`.