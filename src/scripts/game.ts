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

const REST_WALL = 0.78;
const REST_GROUND = 0.72;
const REST_HEAD = 0.62;
const HEAD_KICK = 2.6;
const AIR = 0.9995;
const ROLL = 0.985;
const MAX_BALL_SPEED = 12;

export const RESET_TICKS = 45;
const KICKOFF_Y = 120;

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

// A goal is a mouth at each end: open on the field side between GOAL_TOP and
// the ground, closed above by a crossbar. The ball can only get in by crossing
// the goal line through that mouth, which is what makes it read as a goal.
const PLAYER_MIN_X = PITCH_W / 2 + HEAD_R;
const PLAYER_MAX_X = PITCH_W - HEAD_R;
const AI_MIN_X = HEAD_R;
const AI_MAX_X = PITCH_W / 2 - HEAD_R;

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

function moveHead(h: Body, m: Move, speed: number, minX: number, maxX: number): void {
  h.vx = m.dx * speed;
  const onGround = h.y >= GROUND_Y - HEAD_R - 0.001;
  if (m.jump && onGround) h.vy = JUMP_V;

  h.vy += GRAVITY_HEAD;
  h.x += h.vx;
  h.y += h.vy;

  if (h.y > GROUND_Y - HEAD_R) {
    h.y = GROUND_Y - HEAD_R;
    h.vy = 0;
  }
  if (h.x < minX) {
    h.x = minX;
    h.vx = 0;
  }
  if (h.x > maxX) {
    h.x = maxX;
    h.vx = 0;
  }
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

  moveHead(s.player, move, PLAYER_SPEED, PLAYER_MIN_X, PLAYER_MAX_X);
  moveHead(s.ai, opponent ?? aiMove(state, "ai"), AI_SPEED, AI_MIN_X, AI_MAX_X);

  if (s.resetTicks > 0) {
    // Ball held at centre. The clock does not stop — that is what makes the
    // match provably finite rather than hopefully finite.
    s.resetTicks -= 1;
    s.ball = { x: PITCH_W / 2, y: KICKOFF_Y, vx: 0, vy: 0 };
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
  const behind = side === "player" ? 22 : -22;
  const home = side === "player" ? PITCH_W - 150 : 150;
  const mine =
    side === "player" ? sawX > PITCH_W / 2 - 60 : sawX < PITCH_W / 2 + 60;

  // A fast ball is harder to read. Without this the AI tracks perfectly and
  // is no fun to play; the error is what makes a hard shot worth taking.
  const pace = Math.hypot(ball.vx, ball.vy);
  const jitter = (unit(state.seed) - 0.5) * (18 + pace * 3.5);
  const target = (mine ? sawX + behind : home) + jitter;

  const gap = target - me.x;
  const dx: -1 | 0 | 1 = gap > 6 ? 1 : gap < -6 ? -1 : 0;

  const onGround = me.y >= GROUND_Y - HEAD_R - 0.001;
  const near = Math.abs(sawX - me.x) < 74;
  const headable = sawY > 70 && sawY < GROUND_Y - HEAD_R - 6;
  const jump = onGround && near && headable && mine && state.resetTicks === 0;

  return { dx, jump };
}
