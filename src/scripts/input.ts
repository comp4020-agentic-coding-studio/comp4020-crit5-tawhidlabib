// Keyboard and touch, collapsed into the one Move the rules understand.
// Knows nothing about the game beyond that shape.

import type { Move } from "./game.ts";
import { hit, type Layout } from "./render.ts";

export type Input = {
  /** The move to apply this tick. */
  move(): Move;
  /** True once any input has been seen — the attract-mode handover. */
  touched(): boolean;
  clearTouched(): void;
  /** Whether this device wants on-screen buttons drawn. */
  isTouch(): boolean;
  setLayout(l: Layout): void;
  dispose(): void;
};

export function attachInput(canvas: HTMLCanvasElement): Input {
  const keys = new Set<string>();
  const pointers = new Map<number, "left" | "right" | "jump">();
  let layout: Layout | null = null;
  let seen = false;
  let coarse =
    window.matchMedia?.("(pointer: coarse)").matches ||
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === " ") {
      e.preventDefault();
    }
    keys.add(e.key);
    seen = true;
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key);

  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: PointerEvent) => {
    seen = true;
    // A touch anywhere means this device is touched, even if the media query
    // lied — start drawing the buttons.
    if (e.pointerType === "touch" || e.pointerType === "pen") coarse = true;
    if (!layout?.buttons) return;
    const p = at(e);
    const b = layout.buttons;
    const which = hit(b.left, p.x, p.y)
      ? "left"
      : hit(b.right, p.x, p.y)
        ? "right"
        : hit(b.jump, p.x, p.y)
          ? "jump"
          : null;
    if (which) {
      pointers.set(e.pointerId, which);
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };

  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  const held = new Set<"left" | "right" | "jump">();

  return {
    move(): Move {
      held.clear();
      for (const v of pointers.values()) held.add(v);

      const left = keys.has("ArrowLeft") || held.has("left");
      const right = keys.has("ArrowRight") || held.has("right");
      const jump = keys.has(" ") || keys.has("ArrowUp") || held.has("jump");

      const dx: -1 | 0 | 1 = left === right ? 0 : left ? -1 : 1;
      return { dx, jump };
    },
    touched: () => seen,
    clearTouched: () => {
      seen = false;
    },
    isTouch: () => coarse,
    setLayout: (l: Layout) => {
      layout = l;
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", release);
      canvas.removeEventListener("pointercancel", release);
    },
  };
}
