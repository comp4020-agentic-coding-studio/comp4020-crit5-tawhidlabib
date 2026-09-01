// The loop. Wires input -> rules -> drawing, and owns the one thing that
// carries the whole no-tutorial rule: the attract-mode demo.
//
// Nothing on this page says how to play. The game plays itself until somebody
// touches something, and then it hands them the head with the ring around it.

import {
  aiMove,
  clock,
  initial,
  isOver,
  step,
  TICK_HZ,
  type Move,
  type State,
} from "./game.ts";
import { attachInput } from "./input.ts";
import { draw, layout, type Layout } from "./render.ts";

const STEP_MS = 1000 / TICK_HZ;
/** How long the final score sits on screen before the demo takes back over. */
const ENDING_MS = 5200;
/** Ignore input briefly after full time, so nobody skips the result by mashing. */
const ENDING_LOCK_MS = 1400;

type Mode = "attract" | "playing" | "ended";

function boot(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#pitch");
  const leftEl = document.querySelector<HTMLElement>("#score-left");
  const rightEl = document.querySelector<HTMLElement>("#score-right");
  const clockEl = document.querySelector<HTMLElement>("#clock");
  if (!canvas || !leftEl || !rightEl || !clockEl) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const input = attachInput(canvas);

  let state: State = initial();
  let mode: Mode = "attract";
  let endedAt = 0;
  let l: Layout = layout(1, 1, false);

  /**
   * Whether a second person has taken the left head. Nobody chooses this from
   * a menu — pressing WASD is the choosing, at any point, mid-match included.
   * The AI simply stops being asked.
   */
  let twoPlayer = false;
  /** What the demo is pressing, so the keys on screen can show it. */
  let demo: { player: Move; ai: Move } | undefined;

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas!.clientWidth;
    const h = canvas!.clientHeight;
    canvas!.width = Math.round(w * dpr);
    canvas!.height = Math.round(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    l = layout(w, h, input.isTouch());
    input.setLayout(l);
  }

  new ResizeObserver(resize).observe(canvas);
  resize();

  function hud(): void {
    leftEl!.textContent = String(state.aiScore);
    rightEl!.textContent = String(state.playerScore);
    const s = clock(state);
    clockEl!.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  let last = performance.now();
  let acc = 0;

  function frame(now: number): void {
    acc += Math.min(now - last, 250);
    last = now;

    while (acc >= STEP_MS) {
      acc -= STEP_MS;
      tick(now);
    }

    // The layout depends on whether this device has revealed itself as touch,
    // which can happen on the first tap rather than up front.
    if (l.touch !== input.isTouch()) resize();

    draw(ctx!, state, l, {
      attract: mode === "attract",
      ended: mode === "ended",
      calm,
      twoPlayer,
      demo,
    });
    hud();
    requestAnimationFrame(frame);
  }

  function tick(now: number): void {
    if (mode === "attract") {
      if (input.touched()) {
        // Somebody pressed something. That is the entire tutorial. Which keys
        // they pressed decides whether the left head has a person on it.
        input.clearTouched();
        twoPlayer = input.joined();
        state = initial();
        mode = "playing";
        return;
      }
      if (isOver(state)) {
        state = initial();
        return;
      }
      // Both moves computed here rather than letting step find the second one,
      // so the keys on screen light up with exactly what the demo is doing.
      // step() would derive the same move from the same state.
      demo = { player: aiMove(state, "player"), ai: aiMove(state, "ai") };
      state = step(state, demo.player);
      return;
    }

    if (mode === "playing") {
      // Joining mid-match is allowed and needs no ceremony: the AI hands the
      // head over between one tick and the next.
      if (input.joined()) twoPlayer = true;
      state = step(state, input.move(), twoPlayer ? input.move2() : undefined);
      if (isOver(state)) {
        mode = "ended";
        endedAt = now;
      }
      return;
    }

    // ended
    const waited = now - endedAt;
    if (waited > ENDING_LOCK_MS && input.touched()) {
      input.clearTouched();
      state = initial();
      mode = "playing";
      return;
    }
    if (waited > ENDING_MS) {
      // Back to the demo, and back to one player: whoever was here has gone.
      input.clearTouched();
      input.forgetJoined();
      twoPlayer = false;
      state = initial();
      mode = "attract";
    }
  }

  requestAnimationFrame(frame);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
