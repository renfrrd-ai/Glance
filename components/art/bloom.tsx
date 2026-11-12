"use client";

import { C, INK } from "./palette";
import { BuddyFace } from "./buddy-face";

/*
 * A personality, as a flower with a face.
 *
 * Each one gets its own petal count, size and colours — so Calm is a dozen
 * small petals and Coach is three big ones, and they are told apart at a glance
 * rather than by reading the label.
 */
const BLOOMS: Record<
  string,
  { petals: number; r: number; d: number; petal: string; ring: string }
> = {
  warm: { petals: 8, r: 6.4, d: 12.2, petal: C.marigold, ring: C.vermilion },
  professional: { petals: 4, r: 9.6, d: 8.6, petal: C.sky, ring: C.navy },
  quirky: { petals: 5, r: 7.6, d: 11.4, petal: C.peri, ring: C.marigold },
  genz: { petals: 6, r: 6.8, d: 12, petal: C.pink, ring: C.vermilion },
  calm: { petals: 12, r: 4.4, d: 14, petal: C.teal, ring: C.sky },
  coach: { petals: 3, r: 10.2, d: 7.6, petal: C.vermilion, ring: C.marigold },
};

export function Bloom({
  id,
  size = 36,
  /** Turning, while its hello is playing. */
  spin,
}: {
  id: string;
  size?: number;
  spin?: boolean;
}) {
  const bloom = BLOOMS[id] ?? BLOOMS.warm;

  const petals = Array.from({ length: bloom.petals }, (_, i) => {
    const angle = (i / bloom.petals) * Math.PI * 2 - Math.PI / 2;
    return { x: 20 + Math.cos(angle) * bloom.d, y: 20 + Math.sin(angle) * bloom.d };
  });

  return (
    <span
      className="cc-bloom"
      data-spin={spin ? "true" : "false"}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox="0 0 40 40">
        <g filter="url(#cc-crayon)">
          {petals.map((petal, i) => (
            <circle cx={petal.x} cy={petal.y} r={bloom.r} fill={bloom.petal} key={i} />
          ))}
          <circle cx="20" cy="20" r="10.6" fill={bloom.ring} />
          <circle cx="20" cy="20" r="7.6" fill={C.cream} />
        </g>
      </svg>
      <span className="cc-bloom-face">
        <BuddyFace layout="nib" width={Math.round(size * 0.5)} ink={INK} expression="smile" />
      </span>
    </span>
  );
}
