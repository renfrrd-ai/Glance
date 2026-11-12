"use client";

import { ART, drawingFor } from "./art-map";
import { Arcs, Doodle, Tile } from "./doodle";

/** A section's doodle at rail size, in that section's rail colour. */
export function SectionIcon({
  id,
  color,
  size = 20,
  weight = 1.8,
}: {
  id: string;
  color?: string;
  size?: number;
  weight?: number;
}) {
  return <Doodle id={drawingFor(id)} color={color ?? ART[id].rail} size={size} weight={weight} />;
}

/** A section's doodle as a big coloured tile. */
export function SectionTile({
  id,
  size = 96,
  style,
}: {
  id: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const art = ART[id];
  return (
    <Tile
      id={drawingFor(id)}
      size={size}
      tile={art.tile}
      hatch={art.hatch}
      paper={art.paper}
      style={style}
    />
  );
}

/*
 * The band at the top of a settings pane: this section's tile in the middle,
 * its two neighbours either side, shrinking away — so where you are sits in the
 * order of everything else, and the neighbours are a way to get there.
 */
export function SectionHero({
  id,
  around,
  compact,
  onGo,
  names,
}: {
  id: string;
  around: string[];
  compact?: boolean;
  onGo?: (id: string) => void;
  names?: Record<string, string>;
}) {
  const art = ART[id];
  const here = Math.max(0, around.indexOf(id));
  const count = around.length;
  const at = (offset: number) => around[(here + offset + 4 * count) % count];
  const big = compact ? 92 : 112;

  const row = [
    { id: at(-2), size: Math.round(big * 0.62), z: 1 },
    { id: at(-1), size: Math.round(big * 0.8), z: 2 },
    { id, size: big, z: 3 },
    { id: at(1), size: Math.round(big * 0.8), z: 2 },
    { id: at(2), size: Math.round(big * 0.62), z: 1 },
  ];

  return (
    <div className="cc-hero" style={{ height: compact ? 112 : 148, background: art.bg }}>
      <Arcs className="cc-hero-arcs" color={art.arcs} />
      <div className="cc-hero-row">
        {row.map((slot, i) => {
          const style = {
            zIndex: slot.z,
            marginLeft: i === 0 ? 0 : -Math.round(big * 0.1),
            animationDelay: `${[90, 40, 0, 40, 90][i]}ms`,
          };
          return slot.id !== id && onGo ? (
            <button
              type="button"
              className="cc-tile-go"
              style={style}
              onClick={() => onGo(slot.id)}
              aria-label={`Go to ${names?.[slot.id] ?? slot.id}`}
              title={names?.[slot.id]}
              key={`${slot.id}${i}`}
            >
              <SectionTile id={slot.id} size={slot.size} />
            </button>
          ) : (
            <span
              className="cc-tile-go"
              data-here={slot.id === id ? "true" : "false"}
              style={style}
              key={`${slot.id}${i}`}
            >
              <SectionTile id={slot.id} size={slot.size} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Initials, or the `you` doodle when there is no name yet. */
export function Person({ name, size = 28 }: { name?: string; size?: number }) {
  const initials = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

  return (
    <span
      className="cc-person"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {initials || <SectionIcon id="you" color="#1E2B40" size={Math.round(size * 0.62)} weight={2} />}
    </span>
  );
}
