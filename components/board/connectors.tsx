"use client";

/*
 * The arrows between blocks.
 *
 * Every edge is drawn twice over: a filled chalk outline, and a thin mask that
 * sweeps along the same centre line to wipe it on. Hovering or focusing a
 * block lights the edges that touch it, which is done with data attributes and
 * pointer events on the parent rather than React state — the board can hold a
 * lot of edges, and lighting one should not re-render any of them.
 */

import { useEffect, useId, useRef } from "react";

import type { Point } from "@/lib/board/events";
import { strokeCentreline, strokePath } from "@/lib/board/strokes";

export type Edge = {
  from: string;
  to: string;
  points: Point[];
  label?: string;
  /** "map" edges are the thick ones between sections. */
  kind?: "map" | string;
  labelAt?: { x: number; y: number; anchor: "start" | "middle" | "end" };
};

/** Where a label sits: on the longest leg, outside the line. */
function labelFor(points: Point[]) {
  const [first, second] = points;
  const last = points[points.length - 1];

  /* A level line gets its label centred above or below it. */
  if (
    points.length >= 2 &&
    first.y === second.y &&
    first.x !== second.x &&
    (points.length === 2 || points.length === 4)
  )
    return {
      x: points.length === 2 ? (first.x + last.x) / 2 : second.x,
      y: last.y > first.y ? first.y - 11 : first.y + 13,
      anchor: "middle" as const,
    };

  /* Keep the label off the arrowhead by shortening the final leg. */
  const leg = (i: number): [Point, Point] => {
    const from = points[i];
    const to = points[i + 1];
    if (i === points.length - 2 && from.x === to.x && to.y > from.y)
      return [from, { x: to.x, y: to.y - Math.min(28, (to.y - from.y) / 2) }];
    return [from, to];
  };

  let longest = 0;
  let best = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const [from, to] = leg(i);
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > best) {
      best = length;
      longest = i;
    }
  }

  const [from, to] = leg(longest);
  const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);

  return {
    x: (from.x + to.x) / 2 + (horizontal ? 0 : 9),
    y: (from.y + to.y) / 2 + (horizontal ? 13 : 0),
    anchor: horizontal ? ("middle" as const) : ("start" as const),
  };
}

export function Connectors({
  edges,
  width,
  height,
  animate = true,
  startDelay,
}: {
  edges: Edge[];
  width: number;
  height: number;
  animate?: boolean;
  /** When the first edge starts drawing, in ms. */
  startDelay?: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");

  useEffect(() => {
    const element = svg.current;
    const board = element?.parentElement;
    if (!element || !board) return;

    let hovered: string | null = null;
    let focused: string | null = null;

    const light = () => {
      const near = focused ?? hovered;
      if (near !== null) element.dataset.near = near;
      else delete element.dataset.near;

      for (const edge of element.querySelectorAll<SVGGElement>("g[data-from]")) {
        if (near !== null && (edge.dataset.from === near || edge.dataset.to === near))
          edge.dataset.lit = "";
        else delete edge.dataset.lit;
      }
    };

    const blockOf = (target: EventTarget | null) =>
      target instanceof Element
        ? (target.closest("[data-block]")?.getAttribute("data-block") ?? null)
        : null;

    const over = (event: PointerEvent) => {
      hovered = blockOf(event.target);
      light();
    };
    const out = () => {
      hovered = null;
      light();
    };
    const focusIn = (event: FocusEvent) => {
      focused = blockOf(event.target);
      light();
    };
    const focusOut = (event: FocusEvent) => {
      focused = blockOf(event.relatedTarget);
      light();
    };

    board.addEventListener("pointerover", over);
    board.addEventListener("pointerleave", out);
    board.addEventListener("focusin", focusIn);
    board.addEventListener("focusout", focusOut);

    return () => {
      board.removeEventListener("pointerover", over);
      board.removeEventListener("pointerleave", out);
      board.removeEventListener("focusin", focusIn);
      board.removeEventListener("focusout", focusOut);
    };
  }, []);

  return (
    <svg className="ck-edges" ref={svg} width={width} height={height} aria-hidden="true">
      {edges.map((edge, i) => {
        if (edge.points.length < 2) return null;

        const seed = `${edge.from}->${edge.to}`;
        const map = edge.kind === "map";
        const head = map ? 21.6 : 9;
        const path = strokePath(edge.points, { seed, size: map ? 7 : 3 });
        if (!path) return null;

        const before = edge.points[edge.points.length - 2];
        const end = edge.points[edge.points.length - 1];
        const angle = (180 * Math.atan2(end.y - before.y, end.x - before.x)) / Math.PI;

        const at = edge.labelAt ?? labelFor(edge.points);
        const delay = startDelay ?? 160;
        const mask = `ck-wipe-${uid}-${seed.replace(/[^A-Za-z0-9_-]/g, "")}-${edge.label ?? ""}`.replace(
          /[^A-Za-z0-9_-]/g,
          "",
        );
        /* The head and the label arrive once the line has been drawn. */
        const late = animate ? { animationDelay: `${delay + 640}ms` } : undefined;

        return (
          <g
            className={map ? "ck-edge ck-edge--map" : "ck-edge"}
            data-from={edge.from}
            data-to={edge.to}
            key={`${seed}#${edge.label ?? i}`}
          >
            {animate ? (
              <mask id={mask} x="-25%" y="-25%" width="150%" height="150%">
                <path
                  className="ck-edge-wipe"
                  d={strokeCentreline(edge.points, { seed, overhang: 7 })}
                  pathLength={1}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={14}
                  strokeLinecap="butt"
                  strokeLinejoin="round"
                  style={{ animationDuration: "640ms", animationDelay: `${delay}ms` }}
                />
              </mask>
            ) : null}

            <path d={path} fill="var(--o-ink-2, #3C4149)" mask={animate ? `url(#${mask})` : undefined} />

            <polygon
              className={animate ? "ck-edge-late" : undefined}
              style={late}
              points={`0,-${head / 2.2} ${head},0 0,${head / 2.2}`}
              fill="var(--o-ink-2, #3C4149)"
              transform={`translate(${end.x} ${end.y}) rotate(${angle})`}
            />

            {edge.label ? (
              <text
                x={at.x}
                y={at.y}
                textAnchor={at.anchor}
                dominantBaseline="middle"
                className={animate ? "ck-edge-label ck-edge-late" : "ck-edge-label"}
                style={late}
              >
                {edge.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
