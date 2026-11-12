"use client";

import { useId } from "react";

const RATIO = 488 / 404;

/** The chalk logo: a jade blob with two eyes and a smile, drawn by hand. */
export function ChalkMark({ size = 32, className }: { size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = (name: string) => `${name}-${uid}`;
  const width = Math.round(size * RATIO);

  return (
    <svg
      className={className}
      width={width}
      height={size}
      viewBox="268 466 488 404"
      aria-hidden
      focusable="false"
      style={{ display: "block", flex: "none", width, height: size }}
    >
      <defs>
        {/* the face: a fine grain, so the eyes stay round */}
        <filter
          id={ref("fc")}
          x="-12%"
          y="-12%"
          width="124%"
          height="124%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves={2} seed={10} result="cn" />
          <feDisplacementMap in="SourceGraphic" in2="cn" scale={5} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* the blob: a wide waver first, then a crayon grain on top of it */}
        <filter
          id={ref("cr")}
          x="-12%"
          y="-12%"
          width="124%"
          height="124%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves={2} seed={5} result="wn" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="wn"
            scale={10}
            xChannelSelector="R"
            yChannelSelector="G"
            result="w"
          />
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves={2} seed={12} result="cn" />
          <feDisplacementMap in="w" in2="cn" scale={8} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${ref("cr")})`}>
        <path
          d="M423.6 499C442 496.3 462.5 495.3 480.4 493.1C498.5 491.4 513.1 488.9 530.6 487.2C548.2 485.5 567.6 483.2 585.8 483.8C603.9 484 622.1 485.1 639.7 490.1C656.7 495.1 676 504.3 689.6 514.8C703.3 525.7 714.7 539.7 721.5 554.1C728.7 568.4 729.8 584.5 732.4 600.6C734.4 616.2 734.1 632.4 734.8 648.6C735.9 664.8 739 681.7 738.2 698C737 714.3 734.3 731.2 728.7 746.9C723.1 762.1 713.3 778.5 703.6 790.6C693.5 803.3 682 815.1 669.1 821.7C656.2 828.3 642.9 829.3 625.3 831C608.2 832.6 585.2 830.9 564.8 832.3C544.4 833.8 524.1 837.1 502.8 840.5C482.1 844.3 459.6 850.7 439.7 852.5C419.8 854.9 400.8 856.7 384 854.1C367 850.9 350.9 844.9 338.2 834.8C325.6 825.2 315.6 811.1 308.2 794.9C300.4 778.7 296.1 757.6 292.8 738.7C289.1 719.9 288.6 698.9 287.3 680.8C286.5 662.3 284.9 645.2 286.5 628.4C287.8 611.6 290 595.2 296 580C302.6 564.7 312.5 549.2 324.6 537.4C337.1 525.6 354.1 515.3 370.3 508.9C387.1 502.5 405.1 501.2 423.6 499Z"
          fill="#29A383"
        />
      </g>
      <g filter={`url(#${ref("fc")})`}>
        <circle cx="440.3" cy="649.1" r="29.5" fill="#FFFFFF" />
        <circle cx="573.3" cy="639.8" r="29.5" fill="#FFFFFF" />
        <path
          d="M459.8 724.2 Q515.4 767.5 564.3 716.8"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="36.2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
