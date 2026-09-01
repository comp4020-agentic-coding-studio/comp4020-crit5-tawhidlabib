// The rules of the game, and nothing else.
//
// No DOM in here — no window, no document, no canvas. Two reasons: the spec
// tests run in Vitest's node environment and import this module directly, and
// keeping the rules apart from the drawing is what lets one rule be tested
// without standing up a browser.
//
// Everything is in logical pitch units, never pixels. The renderer scales to
// whatever canvas it has, so a resize mid-match cannot perturb the simulation.

export const PITCH_W = 800;
export const PITCH_H = 400;
export const GROUND_Y = 400;

// A goal is a mouth at each end: open on the field side between GOAL_TOP and
// the ground, closed above by a crossbar. The ball can only get in by crossing
// the goal line through that mouth, which is what makes it read as a goal.
export const GOAL_DEPTH = 54;
export const GOAL_TOP = 300;

export const BALL_R = 13;
export const HEAD_R = 33;

export const TICK_HZ = 60;
export const MATCH_SECONDS = 90;
export const MATCH_TICKS = MATCH_SECONDS * TICK_HZ;

// The ball hangs. This is the single number that decides whether the game is
// fair to a person: at 0.34 a player a fifth of a second late lost every match
// no matter what else was tuned, because there was no time to recover from a
// missed header. At 0.26 there is.
const GRAVITY_BALL = 0.26;
const GRAVITY_HEAD = 0.62;
const JUMP_V = -12.5;

/**
 * A head never comes fully to rest: it lands and immediately hops again, about
 * fourteen units, four times a second. Standing dead still on the turf reads as
 * a paused game, and the bob is also why a stationary head still puts something
 * into the ball.
 */
const IDLE_HOP = -4.2;
const PLAYER_SPEED = 5.2;
const AI_SPEED = 4.6;

/**
 * Ticks of reaction time the AI gives away. It aims at where the ball was a
 * beat ago, not where it is.
 *
 * Without this the AI reads the ball with zero latency, which a person holding
 * a keyboard cannot: a player 200ms late went from winning half their matches
 * to none of them. The handicap is what flattens that cliff.
 */
const AI_LAG = 7;

/**
 * How far from its own goal a head will chase the ball before giving up and
 * going home, in pitch units.
 *
 * The pen came off the halfway line and this dial went with it. At 576 the AI
 * hunts the ball into your half and a player 200ms late loses every single
 * match — the same cliff as before, arrived at from the other direction. It
 * still crosses; it just stops following you home.
 */
const AI_REACH = 460;

/**
 * How far goalside of the ball a head tries to stand, in pitch units.
 *
 * A head is 33 and a ball 13, so anything under 46 is already touching: aim
 * short and you nudge the ball sideways instead of sending it up the pitch.
 * The halfway wall used to supply the missing distance for free by shoving the
 * head further back than it asked to stand.
 */
const BEHIND = 34;

const REST_WALL = 0.78;
const REST_GROUND = 0.72;
const REST_HEAD = 0.62;
const HEAD_KICK = 2.6;
const AIR = 0.9995;
const ROLL = 0.985;
const MAX_BALL_SPEED = 12;

export const RESET_TICKS = 45;
const KICKOFF_Y = 120;

/**
 * How far into the conceding side's half the restart drops, in pitch units.
 *
 * Football's rule, and it is here for football's reason. While the heads were
 * penned into their own halves neither could reach the centre spot, so a
 * restart at the centre was nobody's ball. The moment they could cross, that
 * same restart became a footrace — and a machine with no reaction time wins a
 * footrace 99 times out of 100. Eighteen goals a match is eighteen of them.
 *
 * Giving the restart to whoever just conceded makes it self-balancing: falling
 * behind hands you the ball.
 */
const KICKOFF_BIAS = 120;

export type Move = { dx: -1 | 0 | 1; jump: boolean };
export type Outcome = "playing" | "won" | "lost" | "finished";
export type Side = "player" | "ai";

export type Body = { x: number; y: number; vx: number; vy: number };

export type State = {
  tick: number;
  seed: number;
  ball: Body;
  /** The right-hand head. Defends the right goal, attacks the left. */
  player: Body;
  /** The left-hand head. Defends the left goal, attacks the right. */
  ai: Body;
  playerScore: number;
  aiScore: number;
  /** > 0 while the ball is held at centre after a goal. The clock keeps running. */
  resetTicks: number;
  /**
   * Who just scored, for as long as resetTicks is counting down. The renderer
   * needs it to celebrate at the right end; null at the opening kickoff, which
   * nobody scored.
   */
  lastGoal: Side | null;
};

// Both heads roam the whole pitch. They were penned into their own half to
// begin with, which is tidy and dull: you can never chase a loose ball down,
// the two heads can never contest one, and the halfway line may as well be a
// wall. Letting them cross is what turns two paddles into a game.
const HEAD_MIN_X = HEAD_R;
const HEAD_MAX_X = PITCH_W - HEAD_R;

const MOVES: readonly Move[] = [
  { dx: -1, jump: false },
  { dx: 0, jump: false },
  { dx: 1, jump: false },
  { dx: -1, jump: true },
  { dx: 0, jump: true },
  { dx: 1, jump: true },
];

/** LCG. The seed lives in the state so playouts are reproducible. */
function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function unit(seed: number): number {
  return ((seed >>> 8) & 0xffff) / 0x10000;
}

function restHead(side: Side): Body {
  return {
    x: side === "player" ? PITCH_W - 150 : 150,
    y: GROUND_Y - HEAD_R,
    vx: 0,
    vy: 0,
  };
}

export function initial(): State {
  return {
    tick: 0,
    seed: 0x5eed1,
    ball: { x: PITCH_W / 2, y: KICKOFF_Y, vx: 0, vy: 0 },
    player: restHead("player"),
    ai: restHead("ai"),
    playerScore: 0,
    aiScore: 0,
    resetTicks: RESET_TICKS,
    lastGoal: null,
  };
}

/**
 * Where the restart drops: into the half of whoever just conceded. At the
 * opening whistle nobody has, so it is the centre spot and a fair race.
 */
function kickoffX(lastGoal: Side | null): number {
  if (!lastGoal) return PITCH_W / 2;
  // lastGoal names the scorer, so the other side is the one restarting.
  return lastGoal === "player" ? PITCH_W / 2 - KICKOFF_BIAS : PITCH_W / 2 + KICKOFF_BIAS;
}

export function moves(_state: State): readonly Move[] {
  return MOVES;
}

export function isOver(state: State): boolean {
  return state.tick >= MATCH_TICKS;
}

export function outcome(state: State): Outcome {
  if (!isOver(state)) return "playing";
  if (state.playerScore > state.aiScore) return "won";
  if (state.playerScore < state.aiScore) return "lost";
  return "finished";
}

export function clock(state: State): number {
  return Math.max(0, Math.ceil((MATCH_TICKS - state.tick) / TICK_HZ));
}

function clone(s: State): State {
  return {
    tick: s.tick,
    seed: s.seed,
    ball: { ...s.ball },
    player: { ...s.player },
    ai: { ...s.ai },
    playerScore: s.playerScore,
    aiScore: s.aiScore,
    resetTicks: s.resetTicks,
    lastGoal: s.lastGoal,
  };
}

/** Apex of the idle hop, from v^2 = 2*g*h. */
const HOP_PEAK = (IDLE_HOP * IDLE_HOP) / (2 * GRAVITY_HEAD);

/**
 * Low enough to jump from.
 *
 * This has to be a band, not a line. Once a head is always bobbing it is almost
 * never exactly on the turf, and testing for that would have quietly eaten most
 * jump presses — the bug would have read as unresponsive controls, not as a
 * physics change.
 */
function grounded(h: Body): boolean {
  return h.y >= GROUND_Y - HEAD_R - HOP_PEAK - 1;
}

function moveHead(h: Body, m: Move, speed: number): void {
  h.vx = m.dx * speed;
  if (m.jump && grounded(h)) h.vy = JUMP_V;

  h.vy += GRAVITY_HEAD;
  h.x += h.vx;
  h.y += h.vy;

  if (h.y > GROUND_Y - HEAD_R) {
    h.y = GROUND_Y - HEAD_R;
    h.vy = IDLE_HOP;
  }
  if (h.x < HEAD_MIN_X) {
    h.x = HEAD_MIN_X;
    h.vx = 0;
  }
  if (h.x > HEAD_MAX_X) {
    h.x = HEAD_MAX_X;
    h.vx = 0;
  }
}

/**
 * Heads are solid to each other. They could not touch while each was penned
 * into its own half; the moment they can cross, two heads sliding through one
 * another in front of a goal reads as a bug rather than a rule.
 */
function headHead(a: Body, b: Body): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = HEAD_R * 2;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;

  const d = Math.sqrt(d2);
  // Exactly coincident: shove them apart along the pitch rather than dividing
  // by zero.
  const nx = d === 0 ? 1 : dx / d;
  const ny = d === 0 ? 0 : dy / d;
  const push = (min - d) / 2;

  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  settle(a);
  settle(b);
}

/** Put a head back inside the pitch after being shoved. */
function settle(h: Body): void {
  if (h.x < HEAD_MIN_X) h.x = HEAD_MIN_X;
  if (h.x > HEAD_MAX_X) h.x = HEAD_MAX_X;
  if (h.y > GROUND_Y - HEAD_R) h.y = GROUND_Y - HEAD_R;
  if (h.y < HEAD_R) h.y = HEAD_R;
}

function headBall(ball: Body, h: Body): void {
  const dx = ball.x - h.x;
  const dy = ball.y - h.y;
  const min = BALL_R + HEAD_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;

  const d = Math.sqrt(d2) || 0.0001;
  const nx = dx / d;
  const ny = dy / d;

  // Separate first, so the ball can't sit inside the head jittering.
  ball.x = h.x + nx * min;
  ball.y = h.y + ny * min;

  const rvn = (ball.vx - h.vx) * nx + (ball.vy - h.vy) * ny;
  if (rvn < 0) {
    const j = -(1 + REST_HEAD) * rvn;
    ball.vx += j * nx;
    ball.vy += j * ny;
  }
  // A deliberate outward kick on every contact: heading should always send it
  // somewhere, even from a standing head.
  ball.vx += nx * HEAD_KICK;
  ball.vy += ny * HEAD_KICK;
}

function clampBallSpeed(ball: Body): void {
  const s = Math.hypot(ball.vx, ball.vy);
  if (s > MAX_BALL_SPEED) {
    ball.vx = (ball.vx / s) * MAX_BALL_SPEED;
    ball.vy = (ball.vy / s) * MAX_BALL_SPEED;
  }
}

/**
 * Advance one tick (1/60s).
 *
 * `move` drives the player's head. `opponent` drives the AI's head — omit it
 * and the AI plays itself, which is both how a real match runs and how the
 * attract-mode demo works. Passing it is the seam for hot-seat two-player.
 *
 * Deterministic: no Math.random, all jitter comes from state.seed.
 */
export function step(state: State, move: Move, opponent?: Move): State {
  if (isOver(state)) return state;

  const s = clone(state);
  s.seed = nextSeed(s.seed);
  s.tick += 1;

  moveHead(s.player, move, PLAYER_SPEED);
  moveHead(s.ai, opponent ?? aiMove(state, "ai"), AI_SPEED);
  headHead(s.player, s.ai);

  if (s.resetTicks > 0) {
    // Ball held at centre. The clock does not stop — that is what makes the
    // match provably finite rather than hopefully finite.
    s.resetTicks -= 1;
    s.ball = { x: kickoffX(s.lastGoal), y: KICKOFF_Y, vx: 0, vy: 0 };
    if (s.resetTicks === 0) s.ball.vx = (unit(s.seed) - 0.5) * 1.5;
    return s;
  }

  const ball = s.ball;
  ball.vy += GRAVITY_BALL;
  ball.vx *= AIR;
  ball.vy *= AIR;
  ball.x += ball.vx;
  ball.y += ball.vy;

  headBall(ball, s.player);
  headBall(ball, s.ai);

  // Ground.
  if (ball.y > GROUND_Y - BALL_R) {
    ball.y = GROUND_Y - BALL_R;
    ball.vy = -ball.vy * REST_GROUND;
    ball.vx *= ROLL;
    if (Math.abs(ball.vy) < 0.6) ball.vy = 0;
  }
  // Ceiling.
  if (ball.y < BALL_R) {
    ball.y = BALL_R;
    ball.vy = -ball.vy * REST_WALL;
  }

  // Crossbars: solid from above, so the only way in is through the mouth.
  const overGoal = ball.x < GOAL_DEPTH || ball.x > PITCH_W - GOAL_DEPTH;
  if (overGoal && ball.vy > 0 && ball.y < GOAL_TOP && ball.y + BALL_R > GOAL_TOP) {
    ball.y = GOAL_TOP - BALL_R;
    ball.vy = -ball.vy * REST_WALL;
  }

  // Side walls, but only above the goal mouths.
  if (ball.y <= GOAL_TOP) {
    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.vx = -ball.vx * REST_WALL;
    }
    if (ball.x > PITCH_W - BALL_R) {
      ball.x = PITCH_W - BALL_R;
      ball.vx = -ball.vx * REST_WALL;
    }
  } else {
    // Inside a goal mouth: crossing the line is a goal.
    if (ball.x < GOAL_DEPTH) {
      s.playerScore += 1;
      s.resetTicks = RESET_TICKS;
      s.lastGoal = "player";
    } else if (ball.x > PITCH_W - GOAL_DEPTH) {
      s.aiScore += 1;
      s.resetTicks = RESET_TICKS;
      s.lastGoal = "ai";
    }
  }

  clampBallSpeed(ball);
  return s;
}

/**
 * What one side would do from here. Pure, so the attract-mode demo can drive
 * both heads with it and get a real game rather than a scripted animation.
 */
export function aiMove(state: State, side: Side): Move {
  const me = side === "player" ? state.player : state.ai;
  const ball = state.ball;

  // Where the ball was AI_LAG ticks ago, rewound along its own velocity. Doing
  // it this way keeps aiMove pure — no stored history — so attract mode can
  // still drive both heads with it and the spec tests stay reproducible.
  const sawX = ball.x - ball.vx * AI_LAG;
  const sawY = ball.y - ball.vy * AI_LAG;

  // Stand on the goal side of the ball, so a contact sends it up the pitch.
  const behind = side === "player" ? BEHIND : -BEHIND;
  const home = side === "player" ? PITCH_W - 150 : 150;

  // Chase what is near my goal, and anything travelling towards it however far
  // away it is. Position alone made the head flip between chasing and going
  // home every time the ball crossed one line, which is survivable against a
  // wall and ruinous on an open pitch: you spend the match running the wrong
  // way.
  const ownGoal = side === "player" ? PITCH_W : 0;
  const incoming = side === "player" ? ball.vx > 0 : ball.vx < 0;
  const mine = Math.abs(sawX - ownGoal) < AI_REACH || incoming;

  // A fast ball is harder to read. Without this the AI tracks perfectly and
  // is no fun to play; the error is what makes a hard shot worth taking.
  const pace = Math.hypot(ball.vx, ball.vy);
  const jitter = (unit(state.seed) - 0.5) * (18 + pace * 3.5);
  const target = (mine ? sawX + behind : home) + jitter;

  const gap = target - me.x;
  const dx: -1 | 0 | 1 = gap > 6 ? 1 : gap < -6 ? -1 : 0;

  const near = Math.abs(sawX - me.x) < 74;
  const headable = sawY > 70 && sawY < GROUND_Y - HEAD_R - 6;
  const jump = grounded(me) && near && headable && mine && state.resetTicks === 0;

  return { dx, jump };
}
