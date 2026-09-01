# Head Soccer

Two heads, one ball, ninety seconds. A small browser game built for **C5** of
COMP4020 / COMP8020 Agentic Coding Studio.

There is a goal at each end and a head in front of each one. Everything that
happens, happens by heading the ball. The other head is played by the machine,
and it is beatable — which took measuring rather than guessing, and is written
up in [`PROCESS.md`](PROCESS.md).

The page says nothing about any of this on purpose: the brief for this
deliverable forbids telling the player anything, on screen or off. The game
demonstrates itself and hands over the moment you join in.

## Running it

```sh
mise install       # the pinned Node and pnpm for this repo
pnpm install
pnpm dev             # local dev server, served under the Pages base path
pnpm check           # typecheck, build, and every spec suite
pnpm check:evidence  # the separate process-evidence gate CI runs before shipping
pnpm build           # produce dist/, which is what deploys
```

`mise` is the course's runtime manager; any other is fine if it provides the
versions in `mise.toml`.

## Layout

Four modules under `src/scripts/`, split so that game logic can be tested in
Node without a browser anywhere near it:

- `game.ts` — physics, scoring, clock and the opponent. No DOM at all, which is
  what lets `spec/crit-5.test.ts` import it directly and run 200 seeded matches
  to prove play always reaches an ending and can be lost.
- `render.ts` — draws a state to a 2D context. Holds no game logic.
- `input.ts` — keyboard and touch, collapsed into the one move type.
- `main.ts` — the fixed-timestep loop that wires the three together.

The simulation runs in logical pitch units at a fixed 60Hz and the renderer
scales to whatever canvas it is given, so resizing mid-match cannot perturb it.
Nothing calls `Math.random`: all variation comes from a seed carried in the
state, which is what makes the seeded matches in the spec suite reproducible.

Elsewhere: `spec/` holds the shipped invariants and this deliverable's contract;
`CLAUDE.md` is the harness, carried forward across the course and grown each
week; `.github/workflows/checks.yml` runs the same checks plus links, secrets
and the Pages deploy once the repo is public.

## What gets marked

The deployed site, live in Chrome at two fixed viewports — see the course
website's
[assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#marking-environment).
Both viewports were treated as first-class here: the phone layout puts thumb
pads on the canvas, and both were verified by driving real key and touch events
at the page rather than by looking at screenshots.
