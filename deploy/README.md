# Auto-deploy on jellybot

Push to `main` → GitHub builds the client → jellybot picks it up within five
minutes. Nothing reaches into the tailnet: jellybot pulls, and no tailnet
credential is ever stored on GitHub.

```
push to main
   └─ .github/workflows/build.yml       npm ci && npm run build
        └─ force-push dist/ to the `deploy` branch (one commit, no history)
             └─ planner-update.timer    every 5 min on jellybot
                  └─ deploy/update.sh   unpack → verify → swap → maybe restart
```

The build runs on GitHub's runner rather than on jellybot. That's the main
practical win — the AMD E-350 takes minutes to run a Vite build, which is
exactly why deploying by hand was something to put off.

## What it does and doesn't restart

- **Client-only change** (the usual case): the `dist` symlink is swapped and
  that's it. The server resolves `dist` per request, so the new build is live
  immediately with no restart and no dropped sync requests.
- **`server/**` changed**: `systemctl restart planner` after the swap.
- **`server/package.json` changed**: `npm i` in `server/` first — that's the
  slow one, since better-sqlite3 is a native module.

## One-time setup

Everything below runs on jellybot. The checkout is assumed to be at
`~/projects/planner`; step 4 derives the real path and user from your
environment, so nothing here needs hand-editing.

`update.sh` locates the checkout from its own path (`<repo>/deploy/update.sh`),
so it works wherever the repo lives. `PLANNER_DIR` overrides it if you ever
need to.

### 1. Move the existing `dist/` into the release layout

The updater expects `dist` to be a symlink into `releases/<sha>`. Converting a
checkout that's been deploying by hand:

```bash
cd ~/projects/planner
rm -rf dist                      # it gets replaced on the first run anyway
```

The first run then unpacks a real build and creates the symlink. The service
will 404 in the gap between those two, so do it right before step 5.

### 2. Make sure git can fetch without a prompt

The timer runs non-interactively, so a passphrase prompt or a credential
helper that wants a UI will hang the unit until it times out. Check with:

```bash
cd ~/projects/planner && git fetch --dry-run origin
```

(No `sudo -u` needed — run it as the user the timer will run as, which is you.)

If that asks for anything, set up a credential that doesn't. Either a
passphrase-less **deploy key** (read-only, repo-scoped — the better option) or
`git config --global credential.helper store` with a fine-grained PAT limited
to read access on this one repo.

### 3. Allow the restart

The updater runs as your user, not root, so give it exactly the one command it
needs and nothing more:

```bash
echo "$(whoami) ALL=(root) NOPASSWD: $(command -v systemctl) restart planner" \
  | sudo tee /etc/sudoers.d/planner-update
sudo chmod 440 /etc/sudoers.d/planner-update
sudo -n systemctl restart planner && echo "sudoers rule works"
```

`command -v systemctl` rather than a hardcoded `/bin/systemctl`: sudoers
matches on the exact path, so a guess that's off by a symlink silently fails.

### 4. Install the units

Patch the copies in `/etc`, **not** the ones in the repo. Editing tracked
files on jellybot leaves the working tree dirty, and the updater's
`git merge --ff-only` will refuse the next time those files change upstream.

```bash
cd ~/projects/planner
chmod +x deploy/update.sh
sudo cp deploy/planner-update.{service,timer} /etc/systemd/system/
sudo sed -i "s#/home/oskar/projects/planner#$PWD#g; s#User=oskar#User=$(whoami)#; s#HOME=/home/oskar#HOME=$HOME#" \
  /etc/systemd/system/planner-update.service
sudo systemctl daemon-reload
systemctl cat planner-update.service | grep -E 'User|WorkingDirectory|ExecStart|HOME'
```

That last line echoes back the paths it will actually use — check them before
enabling anything.

### 5. First run, by hand, watching it

Don't enable the timer until one manual run has worked:

```bash
cd ~/projects/planner && ./deploy/update.sh
```

Expect it to report the build it deployed. Then:

```bash
sudo systemctl enable --now planner-update.timer
systemctl list-timers planner-update.timer
```

## Day to day

```bash
# what has it been doing
journalctl -u planner-update.service --since today

# force a check now
sudo systemctl start planner-update.service

# stop auto-deploying (deploy by hand again)
sudo systemctl disable --now planner-update.timer
```

The script is quiet by design: a run that finds nothing new prints nothing at
all. Five minutes of silence in the journal means it's working.

## Rollback

The last five unpacked builds stay on disk:

```bash
~/projects/planner/deploy/update.sh --rollback              # list them
~/projects/planner/deploy/update.sh --rollback b8319b7c9966 # relink and restart
```

Note that the next timer tick will roll you straight back forward, since the
deploy branch still points at the newer build. A rollback is for buying time —
revert on `main` and let the pipeline carry the fix through properly.

## When it refuses to deploy

By design, the script would rather leave the old build serving than swap in a
bad one. It stops without touching `dist` if:

- the deploy branch has no readable `build-info.json`
- the unpacked build is missing `index.html`, `assets/` or `sw.js`
- `main` has diverged on jellybot (fix by hand — it won't `reset --hard` over
  local commits)
- `npm i` fails for changed server deps, in which case the service is left
  running the old code on purpose

All of those log to `journalctl -u planner-update.service`.
