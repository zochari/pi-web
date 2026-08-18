# Source this from a Justfile recipe (the spotify-mcp service's `just spotify-config`):
#   . scripts/deliver-config.sh <manifest>
#
# Reads `<pass-path>  <dest-relative-path>` lines from <manifest>, fetches each
# value with `pass show`, and writes it to <dest> (chmod 600). The dest lives
# under ./.appdata (bind-mounted into the spotify-mcp container at /data); the
# image symlinks /app/spotify-config.json → /data/spotify-config.json so the
# server reads it. The manifest is non-secret (only pass entry paths + dest
# paths); values never touch the repo. Distinct from royal-household's
# load-secrets.sh (which exports ENV vars for compose interpolation) — here the
# secret is a JSON FILE, not ENV (ADR-0016). No .env files (RH-ADR-0005).
#
# Fails loud: if `pass show` errors or a dest is outside ./.appdata, exit 1.
#
# Run with cwd = spotify-mcp/ (the `just spotify-config` recipe cd's there).
#
# Manifest format — one mapping per line; `#` comments and blank lines ignored:
#
#   royal-household/spotify-mcp/spotify-config.json  .appdata/spotify-config.json

[ -n "${1:-}" ] || { echo "✗ no manifest given" >&2; exit 1; }
manifest="$1"
[ -f "$manifest" ] || { echo "✗ no manifest: $manifest" >&2; exit 1; }

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|\#*) continue ;;
  esac
  # Split on first whitespace: pass-path  dest-relative-path
  pass_path="${line%%[[:space:]]*}"
  dest="${line#*[[:space:]]}"
  dest="${dest#"${dest%%[![:space:]]*}"}"   # trim leading whitespace
  if [ -z "$pass_path" ] || [ -z "$dest" ] || [ "$pass_path" = "$line" ]; then
    printf 'bad line in %s: %q\n' "$manifest" "$line" >&2
    exit 1
  fi
  # Dest must be under ./.appdata (the bind-mount) — refuse anything else so a
  # typo can't write a secret elsewhere in the repo.
  case "$dest" in
    .appdata/*) : ;;
    *) printf '✗ dest must be under .appdata/: %s\n' "$dest" >&2; exit 1 ;;
  esac
  mkdir -p "$(dirname "$dest")"
  pass show "$pass_path" > "$dest" || { printf '✗ pass show failed for %s\n' "$pass_path" >&2; exit 1; }
  chmod 600 "$dest"
  echo "✓ wrote $pass_path -> $dest"
done < "$manifest"