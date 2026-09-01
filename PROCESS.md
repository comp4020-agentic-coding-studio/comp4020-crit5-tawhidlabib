# Process overview

## What I built

**Head Soccer** — two heads, one ball, ninety seconds. Head the ball into the
other end's goal and defend your own with your head; air hockey with gravity.
One head is yours, the other is an AI you can actually lose to. Nothing on the
page explains any of this, because the brief does not allow a tutorial: the game
plays itself in attract mode until you press something, and then it hands you
the head with the ring around it.

## The moments that mattered

### 1. Deciding what "never commit a red state" does not mean

The harness carried forward from crit-4 says never commit a red state. This
week's spec tests are written before the prototype exists, so they *must* start
red — and I nearly resolved that by softening the tests. Instead I wrote the
distinction into the harness itself, so the rule and its exception travel
together into next week's repo rather than being re-litigated:

> "Never commit a red state" means the invariants and any test that was
> passing. It does **not** mean the week's own spec tests.

Cited: [`67517af`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-tawhidlabib/commit/67517af)
(harness), then [`f8c69d9`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-tawhidlabib/commit/f8c69d9)
(the tests, red on purpose).

### 2. Raising a test budget without weakening the test

`MAX_STEPS` in the spec test was 5000. A 90-second match at 60Hz is 5400 ticks,
so every playout would have reported "never ended" — a red caused by arithmetic,
not by the game. The obvious move is to quietly edit the number. The harness
says never edit a spec test to make it pass, so the call was whether this counts.

It doesn't: the assertion — *play must always reach an ending* — is unchanged,
and only the budget moved to fit a match length chosen after the test was
written. What made it honest was disclosing it in the commit that did it rather
than burying it in a diff.

Cited: [`b0d9cec`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-tawhidlabib/commit/b0d9cec)

### 3. The rendered page is the truth

The harness says to open the page and look at it. I screenshotted both marking
viewports — 1920×1080 and 390×844 — and drove the page over the Chrome DevTools
protocol, because a screenshot cannot tell you whether input is wired up and
headless Chrome will not report a touch pointer on its own.

Four bugs that every check passed straight over: the mown stripes were drawn
`PITCH_H` tall *from* the turf line and poured 400 units out of the box; the
pitch scaled to the full 1920 and became a map; the touch band reserved a fixed
28% of the height when three thumb-sized pads are limited by width, leaving
~120px dead; and both chevrons pointed right, because the apex was drawn on the
arm side. `pnpm check` was green for all four.

Cited: [`ea3f85e`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-tawhidlabib/commit/ea3f85e)

### 4. Measuring the fun instead of tuning by feel

The AI was unbeatable, and the obvious response is to nudge constants until it
feels right. Instead I simulated three player profiles over 40 matches each —
random moves, a 200ms-late tracker, and the AI mirrored against itself — which
turned a vague "too hard" into a specific shape: perfect tracking won 50% of
matches, a fifth of a second late won **0%**. The defect was the cliff, not the
average scoreline.

That reframing is what found the fix. Handicapping the AI's reaction did not
work — it just raised scoring to 23 goals a match. A sweep over reaction lag ×
ball speed × ball gravity showed the lever was **gravity**: at 0.34 there is no
time to recover from a missed header, so latency alone decides the match. At
0.26 a late player wins 43%.

Cited: [`2068c74`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-tawhidlabib/commit/2068c74)

The measurement is a proxy and the commit message says so: being late also keeps
the head goalside instead of chasing, so the model is not monotonic in skill. It
is evidence the cliff flattened, not proof of the right difficulty. A person
playing it settles that, which is moment 5.

### 5. A person played it, and the wall was load-bearing

I handed the game over and got four things back at once: let the heads cross
halfway, stop them standing still, make it clearer how to play, and let two
people share the keyboard. Three were straightforward. Removing the halfway
wall took the game from a 43% win rate to **zero**, and finding out why is the
most useful hour of the week.

My instinct was the same one moment 4 was supposed to have cured, and I relapsed
into it anyway: four constant sweeps — AI reach × lag × speed, hop × kick ×
gravity, gravity × speeds, speed × ball cap × gravity. Sixty-odd configurations.
Not one moved the number. When a whole search space is flat, the model is wrong,
not the coordinates.

So I stopped tuning and started instrumenting, and measurement killed my first
three explanations:

| Hypothesis | Measurement | Verdict |
|---|---|---|
| The new idle bounce broke it | Set `IDLE_HOP = 0`: still 100% losses | dead |
| Scoring got easier (9 → 19 goals) | Ran the pre-change `game.ts` out of git: **19.4 goals both sides** of the change | dead — I had misread a per-side number as a match total |
| The player over-commits without a wall | Mean player x: 550 crossing vs 558 penned | dead — statistically identical |

The one I had not thought to measure was who touches the ball first after a
restart. The AI won **99%** of kickoffs with crossing enabled, against 45% with
the wall. The wall had been keeping the centre spot out of reach of *both*
heads; once they could cross, every restart became a footrace, and a
zero-latency machine wins every footrace. Eighteen goals a match, eighteen of
them decided before anyone moved.

The fix is football's own rule and it self-balances: the ball restarts in the
half of whoever just conceded. A second cause fell out of the same reading —
the AI's positioning logic had been leaning on the wall to supply distance it
never asked for, so it now picks chase-versus-home from the ball's *direction*
rather than which side of a line it sits on, and stands a full head-plus-ball
goalside instead of half that.

Then I checked the thing moment 4 had left open, properly this time: not one
latency number but the curve. A reactive player wins 83/40/23% at 67/134/200ms;
one that anticipates wins 90/73/40%. Real keyboard play is 100–150ms with
anticipation. A slope, not a cliff — and crossing is exactly what makes
anticipating pay, which is the argument for the change the tuning never found.

Cited:
[`764683f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-tawhidlabib/commit/764683f),
[`742d9b8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-tawhidlabib/commit/742d9b8)

Two smaller things the same session, both from looking rather than checking.
`grounded()` had to be a band rather than a line, because a permanently bobbing
head is almost never exactly on the turf and an equality test would have
swallowed most jump presses — read as broken controls, caused by physics. And
the keycaps that teach the controls were first drawn on the terrace, which is
precisely the height a jump reaches: the head landed on top of its own
instructions. `pnpm check` was green for both.

## Before you ship

`pnpm check` runs typecheck, build and all three suites. `pnpm check:evidence`
is the separate gate on this file, and it started the week failing three ways.
