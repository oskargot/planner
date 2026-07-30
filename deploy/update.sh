#!/usr/bin/env bash
#
# jellybot's side of the auto-deploy. Run by planner-update.timer every five
# minutes, and safe to run by hand at any time.
#
# What it does, in order:
#   1. fetch origin/main (server code) and origin/deploy (the built client)
#   2. bail out immediately if the deploy branch hasn't moved — the common case
#   3. unpack the new build into releases/<sha>, and REFUSE to go further if it
#      doesn't look like a real build
#   4. fast-forward the working tree to origin/main
#   5. flip the dist symlink atomically
#   6. restart the service only if server/ actually changed
#
# Design notes, because each of these is a way this could go wrong quietly:
#
#  - The swap is a symlink rename, never a write into a live directory. Halfway
#    through a copy, Safari can fetch a new index.html referencing assets that
#    aren't on disk yet — and since index.html is served no-cache while assets
#    are immutable, it will happily cache that broken pairing.
#  - Nothing is swapped unless the new build passes its checks. An unattended
#    deploy that can white-screen the app is worse than deploying by hand.
#  - A client-only change never restarts the server. Most changes are
#    client-only, and a restart drops in-flight syncs for no reason.
#  - Everything is idempotent. A missed run is caught by the next one; there is
#    no state that only advances by running exactly once.
#
# Install: see deploy/README.md.

set -euo pipefail

APP_DIR="${PLANNER_DIR:-/srv/planner}"
KEEP_RELEASES="${PLANNER_KEEP:-5}"
BRANCH="${PLANNER_BRANCH:-main}"
STATE="$APP_DIR/.deploy-state"

log() { echo "[planner-update] $*"; }
die() { echo "[planner-update] ERROR: $*" >&2; exit 1; }

cd "$APP_DIR" || die "no such directory: $APP_DIR"

# ---- rollback: relink to an earlier release and restart. Manual only. ----
if [[ "${1:-}" == "--rollback" ]]; then
  target="${2:-}"
  if [[ -z "$target" ]]; then
    log "available releases (newest last):"
    [[ -d releases ]] || die "no releases directory"
    live="$(readlink dist || true)"
    for r in $(ls -1tr releases); do
      src="$(sed -n 's/.*"source_sha":"\([0-9a-f]\{12\}\).*/\1/p' "releases/$r/build-info.json" 2>/dev/null)"
      printf '  %s  source %s%s\n' "$r" "${src:-????}" \
        "$([[ "releases/$r" == "$live" ]] && echo '   <- live')"
    done
    exit 0
  fi
  [[ -d "releases/$target" ]] || die "no such release: $target"
  ln -sfn "releases/$target" dist.tmp && mv -Tf dist.tmp dist
  sudo systemctl restart planner
  log "rolled back to $target"
  exit 0
fi

# ---- 1. fetch ----
# Quiet by design: this runs every five minutes and should say nothing at all
# unless something happened. journalctl is not a place to store noise.
git fetch --quiet origin "$BRANCH" deploy \
  || die "fetch failed — check git credentials, and that the build workflow has run at least once to create the deploy branch"

new_deploy="$(git rev-parse origin/deploy)"
old_deploy=""
old_source=""
[[ -f "$STATE" ]] && { read -r old_deploy old_source < "$STATE" || true; }

# ---- 2. the common case: nothing new ----
if [[ "$new_deploy" == "$old_deploy" && -e dist ]]; then
  exit 0
fi

# ---- 3. unpack and verify ----
new_source="$(git show "origin/deploy:build-info.json" 2>/dev/null \
  | sed -n 's/.*"source_sha":"\([0-9a-f]*\)".*/\1/p')"
[[ -n "$new_source" ]] || die "deploy branch has no readable build-info.json"

# Named for the DEPLOY commit, not the source commit. Rebuilding the same
# source commit (a workflow_dispatch re-run) would otherwise land on the
# directory `dist` is currently pointing at, and the rm -rf below would take
# the live site down for the moment before the swap. Identical content gives an
# identical deploy sha, which the early-exit above has already caught — so this
# name can never collide with the release that's live.
release="releases/${new_deploy:0:12}"
log "new build ${new_deploy:0:12} (source ${new_source:0:12})"

rm -rf "$release.partial"
mkdir -p "$release.partial"
git archive origin/deploy | tar -x -C "$release.partial" \
  || die "could not unpack the deploy branch"

# The same checks CI ran, repeated here: CI proves what was built, this proves
# what actually arrived on disk.
for required in index.html assets sw.js; do
  [[ -e "$release.partial/$required" ]] || die "build is missing $required — not deploying"
done

rm -rf "$release"
mv -T "$release.partial" "$release"

# ---- 4. bring the server code up to date ----
# --ff-only on purpose: if jellybot's checkout has diverged, that is something
# to look at by hand, not to steamroll with a reset --hard.
git checkout --quiet "$BRANCH"
git merge --quiet --ff-only "origin/$BRANCH" || die "$BRANCH has diverged locally — resolve by hand"

# ---- 5. atomic swap ----
# ln -sfn writes a fresh symlink beside the live one; mv -Tf replaces it in a
# single rename. The server resolves dist per request, so no restart is needed
# for the new files to be served.
ln -sfn "$release" dist.tmp && mv -Tf dist.tmp dist

# ---- 6. restart only if the server actually changed ----
restart=0
if [[ -z "$old_source" ]]; then
  # First run under the updater — we don't know what's running, so restart once.
  restart=1
elif ! git diff --quiet "$old_source" "$new_source" -- server/ 2>/dev/null; then
  restart=1
  if ! git diff --quiet "$old_source" "$new_source" -- server/package.json 2>/dev/null; then
    log "server deps changed — npm i (better-sqlite3 rebuild is slow here)"
    (cd server && npm i --silent) || die "server npm i failed — service left running on the old code"
  fi
fi

if (( restart )); then
  log "server changed — restarting"
  sudo systemctl restart planner || die "restart failed"
fi

# ---- state + prune ----
echo "$new_deploy $new_source" > "$STATE"

# Keep the last few releases so --rollback has somewhere to go.
if [[ -d releases ]]; then
  ls -1t releases | tail -n "+$((KEEP_RELEASES + 1))" | while read -r old; do
    [[ "releases/$old" == "$(readlink dist)" ]] && continue
    rm -rf "releases/$old"
  done
fi

log "deployed ${new_deploy:0:12} (source ${new_source:0:12})$( ((restart)) && echo ' — service restarted')"
