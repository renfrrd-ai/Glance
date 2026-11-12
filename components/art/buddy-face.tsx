"use client";

/*
 * The face.
 *
 * Two eyes and a mouth, drawn at whatever size the thing wearing them is: the
 * nib of the cursor, a personality's flower, the notch. It is one component
 * because the face has to stay recognisable at 16px, which means the strokes
 * and the pupils have minimum sizes in *rendered* pixels — hence the scaling
 * in `fit`, which works backwards from the width it is actually drawn at.
 *
 * Blinking is deliberate: it is on a shared clock derived from the wall time,
 * so several faces on screen blink together rather than looking like separate
 * creatures, and it is skipped entirely for anyone who asked for less motion.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type Expression =
  | "smile"
  | "grin"
  | "wink"
  | "oh"
  | "delight"
  | "think"
  | "focus"
  | "listen"
  | "point"
  | "type"
  | "patient"
  | "sorry"
  | "sleep";

type Eyes = "open" | "wink" | "wide" | "half" | "happy" | "shut";
type Mouth = "smile" | "grin" | "oh" | "flat" | "small";

const FACES: Record<Expression, { eyes: Eyes; mouth: Mouth; gaze?: { x: number; y: number } }> = {
  smile: { eyes: "open", mouth: "smile" },
  grin: { eyes: "open", mouth: "grin" },
  wink: { eyes: "wink", mouth: "smile" },
  oh: { eyes: "wide", mouth: "oh" },
  delight: { eyes: "happy", mouth: "grin" },
  think: { eyes: "open", mouth: "flat", gaze: { x: 0.7, y: -0.8 } },
  focus: { eyes: "open", mouth: "small", gaze: { x: -0.2, y: 0.85 } },
  listen: { eyes: "wide", mouth: "oh" },
  point: { eyes: "open", mouth: "small", gaze: { x: -0.75, y: -0.75 } },
  type: { eyes: "open", mouth: "small", gaze: { x: 0.25, y: 0.95 } },
  patient: { eyes: "open", mouth: "small", gaze: { x: 0, y: 0.6 } },
  sorry: { eyes: "open", mouth: "flat", gaze: { x: 0, y: 0.8 } },
  sleep: { eyes: "shut", mouth: "small" },
};

export const BUDDY_EXPRESSIONS = Object.keys(FACES) as Expression[];

export type Layout = {
  viewBox: string;
  /** Eye centres. */
  ex1: number;
  ex2: number;
  ey: number;
  /** Pupil radius. */
  er: number;
  /** Mouth centre and width. */
  mx: number;
  my: number;
  mw: number;
  /** Stroke width. */
  sw: number;
};

export const BUDDY_LAYOUTS: Record<string, Layout> = {
  wide: { viewBox: "0 0 48 24", ex1: 14, ex2: 34, ey: 9, er: 3.6, mx: 24, my: 16.5, mw: 12, sw: 2.4 },
  nib: { viewBox: "0 0 22 26", ex1: 5.3, ex2: 8.9, ey: 7.6, er: 1.05, mx: 7.1, my: 11.2, mw: 3.8, sw: 1.3 },
};

export const NIB_FACE = BUDDY_LAYOUTS.nib;

/** Below these widths the eyes vanish, so the face warns rather than disappear. */
export const BUDDY_MIN_WIDTH: Record<string, number> = { wide: 24, nib: 16 };

/** One decimal place is plenty, and keeps the markup readable. */
const n1 = (value: number) => (Math.round(value * 10) / 10).toString();

/** What a board state looks like on the face. */
export function expressionFor(state: string): Expression {
  switch (state) {
    case "listening":
      return "listen";
    case "thinking":
      return "think";
    case "answering":
    case "pointing":
      return "point";
    case "placing":
      return "focus";
    case "typing":
      return "type";
    case "staged":
    case "open":
    case "held":
      return "patient";
    case "typed":
      return "delight";
    case "failed":
      return "sorry";
    default:
      return "smile";
  }
}

export function BuddyFace({
  expression = "smile",
  /** 0–1: how wide the mouth opens while speaking. */
  level,
  /** Where the eyes look, overriding the expression's own gaze. */
  gaze = null,
  blink = true,
  ink = "currentColor",
  layout = "wide",
  width,
  mouth = true,
  className,
}: {
  expression?: Expression;
  level?: number | null;
  gaze?: { x: number; y: number } | null;
  blink?: boolean;
  ink?: string;
  layout?: string | Layout;
  width?: number;
  mouth?: boolean;
  className?: string;
}) {
  const base = typeof layout === "string" ? BUDDY_LAYOUTS[layout] : layout;
  const layoutName =
    typeof layout === "string"
      ? layout
      : Object.keys(BUDDY_LAYOUTS).find((key) => BUDDY_LAYOUTS[key] === layout);
  const [, , boxWidth, boxHeight] = base.viewBox.split(" ").map(Number);

  /* Keep strokes and pupils at least a rendered pixel across. */
  const fit = useMemo(() => {
    if (!width) return base;
    const scale = width / boxWidth;
    return {
      ...base,
      sw: base.sw * scale < 1 ? 1 / scale : base.sw,
      er: base.er * scale < 1.1 ? 1.1 / scale : base.er,
      mw: (base.mw / 2) * 0.26 * scale < 1.6 ? (6.153846153846154 / scale) * 2 : base.mw,
    };
  }, [base, width, boxWidth]);

  const face = FACES[expression];
  const uid = `buddy-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const svg = useRef<SVGSVGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const mouthHole = useRef<SVGCircleElement>(null);
  const openness = useRef(0.4);

  /* The eyes and the mouth are nudged with setAttribute rather than re-rendered:
   * they move every frame while chalk speaks. */
  useLayoutEffect(() => {
    const group = eyes.current;
    if (!group) return;
    const look = gaze ?? face.gaze ?? { x: 0, y: 0 };
    const reach = fit.er * 1.05;
    group.setAttribute("transform", `translate(${n1(look.x * reach)} ${n1(look.y * reach)})`);
  }, [face, gaze, fit.er]);

  useLayoutEffect(() => {
    const hole = mouthHole.current;
    if (!hole) return;
    const want = level == null ? 0.55 : 0.26 + 0.6 * Math.min(1, Math.max(0, level));
    openness.current += (want - openness.current) * 0.5;
    hole.setAttribute("r", n1((fit.mw / 2) * openness.current));
  }, [level, fit.mw, expression]);

  /* A blink on changing expression, so a change of mood reads as a reaction. */
  const was = useRef(expression);
  useEffect(() => {
    const element = svg.current;
    if (!element || was.current === expression) return;
    was.current = expression;
    if (!blink || face.eyes === "shut") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    element.setAttribute("data-blink", "1");
    const soon = window.setTimeout(() => element.removeAttribute("data-blink"), 130);
    return () => window.clearTimeout(soon);
  }, [expression, blink, face.eyes]);

  /* The idle blink, on a clock every face shares. */
  useEffect(() => {
    const element = svg.current;
    if (!element || !blink || face.eyes === "shut") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let next: number;
    let shut: number | undefined;

    const schedule = () => {
      const now = Date.now();
      const slot = Math.floor(now / 3400) + 1;
      /* A hash of the slot, so the moment inside it is arbitrary but shared. */
      const noise = Math.sin(slot * 12.9898) * 43758.5453;
      const at = Math.max(60, slot * 3400 + (noise - Math.floor(noise)) * 1400 - now);

      next = window.setTimeout(() => {
        element.setAttribute("data-blink", "1");
        shut = window.setTimeout(() => element.removeAttribute("data-blink"), 120);
        schedule();
      }, at);
    };

    schedule();
    return () => {
      window.clearTimeout(next);
      if (shut) window.clearTimeout(shut);
      element.removeAttribute("data-blink");
    };
  }, [blink, face.eyes]);

  /* A face squeezed below its minimum loses its eyes; say so in development. */
  const warn = useCallback(() => {
    const element = svg.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    if (process.env.NODE_ENV !== "development") return;

    const floor = BUDDY_MIN_WIDTH[layoutName ?? "wide"] ?? BUDDY_MIN_WIDTH.wide;
    let said = false;
    const watch = new ResizeObserver((entries) => {
      const seen = entries[0]?.contentRect.width ?? 0;
      if (seen > 0 && seen < floor && !said) {
        said = true;
        console.warn(
          `BuddyFace: rendered ${Math.round(seen)}px wide, but the "${layoutName ?? "custom"}" face needs at least ${floor}px or the eyes vanish. Pass \`width\` or size the host up.`,
        );
      }
    });
    watch.observe(element);
    return () => watch.disconnect();
  }, [layoutName]);

  useEffect(() => warn(), [warn]);

  const parts = useMemo(() => {
    const { ex1, ex2, ey, er, mx, my, mw, sw } = fit;

    const pupil = (x: number, y: number, r: number, open = true) => (
      <circle
        key={`${x}-${open}`}
        cx={n1(x)}
        cy={n1(y)}
        r={n1(r)}
        fill={ink}
        stroke="none"
        data-open={open ? "" : undefined}
      />
    );

    const squint = (x: number, y: number) => (
      <ellipse
        key={`sq${x}`}
        cx={n1(x)}
        cy={n1(y)}
        rx={n1(er)}
        ry={n1(er * 0.48)}
        fill={ink}
        stroke="none"
        data-open=""
      />
    );

    const happy = (x: number, y: number) => (
      <path
        key={`hp${x}`}
        d={`M${n1(x - er - 0.8)} ${n1(y + 1.4)} Q${n1(x)} ${n1(y - er - 1.2)} ${n1(x + er + 0.8)} ${n1(y + 1.4)}`}
        fill="none"
        stroke={ink}
        strokeWidth={sw}
        data-open=""
      />
    );

    /* A lid is drawn over an open eye, and shown only while blinking. */
    const lid = (x: number, y: number, always = false) => (
      <path
        key={`sh${x}${always}`}
        d={`M${n1(x - er - 0.4)} ${n1(y)} L${n1(x + er + 0.4)} ${n1(y)}`}
        fill="none"
        stroke={ink}
        strokeWidth={sw}
        data-shut={always ? undefined : ""}
      />
    );

    let eyeNodes: React.ReactNode[];
    switch (face.eyes) {
      case "wink":
        eyeNodes = [pupil(ex1, ey, er), happy(ex2, ey)];
        break;
      case "wide":
        eyeNodes = [pupil(ex1, ey, er * 1.3), pupil(ex2, ey, er * 1.3)];
        break;
      case "half":
        eyeNodes = [squint(ex1, ey), squint(ex2, ey)];
        break;
      case "happy":
        eyeNodes = [happy(ex1, ey), happy(ex2, ey)];
        break;
      case "shut":
        eyeNodes = [lid(ex1, ey + 1, true), lid(ex2, ey + 1, true)];
        break;
      default:
        eyeNodes = [pupil(ex1, ey, er), pupil(ex2, ey, er)];
    }

    const lids = face.eyes === "shut" ? null : [lid(ex1, ey + 1), lid(ex2, ey + 1)];
    const half = mw / 2;

    let mouthNode: React.ReactNode;
    switch (face.mouth) {
      case "grin":
        mouthNode = (
          <path
            d={`M${n1(mx - half)} ${n1(my)} Q${n1(mx)} ${n1(my + half * 1.4)} ${n1(mx + half)} ${n1(my)} Z`}
            fill={ink}
            stroke={ink}
            strokeWidth={sw}
          />
        );
        break;
      case "oh":
        mouthNode = (
          <circle
            ref={mouthHole}
            cx={n1(mx)}
            cy={n1(my + 2)}
            r={n1(half * 0.55)}
            fill="none"
            stroke={ink}
            strokeWidth={sw}
          />
        );
        break;
      case "flat":
        mouthNode = (
          <path
            d={`M${n1(mx - half * 0.7)} ${n1(my + 1)} L${n1(mx + half * 0.7)} ${n1(my + 1)}`}
            fill="none"
            stroke={ink}
            strokeWidth={sw}
          />
        );
        break;
      case "small":
        mouthNode = (
          <path
            d={`M${n1(mx - half * 0.55)} ${n1(my)} Q${n1(mx)} ${n1(my + half * 0.5)} ${n1(mx + half * 0.55)} ${n1(my)}`}
            fill="none"
            stroke={ink}
            strokeWidth={sw}
          />
        );
        break;
      default:
        mouthNode = (
          <path
            d={`M${n1(mx - half)} ${n1(my)} Q${n1(mx)} ${n1(my + half * 0.9)} ${n1(mx + half)} ${n1(my)}`}
            fill="none"
            stroke={ink}
            strokeWidth={sw}
          />
        );
    }

    return { eyeNodes, lids, mouthNode };
  }, [fit, face, ink]);

  const drawn = width ?? boxWidth;

  return (
    <svg
      ref={svg}
      id={uid}
      className={className}
      viewBox={fit.viewBox}
      width={drawn}
      height={(drawn * boxHeight) / boxWidth}
      aria-hidden="true"
      data-expression={expression}
      strokeLinecap="round"
      strokeLinejoin="round"
      overflow="visible"
    >
      <style>{`#${uid}[data-blink="1"] [data-open]{opacity:0}#${uid}:not([data-blink="1"]) [data-shut]{opacity:0}`}</style>
      <g ref={eyes} data-eyes="">
        {parts.eyeNodes}
        {parts.lids}
      </g>
      {mouth ? parts.mouthNode : null}
    </svg>
  );
}

/** The cursor's nib, with its face. */
export function NibGlyph({
  expression = "placing",
  width = 21,
}: {
  expression?: string;
  width?: number;
}) {
  const height = (25 * width) / 21;
  const face =
    typeof expression !== "string" || ["placing", "thinking"].includes(expression)
      ? expressionFor(expression)
      : (expression as Expression);

  return (
    <>
      <svg className="ck-nib" width={width} height={height} viewBox="0 0 22 26" style={{ display: "block" }}>
        <path
          d="M3 2 L3 19 Q3 20.5 4.4 19.6 L8 16.6 L11 23.4 Q11.6 24.8 12.9 24.2 L14.6 23.4 Q15.9 22.8 15.3 21.5 L12.2 15 L16.4 14.6 Q18 14.4 16.9 13.2 L4.9 1.4 Q3 -0.4 3 2 Z"
          fill="var(--o-cursor, var(--o-here, #29A383))"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <BuddyFace className="ck-nib-face" layout={NIB_FACE} ink="#fff" width={width} expression={face} />
    </>
  );
}
