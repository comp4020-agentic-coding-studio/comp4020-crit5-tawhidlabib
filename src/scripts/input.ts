// Keyboard and touch, collapsed into the one Move the rules understand.
// Knows nothing about the game beyond that shape.

import type { Move } from "./game.ts";
import { hit, type Layout } from "./render.ts";

export type Input = {
  /** The move to apply this tick. Arrow keys, or the on-screen pads. */
  move(): Move;
  /** The second player's move. WASD only — there is one keyboard. */
  move2(): Move;
  /**
   * True once WASD has been touched. That press *is* joining: there is no menu
   * and no button, because either would have to be labelled, and the brief
   * forbids the label. Attract mode shows both sets of keys working instead.
   */
  joined(): boolean;
  forgetJoined(): void;
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
  let joined = false;
  let coarse =
    window.matchMedia?.("(pointer: coarse)").matches ||
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0;

  // Shift or caps lock would otherwise make "W" a different key from "w".
  const key = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === " ") {
      e.preventDefault();
    }
    const k = key(e);
    keys.add(k);
    if (k === "a" || k === "d" || k === "w") joined = true;
    seen = true;
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(key(e));

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

  /** Both held is the same as neither, so a head never twitches. */
  const axis = (left: boolean, right: boolean): -1 | 0 | 1 =>
    left === right ? 0 : left ? -1 : 1;

  return {
    move(): Move {
      held.clear();
      for (const v of pointers.values()) held.add(v);

      const left = keys.has("ArrowLeft") || held.has("left");
      const right = keys.has("ArrowRight") || held.has("right");
      const jump = keys.has(" ") || keys.has("ArrowUp") || held.has("jump");

      return { dx: axis(left, right), jump };
    },
    move2(): Move {
      return { dx: axis(keys.has("a"), keys.has("d")), jump: keys.has("w") };
    },
    joined: () => joined,
    forgetJoined: () => {
      joined = false;
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
