import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// C5 "A game" — the mechanically checkable lines of the published spec:
// https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/
//
// These are CONTRACT tests: they answer this week's brief and stay behind when
// the week does. They assert what the game must DO, not how it is built, so a
// rewrite of the rendering or a change of stack leaves them standing.
//
// The rest of the spec — the opening screen inviting the first move, a stranger
// reaching an ending inside five minutes, the change that came from playing —
// no test can hold. Those are settled at the crit.

// ---------------------------------------------------------------------------
// "it can be lost: a wrong move is possible, and play ends somewhere — a win,
// a loss or a finish"
//
// Also the spec's "one rule of the game has a focused automated test".
//
// The rules live in a module with no DOM in it, so the rule can be tested
// apart from its rendering. The vocabulary below is the contract:
//
//   initial()        -> the opening state
//   moves(state)     -> the legal moves from that state
//   step(state, move)-> the state after that move
//   isOver(state)    -> has play ended
//   outcome(state)   -> "playing" | "won" | "lost" | "finished"
//
// Rename these here and in the module together if different words fit your
// game better. Never weaken an assertion to make one pass — change the game.
// ---------------------------------------------------------------------------

// A non-literal specifier: the module does not exist yet, and typecheck should
// not fail on that. It resolves at run time, so each test below fails on its
// own with a readable message instead of the whole file failing to collect.
const RULES = "../src/scripts/game";

type Outcome = "playing" | "won" | "lost" | "finished";
type Rules = {
  initial: () => unknown;
  moves: (state: unknown) => unknown[];
  step: (state: unknown, move: unknown) => unknown;
  isOver: (state: unknown) => boolean;
  outcome: (state: unknown) => Outcome;
};

async function loadRules(): Promise<Rules> {
  return (await import(/* @vite-ignore */ RULES)) as Rules;
}

// Deterministic playouts. A flaky spec test is worse than no spec test.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A 90-second match at 60Hz is 5400 ticks. This budget was 5000 when it was
// written, before the match length was chosen — every playout would have
// reported "never ended" for a reason that is arithmetic, not a bug. Raising a
// termination budget to fit the designed match is not the same as weakening
// the assertion, which is unchanged: play must always reach an ending.
const MAX_STEPS = 8000;

const PLAYOUTS = 200;

// Play one random game. Returns the ending, or null if it never ended.
async function playout(seed: number): Promise<Outcome | null> {
  const { initial, moves, step, isOver, outcome } = await loadRules();
  const random = seeded(seed);
  let state = initial();

  for (let i = 0; i < MAX_STEPS; i++) {
    if (isOver(state)) return outcome(state);
    const legal = moves(state);
    if (legal.length === 0) return isOver(state) ? outcome(state) : null;
    state = step(state, legal[Math.floor(random() * legal.length)]);
  }
  return null;
}

// Two tests below ask about the same 200 playouts. Simulate them once.
let cached: (Outcome | null)[] | undefined;
async function allPlayouts(): Promise<(Outcome | null)[]> {
  if (!cached) {
    const results: (Outcome | null)[] = [];
    for (let seed = 1; seed <= PLAYOUTS; seed++) results.push(await playout(seed));
    cached = results;
  }
  return cached;
}

describe("C5: the game can be lost", () => {
  it("exposes its rules apart from its rendering", async () => {
    const rules = await loadRules();
    for (const name of ["initial", "moves", "step", "isOver", "outcome"]) {
      expect(
        typeof rules[name as keyof Rules],
        `the rules module must export ${name}()`,
      ).toBe("function");
    }
  });

  it("opens in a state that is not already over", async () => {
    const { initial, isOver } = await loadRules();
    expect(isOver(initial())).toBe(false);
  });

  it("offers a move from the opening state", async () => {
    const { initial, moves } = await loadRules();
    expect(moves(initial()).length).toBeGreaterThan(0);
  });

  it(`always ends: ${PLAYOUTS} random playouts all reach an ending`, async () => {
    const endings = await allPlayouts();
    endings.forEach((ending, i) => {
      expect(
        ending,
        `playout ${i + 1} never ended — play must finish somewhere`,
      ).not.toBeNull();
      expect(ending).not.toBe("playing");
    });
  });

  it("can be lost: some line of play reaches a losing end", async () => {
    // The whole point of the week. An instrument cannot be played wrong; a
    // game can. If every playout wins, there are no stakes.
    const endings = new Set(await allPlayouts());
    expect(
      endings.has("lost"),
      `no random playout was ever lost (saw: ${[...endings].join(", ")}) — a wrong move must be possible`,
    ).toBe(true);
  });

  it("stays ended: a finished game does not resume", async () => {
    const { initial, moves, step, isOver } = await loadRules();
    const random = seeded(99);
    let state = initial();

    for (let i = 0; i < MAX_STEPS && !isOver(state); i++) {
      const legal = moves(state);
      if (legal.length === 0) break;
      state = step(state, legal[Math.floor(random() * legal.length)]);
    }
    expect(isOver(state), "expected this playout to reach an ending").toBe(true);

    for (const move of moves(state)) {
      expect(
        isOver(step(state, move)),
        "stepping a finished game put it back into play",
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// "it teaches itself: no instructions anywhere, on screen or off"
//
// Only the negative half is testable. That the opening screen actually invites
// the first move is what the pod settles when they play it cold.
//
// This is the rule with no other backpressure on it: a "How to play" panel is
// what gets added without being asked for, and every other check in this repo
// would stay green. Hence the test.
// ---------------------------------------------------------------------------

const DIST = resolve("dist");

function files(dir: string = DIST): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const TELLS: RegExp[] = [
  /how\s+to\s+play/i,
  /\btutorials?\b/i,
  /\binstructions\b/i,
  /\bcontrols\s*:/i,
  /\bobjective\s*:/i,
  /\bgoal\s*:/i,
  /\bthe\s+rules\b/i,
  /\bhow\s+it\s+works\b/i,
  /(use|press|hit|tap)\s+(the\s+)?(arrow\s+keys?|wasd|space\s?bar|spacebar)/i,
  /press\s+\S+\s+to\s+\w/i,
  /click\s+(here\s+)?to\s+(start|play|begin)/i,
];

function tells(text: string): string[] {
  return TELLS.flatMap((pattern) => {
    const hit = text.match(pattern);
    return hit ? [hit[0].replace(/\s+/g, " ").trim()] : [];
  });
}

describe("C5: it teaches itself", () => {
  const pages = files()
    .map((path) => relative(DIST, path).split(sep).join("/"))
    .filter((name) => name.endsWith(".html"))
    .map((name) => ({
      name,
      doc: new JSDOM(readFileSync(join(DIST, name), "utf8")).window.document,
    }));

  it("built at least one page", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const { name, doc } of pages) {
    it(`${name} explains nothing on screen`, () => {
      const onScreen = doc.body?.textContent ?? "";
      expect(
        tells(onScreen),
        "the opening screen has to make the first move obvious without saying it",
      ).toEqual([]);
    });

    it(`${name} explains nothing in its metadata`, () => {
      const description =
        doc
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ?? "";
      expect(tells(description)).toEqual([]);
    });
  }

  it("the README does not stand in for a tutorial", () => {
    // "no instructions anywhere, on screen or off" — the brief names the
    // README specifically.
    expect(tells(readFileSync(resolve("README.md"), "utf8"))).toEqual([]);
  });
});
