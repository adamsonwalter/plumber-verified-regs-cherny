# Playbook — migrating a live Netlify app onto Bolt

Written from doing it once, for the next one. Everything here was observed, not
assumed. Companion to `~/.agents/skills/bolt-new-portable-builder/references/how-bolt-thinks.md`,
which holds the general Bolt behaviour; this file holds the migration sequence.

## The shape, and why

Bolt's published `bolt.host` site only updates when a human clicks **Update**.
For any app an autonomous agent must keep current, `bolt.host` therefore cannot
be production. The working shape is:

```
external agent ─┐
                ├─► GitHub ─► Netlify builds and publishes   ← production
Bolt (edits) ───┘         └─► Bolt syncs (never publishes)
```

Bolt is the editor and the backend (database, auth, subscriptions). Netlify is a
**publishing surface only** — it publishes without a human click, which is the
one thing Bolt won't do. The test that the split is right: *if Bolt ever ships
CLI publish, Netlify drops out and nothing else changes.* Keep the Netlify
wiring thin enough that this stays true.

## Before you connect Bolt to the repo

**1. Bolt takes the repo's default branch, and the import starts the instant you
connect.** There is no pause to paste "don't touch anything" first — connecting
drops you straight into the project window and Bolt begins.

**2. So guard at the repo, not with wording.** Temporarily set the GitHub
default branch to the Bolt working branch:

```bash
gh repo edit --default-branch <bolt-branch>     # before connecting
gh repo edit --default-branch main              # once Bolt shows the right branch Active
```

Nothing else depends on the GitHub default: Netlify's production branch is a
Netlify setting, and an external agent that names `main` explicitly is
unaffected. Only a bare `git clone` during the window is exposed. This protected
`main` when the instruction ordering was got wrong — a *human* sequencing error,
which is likelier than Bolt misbehaving.

**3. Put a `BOLT.md` on that branch first.** Product language, no stack or
database prescription. Seed it with the **real** data, not mocks — the contract
gets exercised from the first preview instead of at integration.

**4. Expect a commit on bare import.** Observed: `.env` added to `.gitignore`
and an empty stub `package-lock.json`. Harmless — but it *is* a commit, so on a
live default branch it would have deployed.

## The trap that cost the most: a compiled build is not a running app

Bolt reported *"the production bundle compiled successfully"* and stopped. The
preview was blank and stayed blank on refresh.

Cause: `src/main.jsx` was the Vite entry named in `index.html`, but it ended at
`export default App` — no `react-dom` import, no `createRoot`. The module
loaded, React loaded, `#root` stayed empty, **and nothing threw**. Clean
console, successful build, blank page.

Two durable lessons:

- **`npm run build` succeeding proves nothing about whether the app mounts.** A
  Vite bundle compiles whether or not anything renders. Never accept "it built"
  as the stop test. `BOLT.md` should always end with a stop test a human can
  *see* — "a phone-width preview lists the regs, opens one, shows its quote".
- **A blank page with a clean console means nothing mounted**, not that
  something crashed. Check `document.getElementById('root').children.length`
  before hunting for errors. If the entry module was never imported you would
  see a network 404; if it loaded but never mounted you see 200s and silence.

Diagnosing it locally took one `npm install`, one dev server and three browser
checks. Do that rather than sending Bolt round again — it is faster and costs no
Bolt tokens.

## Netlify wiring changes (all of it)

Exactly three things, and they must land in the same commit as the app tree:

| Setting | Static app | Vite app |
|---|---|---|
| `publish` | `"public"` | `"dist"` |
| `command` | `<gate>` | `<gate> && npm run build` |
| `[build.environment]` | `PYTHON_VERSION` | add `NODE_VERSION` |

Plus `node_modules/` and `dist/` in `.gitignore`.

**`public/` becomes Vite's `publicDir`, which is free win.** Everything in it is
copied verbatim into `dist/` at build, so data files, icons, manifest and any
secondary static pages keep their exact URLs. An external agent writing
`public/<data>.json` needs **no change at all**.

**The old `public/index.html` does not collide.** Vite copies publicDir first and
then writes its own built `index.html` over the top, so the new app wins. Verify
it anyway — check `dist/index.html` is small and contains your root div, not the
old 70 KB page.

**Chain the data gate before the build with `&&`** so a malformed data file
fails the deploy before anything compiles.

## Verify before you trust it

Rehearse the exact Netlify build locally — do not wait for a deploy to find out:

```bash
rm -rf dist && <gate> && npm run build
find dist -type f            # every asset the old site served must be present
```

Then serve `dist/` and confirm the app renders, the data file is reachable at
its old URL, and any secondary pages still resolve.

## Sequence that worked

1. `BOLT.md` on a new branch; `main` untouched
2. Flip GitHub default to that branch
3. Connect Bolt, confirm its GitHub control shows the branch **Active**
4. Flip the default back to `main`
5. `Read BOLT.md. Do only those first tasks. Stop when preview boots.`
6. Pull what it built, run it locally, fix what is broken, push
7. Move the host wiring (table above), rehearse the build locally
8. Only then consider merging to `main`

`main` stayed on the old app and kept serving throughout. Nothing needed undoing
at any point.
