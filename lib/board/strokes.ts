/*
 * Chalk strokes.
 *
 * Every line on the board — a connector, a pen mark, an underline — is drawn
 * as a filled outline rather than a stroked path, so it can be thick in the
 * middle and taper at the ends the way a real stroke does. perfect-freehand
 * does the outlining; what is here is the wobble that keeps a straight line
 * from looking printed, and the timing a line is drawn over.
 */

import { getStroke } from "perfect-freehand";

import type { Point } from "./events";

/**
 * A deterministic random stream.
 *
 * Seeded by the stroke's own id, so a line wobbles the same way on every
 * render and after a reload — a line that re-wobbles each frame reads as a
 * glitch, not as handwriting.
 */
function noise(seed: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193);
  hash = hash >>> 0 || 1;
  return () => {
    hash = (Math.imul(hash, 48271) % 0x7fffffff) >>> 0;
    return hash / 0x7fffffff;
  };
}

/** Break a polyline into small steps and push each one off the line a little. */
function wobble(points: Point[], seed: string, amount: number): Point[] {
  if (amount <= 0) return [...points];

  const random = noise(seed);
  const out: Point[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const steps = Math.max(2, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 14));

    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      /* Most drift in the middle of a segment, none at either end, so the
       * joins between segments stay put. */
      const drift = 1.15 * amount * Math.sin(t * Math.PI);
      out.push({
        x: from.x + (to.x - from.x) * t + (random() - 0.5) * drift,
        y: from.y + (to.y - from.y) * t + (random() - 0.5) * drift,
      });
    }
  }

  out.push(points[points.length - 1]);
  return out;
}

/** Push `to` further along the line from `from`, for an overshooting end. */
function overshoot(from: Point, to: Point, by: number): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: to.x + ((to.x - from.x) / length) * by, y: to.y + ((to.y - from.y) / length) * by };
}

/** How long a line of `n` parts takes to draw, and how much each one lags. */
export function buildTiming(n: number) {
  const parts = Math.max(n, 1);
  const duration = parts < 15 ? 1000 : 2000;
  const lagRatio = Math.min(4 / parts, 0.2);
  return { duration, lagRatio, lagMs: lagRatio * duration };
}

/**
 * The centre line of a stroke, as a plain path.
 *
 * Used as the mask that wipes a line on: the mask only needs the path, and a
 * thin line masks far more cheaply than the filled outline would.
 */
export function strokeCentreline(
  points: Point[],
  options: { seed: string; roughness?: number; overhang?: number },
) {
  if (points.length < 2) return "";

  const wobbled = wobble(points, options.seed, (options.roughness ?? 1) * 1.6);
  const over = options.overhang ?? 0;

  if (over > 0 && wobbled.length >= 2) {
    wobbled[0] = overshoot(wobbled[1], wobbled[0], over);
    wobbled[wobbled.length - 1] = overshoot(
      wobbled[wobbled.length - 2],
      wobbled[wobbled.length - 1],
      over,
    );
  }

  return `M ${wobbled.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" L ")}`;
}

/** A stroke as a filled outline: thick in the middle, tapered at both ends. */
export function strokePath(
  points: Point[],
  options: { seed: string; size?: number; roughness?: number; progress?: number },
) {
  if (points.length < 2) return "";

  const roughness = options.roughness ?? 1;
  const progress = Math.max(0, Math.min(1, options.progress ?? 1));

  let line = wobble(points, options.seed, 1.6 * roughness);
  if (progress < 1) line = line.slice(0, Math.max(2, Math.round(line.length * progress)));

  const outline = getStroke(
    line.map((point) => [point.x, point.y]),
    {
      size: options.size ?? 3.2,
      thinning: 0.55,
      smoothing: 0.62,
      streamline: 0.42,
      start: { taper: 14, cap: true },
      end: { taper: 22, cap: true },
      simulatePressure: true,
    },
  );

  if (outline.length === 0) return "";

  /* Round the outline off through the midpoint of each pair, which is cheaper
   * than fitting curves and reads the same at stroke width. */
  return (
    outline
      .reduce(
        (path, [x, y], i, all) => {
          const [nx, ny] = all[(i + 1) % all.length];
          path.push(x.toFixed(2), y.toFixed(2), ((x + nx) / 2).toFixed(2), ((y + ny) / 2).toFixed(2));
          return path;
        },
        ["M", String(outline[0][0].toFixed(2)), String(outline[0][1].toFixed(2)), "Q"],
      )
      .join(" ") + " Z"
  );
}
