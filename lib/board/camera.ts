/*
 * The board's camera.
 *
 * A camera is where the board is being looked at from: `x`/`y` in board
 * coordinates and `z` as the zoom. Everything here is pure, so the same maths
 * drives a pointer drag, a pinch, a wheel and a flight between two points —
 * and can be reasoned about without a canvas.
 */

import type { Point, Rect } from "./events";

export type Camera = { x: number; y: number; z: number };

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, z: 1 };

/** How long a flight across the board takes. */
export const FLIGHT_MS = 700;

const clampZoom = (z: number) => Math.min(8, Math.max(0.05, z));
const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

/** What the world element is transformed by. */
export const cssTransform = (camera: Camera) =>
  `scale(${camera.z}) translate(${-camera.x}px, ${-camera.y}px)`;

/** Zoom about a point on screen, keeping what is under it under it. */
export function zoomAt(camera: Camera, at: Point, by: number): Camera {
  const z = clampZoom(camera.z * by);
  if (z === camera.z) return camera;

  const world = { x: at.x / camera.z + camera.x, y: at.y / camera.z + camera.y };
  return { x: world.x - at.x / z, y: world.y - at.y / z, z };
}

/** Pan by a distance in screen pixels. */
export const panBy = (camera: Camera, dx: number, dy: number): Camera => ({
  x: camera.x - dx / camera.z,
  y: camera.y - dy / camera.z,
  z: camera.z,
});

export type Viewport = { w: number; h: number };

/** A camera that fits `rect` into `viewport`, with `padding` screen pixels spare. */
export function fitTo(
  rect: Rect,
  viewport: Viewport,
  padding = 64,
  maxZoom = 1,
  minZoom = 0.05,
): Camera {
  const box = {
    x: finite(rect.x, 0),
    y: finite(rect.y, 0),
    w: Math.max(0, finite(rect.w, 0)),
    h: Math.max(0, finite(rect.h, 0)),
  };

  const vw = Math.max(1, finite(viewport.w, 1));
  const vh = Math.max(1, finite(viewport.h, 1));
  const pad = Math.max(0, finite(padding, 0));
  const inner = { w: Math.max(1, vw - 2 * pad), h: Math.max(1, vh - 2 * pad) };

  const top = clampZoom(finite(maxZoom, 1));
  const floor = Math.min(top, clampZoom(finite(minZoom, 0.05)));
  const z = Math.min(
    top,
    Math.max(floor, Math.min(inner.w / Math.max(box.w, 1), inner.h / Math.max(box.h, 1))),
  );

  return { x: box.x + box.w / 2 - vw / 2 / z, y: box.y + box.h / 2 - vh / 2 / z, z };
}

/** The padding that leaves a rect filling `fill` of the smaller viewport side. */
const paddingFor = (viewport: Viewport, fill = 0.62) =>
  (Math.max(1, Math.min(finite(viewport.w, 1), finite(viewport.h, 1))) *
    (1 - Math.min(1, Math.max(0.05, finite(fill, 0.62))))) /
  2;

/** Fit a rect the way a camera frames a subject, rather than to the edges. */
export function frameRect(
  rect: Rect,
  viewport: Viewport,
  options: { padding?: number; fill?: number; maxZoom?: number; minZoom?: number } = {},
): Camera {
  const padding = options.padding ?? paddingFor(viewport, options.fill);
  return fitTo(rect, viewport, padding, options.maxZoom ?? 1.6, options.minZoom ?? 0.05);
}

export function easeInOut(t: number) {
  const at = Math.min(1, Math.max(0, finite(t, 0)));
  return at < 0.5 ? 4 * at * at * at : 1 - Math.pow(-2 * at + 2, 3) / 2;
}

/**
 * A camera `t` of the way from `from` to `to`.
 *
 * Zoom moves geometrically and the centre moves in *inverse* zoom, which is
 * what keeps a long flight from swooping out and back: interpolating x and y
 * linearly while z changes would send the viewport the long way round.
 */
export function lerpCamera(from: Camera, to: Camera, t: number, viewport: Viewport): Camera {
  if (!(t > 0)) return from;
  if (t >= 1) return to;

  const vw = Math.max(1, finite(viewport.w, 1));
  const vh = Math.max(1, finite(viewport.h, 1));

  const z0 = clampZoom(finite(from.z, 1));
  const z1 = clampZoom(finite(to.z, 1));
  const z = clampZoom(z0 * Math.pow(z1 / z0, t));

  const inv0 = 1 / z0;
  const inv1 = 1 / z1;
  const at = Math.abs(inv0 - inv1) < 1e-9 ? t : (inv0 - 1 / z) / (inv0 - inv1);

  const cx = from.x + vw / 2 / z0;
  const cy = from.y + vh / 2 / z0;

  return {
    x: cx + (to.x + vw / 2 / z1 - cx) * at - vw / 2 / z,
    y: cy + (to.y + vh / 2 / z1 - cy) * at - vh / 2 / z,
    z,
  };
}

export type WheelIntent =
  | { kind: "zoom"; factor: number; at: Point }
  | { kind: "pan"; dx: number; dy: number };

/** What a wheel event means: a trackpad pinch arrives as ctrl + wheel. */
export function wheelIntent(event: WheelEvent): WheelIntent {
  const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
  const dy = event.deltaY * lines;

  if (event.ctrlKey || event.metaKey)
    return {
      kind: "zoom",
      factor: Math.exp(-(0.01 * Math.max(-40, Math.min(40, dy)))),
      at: { x: event.clientX, y: event.clientY },
    };

  return { kind: "pan", dx: -event.deltaX * lines, dy: -dy };
}

/** The box around a set of rects. */
export function boundsOf(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return {
    x,
    y,
    w: Math.max(...rects.map((rect) => rect.x + rect.w)) - x,
    h: Math.max(...rects.map((rect) => rect.y + rect.h)) - y,
  };
}
