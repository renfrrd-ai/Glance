"use client";

/*
 * The marks chalk makes around things: a ring on the screen, a loop on a
 * board. Both are drawn twice — a wide, faint dust pass and a thin ink pass —
 * and both draw themselves on by running a dash offset down to zero.
 */

import { useId, useMemo } from "react";

/** A signed, repeatable wobble for a seed and a step. */
function jitter(seed: number, step: number) {
  const noise = Math.sin(seed * 12.9898 + step * 78.233) * 43758.5453;
  return (noise - Math.floor(noise)) * 2 - 1;
}

/** A hand-drawn circle: a closed Catmull-Rom through wobbled points. */
function ringPath(seed: number, radius: number, cx: number, cy: number) {
  /* Slightly past a full turn, so the ends overlap the way a real one does. */
  const sweep = 2 * Math.PI * 1.06;
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i <= 44; i++) {
    const angle = (i / 44) * sweep - Math.PI / 2;
    const r = radius + jitter(seed, i) * (0.045 * radius) + jitter(seed + 7, 3 * i) * (0.018 * radius);
    /* Squashed a little: a hand-drawn ring is never quite round. */
    points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r * 0.94 });
  }

  const at = (i: number) => points[Math.min(Math.max(i, 0), points.length - 1)];
  const n = (value: number) => value.toFixed(1);

  let path = `M${n(at(0).x)} ${n(at(0).y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const before = at(i - 1);
    const from = at(i);
    const to = at(i + 1);
    const after = at(i + 2);
    path += ` C${n(from.x + (to.x - before.x) / 6)} ${n(from.y + (to.y - before.y) / 6)} ${n(
      to.x - (after.x - from.x) / 6,
    )} ${n(to.y - (after.y - from.y) / 6)} ${n(to.x)} ${n(to.y)}`;
  }
  return path;
}

export function ChalkRing({
  size = 78,
  seed = 1,
  colour,
  weight = 1,
  className,
}: {
  size?: number;
  seed?: number;
  colour?: string;
  weight?: number;
  className?: string;
}) {
  const filter = `chalk-ring-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const ring = useMemo(() => {
    const scale = size / 78;
    const radius = size / 2 - 6 * scale;
    return {
      d: ringPath(seed, radius, size / 2, size / 2),
      len: Math.round(2 * Math.PI * radius * 1.06),
      dust: 9 * scale * weight,
      ink: 3.2 * scale * weight,
      grainScale: 2.1 * scale,
      grainFrequency: 0.9 / scale,
    };
  }, [size, seed, weight]);

  const ink = colour ?? "var(--o-here, #29A383)";
  const dashed = { strokeDasharray: ring.len, strokeDashoffset: ring.len };

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      <style>{`
        @keyframes chalk-draw { to { stroke-dashoffset: 0; } }
        /* A ring that must not animate has to land DRAWN, not stay hidden — killing the animation
           without this leaves the dash offset at full length and the mark never appears. */
        @media (prefers-reduced-motion: reduce) {
          .chalk-ring-stroke { animation: none !important; stroke-dashoffset: 0 !important; }
        }
      `}</style>

      <defs>
        <filter id={filter} x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={ring.grainFrequency}
            numOctaves="2"
            seed={seed}
            result="grain"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="grain"
            scale={ring.grainScale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      <path
        className="chalk-ring-stroke"
        d={ring.d}
        fill="none"
        stroke={ink}
        strokeWidth={ring.dust}
        strokeLinecap="round"
        opacity={0.24}
        filter={`url(#${filter})`}
        style={{ ...dashed, animation: "chalk-draw 620ms ease-out 40ms forwards" }}
      />
      <path
        className="chalk-ring-stroke"
        d={ring.d}
        fill="none"
        stroke={ink}
        strokeWidth={ring.ink}
        strokeLinecap="round"
        filter={`url(#${filter})`}
        style={{ ...dashed, animation: "chalk-draw 560ms ease-out forwards" }}
      />
    </svg>
  );
}

/** A loop drawn around a box — a squircle, so corners are not lassoed tightly. */
export function ChalkLoop({
  w,
  h,
  seed = 1,
  colour,
  weight = 4,
  pad = 18,
}: {
  w: number;
  h: number;
  seed?: number;
  colour?: string;
  weight?: number;
  pad?: number;
}) {
  const width = w + 2 * pad;
  const height = h + 2 * pad;

  const path = useMemo(() => {
    const rx = w / 2 + pad * 0.6;
    const ry = h / 2 + pad * 0.6;
    const cx = width / 2;
    const cy = height / 2;

    const sweep = 2 * Math.PI * 1.05;
    const wobble = Math.min(6, 0.03 * Math.min(rx, ry));
    const points: { x: number; y: number }[] = [];

    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * sweep - 0.6 * Math.PI;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      /* The square root is what squares the ellipse off into a squircle. */
      const x = Math.sign(cos) * Math.sqrt(Math.abs(cos)) * rx;
      const y = Math.sign(sin) * Math.sqrt(Math.abs(sin)) * ry;
      const off = 1 + (jitter(seed, i) * wobble) / Math.max(rx, ry);
      points.push({ x: cx + x * off, y: cy + y * off });
    }

    const at = (i: number) => points[Math.min(Math.max(i, 0), points.length - 1)];
    const n = (value: number) => value.toFixed(1);

    let d = `M${n(at(0).x)} ${n(at(0).y)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const before = at(i - 1);
      const from = at(i);
      const to = at(i + 1);
      const after = at(i + 2);
      d += ` C${n(from.x + (to.x - before.x) / 6)} ${n(from.y + (to.y - before.y) / 6)} ${n(
        to.x - (after.x - from.x) / 6,
      )} ${n(to.y - (after.y - from.y) / 6)} ${n(to.x)} ${n(to.y)}`;
    }
    return d;
  }, [w, h, width, height, seed, pad]);

  return (
    <svg
      className="ck-focus-ring"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ overflow: "visible", position: "absolute", left: -pad, top: -pad }}
    >
      <path
        d={path}
        fill="none"
        stroke={colour ?? "var(--o-here, #29A383)"}
        strokeWidth={weight}
        strokeLinecap="round"
      />
    </svg>
  );
}
