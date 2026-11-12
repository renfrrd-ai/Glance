/*
 * Where a connector goes.
 *
 * Edges leave and arrive on a block's "rule line" — a fixed distance below its
 * top, where a heading's underline sits — rather than at its centre, so a row
 * of connected blocks has its arrows on one level instead of stepping up and
 * down with each block's height.
 *
 * `routeBetween` draws the obvious line. `routeAround` takes that line, checks
 * it against the other blocks, and tries a handful of detours if it crosses
 * one — so an edge goes round a block rather than through it.
 */

import type { Point, Rect } from "./events";

/** How far below a block's top the rule line sits. */
export const RULE_OFFSET = 28;

type Side = "rule-left" | "rule-right" | "rule-center" | "top" | "bottom";

function anchor(rect: Rect, side: Side): Point {
  const rule = Math.round(rect.y + RULE_OFFSET);
  switch (side) {
    case "rule-left":
      return { x: Math.round(rect.x), y: rule };
    case "rule-right":
      return { x: Math.round(rect.x + rect.w), y: rule };
    case "rule-center":
      return { x: Math.round(rect.x + rect.w / 2), y: rule };
    case "top":
      return { x: Math.round(rect.x + rect.w / 2), y: Math.round(rect.y) };
    case "bottom":
      return { x: Math.round(rect.x + rect.w / 2), y: Math.round(rect.y + rect.h) };
  }
}

/** The straightforward route from one block to another. */
export function routeBetween(from: Rect, to: Rect): Point[] {
  const gapX = Math.max(to.x - (from.x + from.w), from.x - (to.x + to.w));
  const gapY = Math.max(to.y - (from.y + from.h), from.y - (to.y + to.h));

  /* Side to side when they are beside each other, or when they overlap but
   * lie more horizontally than vertically. */
  const sideways =
    gapX > 0 || gapY > 0
      ? gapX > 0 && (gapY <= 0 || gapX >= gapY)
      : Math.abs(to.x - from.x) > Math.abs(to.y - from.y);

  if (sideways) {
    const rightwards = to.x > from.x;
    const start = anchor(from, rightwards ? "rule-right" : "rule-left");
    const end = anchor(to, rightwards ? "rule-left" : "rule-right");
    if (start.y === end.y) return [start, end];

    const mid = Math.round((start.x + end.x) / 2);
    return [start, { x: mid, y: start.y }, { x: mid, y: end.y }, end];
  }

  /* Upwards: out of the top, into the bottom. */
  if (to.y + to.h <= from.y) {
    const start = anchor(from, "top");
    const end = anchor(to, "bottom");
    if (start.x === end.x) return [start, end];

    const mid = Math.round((start.y + end.y) / 2);
    return [start, { x: start.x, y: mid }, { x: end.x, y: mid }, end];
  }

  /* Downwards: out of the bottom, into the rule line. */
  const start = anchor(from, "bottom");
  const end = anchor(to, "rule-center");
  if (start.x === end.x) return [start, end];

  const mid = Math.round((start.y + Math.max(start.y, to.y)) / 2);
  return [start, { x: start.x, y: mid }, { x: end.x, y: mid }, end];
}

/** Whether a route passes through a rect, with a little slack at its edges. */
function crosses(route: Point[], rect: Rect) {
  const left = rect.x + 3;
  const right = rect.x + rect.w - 3;
  const top = rect.y + 3;
  const bottom = rect.y + rect.h - 3;

  for (let i = 0; i < route.length - 1; i++) {
    const from = route[i];
    const to = route[i + 1];
    const x0 = Math.min(from.x, to.x);
    const x1 = Math.max(from.x, to.x);
    const y0 = Math.min(from.y, to.y);
    const y1 = Math.max(from.y, to.y);
    if (x1 > left && x0 < right && y1 > top && y0 < bottom) return true;
  }
  return false;
}

/**
 * A route from `from` to `to` that misses everything in `blocked`.
 *
 * Tries, in order: the straight route; a level line through the gap between
 * them; around by the rule line; under everything in the way; over the top —
 * and falls back to the straight route if every detour is also blocked, since
 * a crossing line is better than no line.
 *
 * `ceiling` stops the over-the-top route from leaving the section it belongs to.
 */
export function routeAround(
  from: Rect,
  to: Rect,
  blocked: Rect[],
  ceiling = -Infinity,
): Point[] {
  const direct = routeBetween(from, to);
  const clear = (route: Point[]) => !blocked.some((rect) => crosses(route, rect));
  if (clear(direct)) return direct;

  const tries: Point[][] = [];
  const fromMid = Math.round(from.x + from.w / 2);
  const toMid = Math.round(to.x + to.w / 2);
  const rightwards = to.x >= from.x + from.w;
  const leftwards = to.x + to.w <= from.x;

  /* They share some height: go straight across the gap, at a level that is
   * inside both of them. */
  const shareTop = Math.max(from.y, to.y);
  const shareBottom = Math.min(from.y + from.h, to.y + to.h);
  if ((rightwards || leftwards) && shareBottom - shareTop >= 24) {
    const level = Math.round(
      Math.min(Math.max(from.y + RULE_OFFSET, shareTop + 12), shareBottom - 12),
    );
    const startX = Math.round(rightwards ? from.x + from.w : from.x);
    const endX = Math.round(rightwards ? to.x : to.x + to.w);
    tries.push([
      { x: startX, y: level },
      { x: endX, y: level },
    ]);
  }

  if (rightwards || leftwards) {
    const sideX = Math.round(rightwards ? from.x + from.w : from.x);
    const rule = Math.round(from.y + RULE_OFFSET);

    /* Out sideways on the rule line, then down or up into the target. */
    if (to.y + to.h <= rule)
      tries.push([
        { x: sideX, y: rule },
        { x: toMid, y: rule },
        { x: toMid, y: Math.round(to.y + to.h) },
      ]);
    if (to.y >= rule)
      tries.push([
        { x: sideX, y: rule },
        { x: toMid, y: rule },
        { x: toMid, y: Math.round(to.y + RULE_OFFSET) },
      ]);

    /* Or down out of the bottom and in along the target's rule line. */
    const targetRule = Math.round(to.y + RULE_OFFSET);
    const targetSide = Math.round(rightwards ? to.x : to.x + to.w);
    if (targetRule >= from.y + from.h)
      tries.push([
        { x: fromMid, y: Math.round(from.y + from.h) },
        { x: fromMid, y: targetRule },
        { x: targetSide, y: targetRule },
      ]);
    if (targetRule <= from.y)
      tries.push([
        { x: fromMid, y: Math.round(from.y) },
        { x: fromMid, y: targetRule },
        { x: targetSide, y: targetRule },
      ]);
  }

  /* Under, then over: clear of everything that overlaps the span between them. */
  const span = [from.x, from.x + from.w, to.x, to.x + to.w];
  const left = Math.min(...span);
  const right = Math.max(...span);
  const inTheWay = blocked.filter((rect) => rect.x < right && rect.x + rect.w > left);

  const under = Math.round(
    Math.max(from.y + from.h, to.y + to.h, ...inTheWay.map((rect) => rect.y + rect.h)) + 26,
  );
  const bottomOut = anchor(from, "bottom");
  const bottomIn = anchor(to, "bottom");
  tries.push([
    bottomOut,
    { x: bottomOut.x, y: under },
    { x: bottomIn.x, y: under },
    bottomIn,
  ]);

  const over = Math.round(Math.min(from.y, to.y, ...inTheWay.map((rect) => rect.y)) - 26);
  if (over >= ceiling)
    tries.push([
      anchor(from, "top"),
      { x: bottomOut.x, y: over },
      { x: bottomIn.x, y: over },
      anchor(to, "top"),
    ]);

  return tries.find((route) => clear(route)) ?? direct;
}
