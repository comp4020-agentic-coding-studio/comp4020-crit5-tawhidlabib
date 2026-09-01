# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Run `pnpm check` before you push.
- Open the page in a browser and look at it. The rendered page is the truth;
  your mental model of it isn't.
- When a check fails, read its output before you change anything.
- Never commit a red state.

## This repo is Astro, under a base path

Converted with the course `stack` skill. `astro.config.ts` sets
`base: "/comp4020-crit5-tawhidlabib"`, and the dev server serves under it too,
so path bugs reproduce locally instead of only on the live URL.

- Internal links and asset URLs must be **relative** or prefixed with
  `import.meta.env.BASE_URL`. A root-absolute path (`/card.png`) looks right on
  localhost and 404s on Pages. Nothing in CI catches this.
- The head belongs in `src/layouts/Layout.astro`, not copied between pages. The
  conversion leaves it inline in `src/pages/index.astro`; the moment there is a
  second page, move it into a layout and have pages pass their metadata in.
- Commit `pnpm-lock.yaml` with any dependency change: CI installs with
  `--frozen-lockfile`.

## Red is not always wrong

"Never commit a red state" means the invariants and any test that was passing.
It does **not** mean the week's own spec tests: those are written before the
prototype exists and are supposed to start red. Red-to-green across the week is
the record of the work. Never edit a spec test to make it pass — change the
page.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows. The head names it
as `./card.png`, which resolves against the page that names it — correct from
the root page, wrong one directory down. If a layout appears, build that URL
absolutely from `BASE_URL` against `site` instead, so it is right from any page
depth; that is worth doing rather than hand-writing it per page. Replace the
image, and give each page a real `description`. Nothing in CI checks the card,
so look at the deployed head.

## The checks

`pnpm check` runs them (`pnpm check:evidence` is the extra gate before you
ship); CI runs the same plus links, secrets and the deploy. Read the failure.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook: what you add to it is the harness, and the
harness is assessed. This file and the sensors you wire into `check` carry
across the course --- both come with you into next week's repo. The prototype
doesn't: source, and the tests answering this week's published spec, stay
behind. `spec/README.md` draws the line.

As you learn what your prototype needs --- a convention the work has to hold to,
a sensor that keeps catching you out (a linter, say), a fact about the stack
that is easy to get wrong --- write it down here and wire it into `check`.
Growing this file is the work.
