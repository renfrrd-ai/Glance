"use client";

/*
 * The cursor that walks the board.
 *
 * It chases its target on its own animation frame with a spring rather than
 * jumping or using a CSS transition, because it is often chasing a target that
 * is itself moving — the board flies while the cursor is already on its way to
 * a block, and a transition would land it in the wrong place.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

import { NibGlyph, expressionFor, type Expression } from "@/components/art/buddy-face";
import type { Point } from "@/lib/board/events";

export type CursorMode = "hidden" | "placing" | "thinking" | "pointing" | "typing";

export type CursorTarget = Point & {
  /** In board coordinates, so `toScreen` has to be applied. */
  world?: boolean;
  /** Nudges, in screen pixels, applied after converting. */
  dx?: number;
  dy?: number;
  label?: string;
};

/** A sticky note, and the card the cursor says things in. */
export function Note({ children, tone = "idle" }: { children?: ReactNode; tone?: string }) {
  return (
    <div className="ck-note-card" data-tone={tone}>
      {children}
    </div>
  );
}

export function Cursor({
  target,
  mode = "placing",
  reduced = false,
  origin,
  says,
  toScreen,
  expression,
  performing = false,
}: {
  target?: CursorTarget | null;
  mode?: CursorMode;
  /** Skip the spring, for anyone who asked for less motion. */
  reduced?: boolean;
  /** Where it drifts while thinking. */
  origin?: Point;
  says?: ReactNode;
  toScreen?: (at: CursorTarget) => Point;
  expression?: Expression;
  /** Doing something, rather than pointing at it. */
  performing?: boolean;
}) {
  const nib = useRef<HTMLDivElement>(null);
  const at = useRef<Point | null>(null);
  const velocity = useRef<Point>({ x: 0, y: 0 });
  const want = useRef<CursorTarget | null>(null);
  const [shown, setShown] = useState(false);

  /* The chase: one frame loop for the life of the cursor. */
  useEffect(() => {
    let raf = 0;

    const step = () => {
      raf = requestAnimationFrame(step);

      const goal = want.current;
      if (!goal) return;

      const screen = goal.world && toScreen ? toScreen(goal) : goal;
      const to = { x: screen.x + (goal.dx ?? 0), y: screen.y + (goal.dy ?? 0) };

      const now = at.current;
      if (!now || reduced) {
        at.current = { ...to };
        velocity.current = { x: 0, y: 0 };
      } else {
        /* Critically-ish damped: pulled 0.17 of the way, damped to 0.76. */
        velocity.current = {
          x: (velocity.current.x + (to.x - now.x) * 0.17) * 0.76,
          y: (velocity.current.y + (to.y - now.y) * 0.17) * 0.76,
        };
        at.current = { x: now.x + velocity.current.x, y: now.y + velocity.current.y };
      }

      const element = nib.current;
      if (element)
        element.style.transform = `translate(${at.current.x}px, ${at.current.y}px)`;
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced, toScreen]);

  useEffect(() => {
    if (mode === "hidden") {
      want.current = null;
      return;
    }

    /* Thinking: drift in a slow figure around where it was left, so it reads
     * as waiting rather than as frozen. */
    if (mode === "thinking") {
      const home = origin ?? { x: 0, y: 0 };
      if (reduced) {
        want.current = home;
        return;
      }

      const start = performance.now();
      let raf = 0;
      const drift = (now: number) => {
        const t = (now - start) / 1000;
        want.current = {
          x: home.x + 26 * Math.sin(0.9 * t),
          y: home.y + 18 * Math.sin(0.55 * t),
        };
        raf = requestAnimationFrame(drift);
      };
      raf = requestAnimationFrame(drift);
      return () => cancelAnimationFrame(raf);
    }

    if (target) want.current = { x: target.x, y: target.y, world: true, dx: target.dx, dy: target.dy };
  }, [mode, reduced, origin, target?.x, target?.y, target]);

  /* A tick late, so the cursor fades in where it is rather than from 0,0. */
  useEffect(() => {
    const soon = window.setTimeout(() => setShown(mode !== "hidden"), 0);
    return () => window.clearTimeout(soon);
  }, [mode]);

  if (mode === "hidden" || !shown) return null;

  const label = mode === "thinking" ? "thinking" : target?.label;

  return (
    <div
      className="ck-cursor"
      data-mode={mode}
      data-performing={performing || undefined}
      ref={nib}
      aria-hidden="true"
    >
      <span className="ck-nib-wrap">
        <NibGlyph expression={expression ?? expressionFor(mode === "thinking" ? "thinking" : "placing")} />
      </span>
      {says ? (
        <div className="ck-cursor-note">
          <Note tone={mode === "thinking" ? "thinking" : "idle"}>{says}</Note>
        </div>
      ) : label ? (
        <span className="ck-cursor-label" key={label}>
          {label}
        </span>
      ) : null}
    </div>
  );
}
