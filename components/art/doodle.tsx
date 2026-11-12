"use client";

import { useId, type CSSProperties } from "react";

import { C, INK } from "./palette";
import { DRAWINGS, type DrawingId } from "./drawings";

/* The diagonal pencil hatching a drawing's `hatch` region is filled with. */
const HATCH = Array.from({ length: 22 }, (_, i) => `M${-10 + 2.1 * i} 24L${14 + 2.1 * i} 0`).join("");

/* useId() returns colons and such; SVG ids cannot have those. */
const safeId = (id: string) => `cc${id.replace(/[^a-zA-Z0-9]/g, "")}`;

export type DoodleProps = {
  id: DrawingId;
  color?: string;
  size?: number;
  weight?: number;
  /** Off for crisp lines — used where the wobble filter would blur a 14px icon. */
  rough?: boolean;
};

/** A drawing at icon size: one colour, no fill. */
export function Doodle({ id, color = INK, size = 20, weight = 1.8, rough = true }: DoodleProps) {
  const art = DRAWINGS[id];
  const clip = safeId(useId());

  return (
    <svg className="cc-doodle" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g
        filter={rough ? "url(#cc-wobble)" : undefined}
        stroke={color}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {"hatch" in art && art.hatch ? (
          <>
            <clipPath id={clip}>
              <path d={art.hatch} />
            </clipPath>
            <path d={HATCH} clipPath={`url(#${clip})`} strokeWidth={weight * 0.55} />
          </>
        ) : null}
        {art.shapes.map((d) => (
          <path d={d} key={d} />
        ))}
        {"ink" in art ? art.ink?.map((d) => <path d={d} key={d} />) : null}
        {"dots" in art ? art.dots?.map((d) => <path d={d} key={d} fill={color} />) : null}
      </g>
    </svg>
  );
}

export type TileProps = {
  id: DrawingId;
  size?: number;
  /** The tile's background. */
  tile: string;
  hatch?: string;
  /** What the outlined shapes are filled with. */
  paper?: string;
  rough?: boolean;
  style?: CSSProperties;
  className?: string;
};

/** The same drawing blown up on a coloured, rounded tile. */
export function Tile({
  id,
  size = 96,
  tile,
  hatch = C.marigold,
  paper = C.cream,
  rough = true,
  style,
  className,
}: TileProps) {
  const art = DRAWINGS[id];
  const clip = safeId(useId());
  const weight = size < 28 ? 1.7 : 1.35;

  return (
    <span
      className={className ? `cc-tile ${className}` : "cc-tile"}
      aria-hidden
      style={{
        display: "inline-grid",
        placeItems: "center",
        flex: "none",
        position: "relative",
        width: size,
        height: size,
        background: tile,
        borderRadius: Math.round(size * 0.24),
        ...style,
      }}
    >
      <svg
        width={Math.round(size * 0.74)}
        height={Math.round(size * 0.74)}
        viewBox="0 0 24 24"
        fill="none"
        style={{ display: "block", overflow: "visible" }}
      >
        <g
          filter={rough ? "url(#cc-crayon)" : undefined}
          stroke={INK}
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {art.shapes.map((d) => (
            <path d={d} key={d} fill={paper} />
          ))}
          {"hatch" in art && art.hatch ? (
            <>
              <clipPath id={clip}>
                <path d={art.hatch} />
              </clipPath>
              <path d={HATCH} clipPath={`url(#${clip})`} stroke={hatch} strokeWidth={0.9} />
              <path d={art.hatch} />
            </>
          ) : null}
          {"ink" in art ? art.ink?.map((d) => <path d={d} key={d} />) : null}
          {"dots" in art ? art.dots?.map((d) => <path d={d} key={d} fill={INK} />) : null}
        </g>
      </svg>
    </span>
  );
}

/** The four arcs behind a pane's hero — a rainbow drawn in one colour. */
export function Arcs({
  color,
  className,
  style,
}: {
  color: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 800 160"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <g filter="url(#cc-crayon-wide)" fill="none" stroke={color} strokeWidth="22" strokeLinecap="round">
        {[300, 390, 480, 570].map((r, i) => (
          <path key={r} d={`M${400 - r} 250A${r} ${150 + 34 * i} 0 0 1 ${400 + r} 250`} />
        ))}
      </g>
    </svg>
  );
}
