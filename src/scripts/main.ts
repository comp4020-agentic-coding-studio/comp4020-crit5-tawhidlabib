// The loop. Wires input -> rules -> drawing, and owns the one thing that
// carries the whole no-tutorial rule: the attract-mode demo.
//
// Nothing on this page says how to play. The game plays itself until somebody
// touches something, and then it hands them the head with the ring around it.

import { aiMove, clock, initial, isOver, step, TICK_HZ, type State } from "./game.ts";
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
  const scoreEl = document.querySelector<HTMLElement>("#score");
  const clockEl = document.querySelector<HTMLElement>("#clock");
  if (!canvas || !scoreEl || !clockEl) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const input = attachInput(canvas);

  let state: State = initial();
  let mode: Mode = "attract";
  let endedAt = 0;
  let l: Layout = layout(1, 1, false);

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
    scoreEl!.textContent = `${state.aiScore} – ${state.playerScore}`;
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
    });
    hud();
    requestAnimationFrame(frame);
  }

  function tick(now: number): void {
    if (mode === "attract") {
      if (input.touched()) {
        // Somebody pressed something. That is the entire tutorial.
        input.clearTouched();
        state = initial();
        mode = "playing";
        return;
      }
      state = isOver(state) ? initial() : step(state, aiMove(state, "player"));
      return;
    }

    if (mode === "playing") {
      state = step(state, input.move());
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
      input.clearTouched();
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
