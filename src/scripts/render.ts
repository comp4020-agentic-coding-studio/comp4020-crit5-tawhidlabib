// Drawing. Reads a State, never changes one — all the rules live in game.ts.
//
// The pitch is a fixed logical box scaled to fit whatever canvas it is handed,
// so the same simulation renders at 1920x1080 and at 390x844 without the
// physics knowing anything about it.

import {
  BALL_R,
  type Body,
  type Move,
  GOAL_DEPTH,
  GOAL_TOP,
  GROUND_Y,
  HEAD_R,
  PITCH_H,
  PITCH_W,
  RESET_TICKS,
  type State,
} from "./game.ts";

export type Rect = { x: number; y: number; w: number; h: number };

export type Layout = {
  /** CSS pixels per logical pitch unit. */
  scale: number;
  ox: number;
  oy: number;
  touch: boolean;
  buttons: { left: Rect; right: Rect; jump: Rect } | null;
};

const BACKDROP = "#0a1420";
const FRAME = "rgba(255,255,255,0.16)";
const SKY_TOP = "#12263c";
const SKY_BOT = "#1d4363";
const STAND = "#0e1e33";
const STAND_ROW = "rgba(255,255,255,0.045)";
const TURF = "#1f6b3a";
const TURF_DARK = "#1a5c32";
const LINE = "rgba(255,255,255,0.32)";
const POST = "#f2f4f7";
const BALL = "#fdfdfd";
const BALL_SPOT = "#1c1c1c";
export const PLAYER_HEAD = "#ffd166";
const PLAYER_RING = "#ffe9a8";
export const AI_HEAD = "#ef5d60";
const AI_RING = "#ffb3b4";

/** Beyond this the pitch stops looking like a game and starts looking like a map. */
const MAX_PITCH_W = 1180;

export function layout(w: number, h: number, touch: boolean): Layout {
  // Size the buttons first, then reserve exactly the band they need. Reserving
  // a fixed fraction of the height instead left ~120px of dead space below the
  // buttons at 390x844, because three thumb-sized pads are limited by the
  // width, not the height.
  const pad = Math.min(22, w * 0.05);
  const size = touch ? Math.min((w - pad * 4) / 3, h * 0.16, 128) : 0;
  const band = touch ? size + pad * 2.6 : 0;
  const availH = h - band;

  const scale = Math.min(
    (w * 0.98) / PITCH_W,
    (availH * 0.94) / PITCH_H,
    MAX_PITCH_W / PITCH_W,
  );
  const ox = (w - PITCH_W * scale) / 2;
  const oy = (availH - PITCH_H * scale) / 2;

  let buttons: Layout["buttons"] = null;
  if (touch) {
    // Thumbs reach the bottom corners, so the pads live there: steering under
    // the left thumb, jump under the right.
    const top = h - band + pad * 1.3;
    buttons = {
      left: { x: pad, y: top, w: size, h: size },
      right: { x: pad * 2 + size, y: top, w: size, h: size },
      jump: { x: w - pad - size, y: top, w: size, h: size },
    };
  }

  return { scale, ox, oy, touch, buttons };
}

export function hit(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function draw(
  ctx: CanvasRenderingContext2D,
  state: State,
  l: Layout,
  opts: {
    attract: boolean;
    ended: boolean;
    calm: boolean;
    /** Both heads have a person on them. */
    twoPlayer: boolean;
    /** What the demo is pressing this tick, so the keys can show it. */
    demo?: { player: Move; ai: Move };
  },
): void {
  const { canvas } = ctx;
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);

  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(l.ox, l.oy);
  ctx.scale(l.scale, l.scale);

  // Everything plays inside a framed box. Without the frame the pitch reads as
  // debris floating in the page, which is exactly how it looked at 390x844.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, PITCH_W, PITCH_H, 12);
  ctx.clip();

  const sky = ctx.createLinearGradient(0, 0, 0, PITCH_H);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(1, SKY_BOT);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, PITCH_W, PITCH_H);

  drawStand(ctx);
  drawPitch(ctx);
  drawGoal(ctx, "left");
  drawGoal(ctx, "right");
  drawKeys(ctx, state, l, opts);
  drawBall(ctx, state);

  // In attract nobody owns either head yet, so both are marked and both pulse:
  // two heads going spare is the invitation. In a match the ring means "this
  // one is yours", and the left head only earns one once a person takes it.
  const claimable = opts.attract && !opts.calm;
  drawHead(ctx, state.ai, AI_HEAD, false, opts.attract || opts.twoPlayer ? AI_RING : null, claimable);
  drawHead(ctx, state.player, PLAYER_HEAD, true, PLAYER_RING, claimable);
  drawGoalMoment(ctx, state, opts.calm);

  ctx.restore(); // release the pitch clip

  ctx.beginPath();
  ctx.roundRect(0, 0, PITCH_W, PITCH_H, 12);
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  if (l.buttons) drawButtons(ctx, l.buttons, opts.attract ? opts.demo?.player : undefined);
  if (opts.ended) drawEnding(ctx, state, w, h);
}

/**
 * A terrace behind the pitch. The ball's ceiling is the top of the box, so the
 * box has to be this tall — but nothing ever happens in the upper half, and an
 * empty frame reads as a mistake. This gives the sky a floor to sit on.
 */
function drawStand(ctx: CanvasRenderingContext2D): void {
  const base = GOAL_TOP - 6;
  const top = base - 114;

  ctx.fillStyle = STAND;
  ctx.fillRect(0, top, PITCH_W, base - top);

  ctx.fillStyle = STAND_ROW;
  for (let y = top + 14; y < base - 10; y += 19) {
    ctx.fillRect(0, y, PITCH_W, 8);
  }

  // A rail along the front, catching the light off the pitch.
  ctx.fillStyle = "rgba(255,255,255,0.11)";
  ctx.fillRect(0, base - 5, PITCH_W, 3);
}

function drawPitch(ctx: CanvasRenderingContext2D): void {
  const top = GOAL_TOP - 6;
  const depth = GROUND_Y - top;

  ctx.fillStyle = TURF;
  ctx.fillRect(0, top, PITCH_W, depth);

  // Mown stripes, so motion across the pitch reads.
  ctx.fillStyle = TURF_DARK;
  for (let i = 0; i < 8; i += 2) {
    ctx.fillRect((PITCH_W / 8) * i, top, PITCH_W / 8, depth);
  }

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(PITCH_W / 2, GOAL_TOP - 6);
  ctx.lineTo(PITCH_W / 2, GROUND_Y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(PITCH_W / 2, GROUND_Y, 62, Math.PI, 0);
  ctx.stroke();
}

function drawGoal(ctx: CanvasRenderingContext2D, side: "left" | "right"): void {
  const x = side === "left" ? 0 : PITCH_W - GOAL_DEPTH;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x, GOAL_TOP, GOAL_DEPTH, GROUND_Y - GOAL_TOP);

  // Net.
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= GOAL_DEPTH; i += 11) {
    ctx.moveTo(x + i, GOAL_TOP);
    ctx.lineTo(x + i, GROUND_Y);
  }
  for (let y = GOAL_TOP; y <= GROUND_Y; y += 11) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + GOAL_DEPTH, y);
  }
  ctx.stroke();

  // Crossbar and the post at the mouth.
  ctx.fillStyle = POST;
  ctx.fillRect(x, GOAL_TOP - 6, GOAL_DEPTH, 6);
  const postX = side === "left" ? GOAL_DEPTH - 5 : PITCH_W - GOAL_DEPTH;
  ctx.fillRect(postX, GOAL_TOP - 6, 5, GROUND_Y - GOAL_TOP + 6);
}

/**
 * A goal, celebrated at the end it went in and in the colour of whoever scored
 * — so the moment says who without saying anything. Before this, a goal was
 * only a number changing in the header, which you miss while watching the ball.
 */
function drawGoalMoment(
  ctx: CanvasRenderingContext2D,
  state: State,
  calm: boolean,
): void {
  if (state.resetTicks <= 0 || !state.lastGoal) return;

  // 1 at the instant it goes in, 0 by kickoff.
  const t = state.resetTicks / RESET_TICKS;
  const scoredLeft = state.lastGoal === "player";
  const x = scoredLeft ? 0 : PITCH_W - GOAL_DEPTH;
  const colour = scoredLeft ? PLAYER_HEAD : AI_HEAD;

  ctx.save();

  // The net lights up.
  ctx.globalAlpha = 0.55 * t;
  ctx.fillStyle = colour;
  ctx.fillRect(x, GOAL_TOP, GOAL_DEPTH, GROUND_Y - GOAL_TOP);

  // And a wash across the whole pitch, so it registers even if you are looking
  // at the other end.
  // Kept low: at 0.13 the wash turned the terrace a muddy grey, which read as
  // a rendering fault rather than a celebration.
  ctx.globalAlpha = 0.09 * t;
  ctx.fillRect(0, 0, PITCH_W, PITCH_H);

  if (!calm) {
    const cx = scoredLeft ? GOAL_DEPTH : PITCH_W - GOAL_DEPTH;
    const cy = (GOAL_TOP + GROUND_Y) / 2;
    ctx.globalAlpha = 0.7 * t * t;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, (1 - t) * 190 + 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  b: { x: number; y: number },
  colour: string,
  isPlayer: boolean,
  ring: string | null,
  pulse: boolean,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(b.x, GROUND_Y - 3, HEAD_R * 0.9, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fill();

  if (ring) {
    // This one is yours. Said with a ring, not with a sentence.
    const t = pulse ? 1 + Math.sin(Date.now() / 260) * 0.06 : 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, HEAD_R * 1.16 * t, 0, Math.PI * 2);
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = pulse ? 0.85 : 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.arc(b.x, b.y, HEAD_R, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();

  // A face, so it reads as a head rather than a paddle.
  const facing = isPlayer ? -1 : 1;
  ctx.fillStyle = "#20242b";
  ctx.beginPath();
  ctx.arc(b.x + facing * 11, b.y - 6, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(b.x + facing * 1, b.y - 6, 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(b.x + facing * 7, b.y + 9, 8, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

/**
 * The keys that drive each head, drawn on the terrace beneath it and lighting
 * up as the demo presses them.
 *
 * This is the whole answer to "how do I play" and to "how does anyone find the
 * second player", under a brief that forbids saying either. A sentence is not
 * allowed; a demonstration is the point of attract mode. So the game shows two
 * heads going spare, each wired to keys you can watch working, and the moment
 * you press one of them it is yours.
 *
 * The left head's keys stay up during a one-player match, dimmed. That is the
 * standing invitation for a second person — otherwise nothing would ever
 * suggest the seat is open once the demo has gone.
 */
function drawKeys(
  ctx: CanvasRenderingContext2D,
  state: State,
  l: Layout,
  opts: { attract: boolean; twoPlayer: boolean; demo?: { player: Move; ai: Move } },
): void {
  // Touch has thumb pads on screen already, and no keyboard to describe.
  if (l.touch || opts.twoPlayer) return;

  // The keys ride above their own head rather than sitting at a fixed spot,
  // because the heads now roam the whole pitch: press D and the red keys go
  // right with the red head, which says whose keys they are without a word.
  const demo = opts.attract ? opts.demo : undefined;
  if (opts.attract) {
    keyGroup(ctx, overHead(state.ai), ["A", "D", "W"], demo?.ai, AI_HEAD, 0.95);
    keyGroup(
      ctx,
      overHead(state.player),
      ["\u2190", "\u2192", null],
      demo?.player,
      PLAYER_HEAD,
      0.95,
    );
    return;
  }
  // A standing invitation for the second player, over the head still on offer.
  keyGroup(ctx, overHead(state.ai), ["A", "D", "W"], undefined, AI_HEAD, 0.4);
}

const CAP_W = 34;
const CAP_H = 26;
const CAP_GAP = 7;
/**
 * High in the sky, because a jump reaches 126 units and the terrace does not.
 * Drawn on the terrace first, the keys sat exactly in the arc of the jump they
 * were describing, and a head would come down on top of its own controls.
 */
const CAP_BOTTOM = 100;

/** Keeps a group of keys inside the pitch however far its head wanders. */
const CAP_EDGE = CAP_W + CAP_GAP / 2 + 6;
const overHead = (h: Body): number =>
  Math.min(Math.max(h.x, CAP_EDGE), PITCH_W - CAP_EDGE);

/** Steering below, jump above — the shape of the keys under a hand. */
function keyGroup(
  ctx: CanvasRenderingContext2D,
  cx: number,
  glyphs: [string, string, string | null],
  m: Move | undefined,
  colour: string,
  alpha: number,
): void {
  const topY = CAP_BOTTOM - CAP_H - CAP_GAP;
  const leftX = cx - CAP_W - CAP_GAP / 2;
  cap(ctx, leftX, CAP_BOTTOM, CAP_W, glyphs[0], m?.dx === -1, colour, alpha);
  cap(ctx, cx + CAP_GAP / 2, CAP_BOTTOM, CAP_W, glyphs[1], m?.dx === 1, colour, alpha);

  // A blank cap twice the width is a space bar. Drawing the word would be the
  // one thing the brief rules out.
  const wide = glyphs[2] === null;
  const jumpW = wide ? CAP_W * 2 + CAP_GAP : CAP_W;
  const jumpX = wide ? leftX : cx - CAP_W / 2;
  cap(ctx, jumpX, topY, jumpW, glyphs[2] ?? "", m?.jump === true, colour, alpha);
}

function cap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  glyph: string,
  lit: boolean,
  colour: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(x, y, w, CAP_H, 6);
  ctx.fillStyle = lit ? colour : "rgba(255,255,255,0.08)";
  ctx.fill();
  ctx.strokeStyle = lit ? colour : "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  if (glyph) {
    ctx.fillStyle = lit ? "#101d2c" : "rgba(255,255,255,0.72)";
    ctx.font = `600 ${CAP_H * 0.62}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph, x + w / 2, y + CAP_H / 2 + 1);
  }
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, state: State): void {
  const { ball } = state;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(ball.x, GROUND_Y - 3, BALL_R * 0.8, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fill();

  ctx.translate(ball.x, ball.y);
  ctx.rotate((state.tick * ball.vx) / 90);
  ctx.beginPath();
  ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
  ctx.fillStyle = BALL;
  ctx.fill();

  ctx.fillStyle = BALL_SPOT;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_R * 0.34, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * BALL_R * 0.72, Math.sin(a) * BALL_R * 0.72, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * `m` is what the demo is pressing. Lighting the pads with it is the phone's
 * half of the same lesson the keycaps teach on desktop: this control, that
 * head. Undefined during a real match — a pad lights only under a thumb.
 */
function drawButtons(
  ctx: CanvasRenderingContext2D,
  b: NonNullable<Layout["buttons"]>,
  m: Move | undefined,
): void {
  chevron(ctx, b.left, -1, m?.dx === -1);
  chevron(ctx, b.right, 1, m?.dx === 1);
  pad(ctx, b.jump, m?.jump === true);
}

function face(ctx: CanvasRenderingContext2D, r: Rect, lit = false): void {
  ctx.fillStyle = lit ? PLAYER_HEAD : "rgba(255,255,255,0.14)";
  ctx.strokeStyle = lit ? PLAYER_HEAD : "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(20, r.w * 0.22));
  ctx.fill();
  ctx.stroke();
}

function chevron(ctx: CanvasRenderingContext2D, r: Rect, dir: 1 | -1, lit: boolean): void {
  face(ctx, r, lit);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const s = r.w * 0.2;
  // Dark ink on a lit pad, matching the keycaps: white on yellow washes out.
  ctx.strokeStyle = lit ? "#101d2c" : "rgba(255,255,255,0.92)";
  ctx.lineWidth = Math.max(4, r.w * 0.07);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // The apex points the way the button moves you: arms behind, point ahead.
  ctx.beginPath();
  ctx.moveTo(cx - dir * s * 0.5, cy - s);
  ctx.lineTo(cx + dir * s * 0.5, cy);
  ctx.lineTo(cx - dir * s * 0.5, cy + s);
  ctx.stroke();
}

function pad(ctx: CanvasRenderingContext2D, r: Rect, lit: boolean): void {
  face(ctx, r, lit);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const s = r.w * 0.2;
  ctx.fillStyle = lit ? "#101d2c" : "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s, cy + s * 0.6);
  ctx.lineTo(cx - s, cy + s * 0.6);
  ctx.closePath();
  ctx.fill();
}

function drawEnding(
  ctx: CanvasRenderingContext2D,
  state: State,
  w: number,
  h: number,
): void {
  ctx.fillStyle = "rgba(6,10,16,0.66)";
  ctx.fillRect(0, 0, w, h);

  const size = Math.min(w * 0.16, h * 0.2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px system-ui, sans-serif`;

  // Each number in its own head's colour, so "did I win" needs no reading —
  // which side you were is the one thing a bare scoreline cannot tell you.
  const left = String(state.aiScore);
  const right = String(state.playerScore);
  const dash = "  \u2013  ";
  const total = ctx.measureText(left + dash + right).width;
  let x = w / 2 - total / 2;

  ctx.textAlign = "left";
  ctx.fillStyle = AI_HEAD;
  ctx.fillText(left, x, h / 2);
  x += ctx.measureText(left).width;
  ctx.fillStyle = "rgba(246,247,249,0.6)";
  ctx.fillText(dash, x, h / 2);
  x += ctx.measureText(dash).width;
  ctx.fillStyle = PLAYER_HEAD;
  ctx.fillText(right, x, h / 2);
}
