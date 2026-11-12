"use client";

/*
 * The walkthrough.
 *
 * A tour is a list of stops — a block to look at and a line to say. It plays
 * itself, stop by stop, and a stop that hands over ("your turn") holds until
 * the person does the thing. A detour is a stop that answers a question asked
 * mid-walkthrough: it plays a stretch and then jumps back where it came from.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Rect } from "@/lib/board/events";

import { controlOwnsKey, isTyping } from "./annotations";

export type Stop = { id: string; say: string };

const MARKS = {
  prev: "M14.5 6L8.5 12L14.5 18",
  next: "M9.5 6L15.5 12L9.5 18",
  play: "M8.5 5.8L18.2 12L8.5 18.2Z",
  pause: "M8.6 6.2L8.6 17.8M15.4 6.2L15.4 17.8",
  fit: "M10.6 4.8A5.8 5.8 0 1 0 10.6 16.4A5.8 5.8 0 1 0 10.6 4.8ZM14.8 14.8L19.4 19.4M7.9 10.6H13.3",
  full: "M4.5 9V5.8C4.5 5.1 5.1 4.5 5.8 4.5H9M15 4.5H18.2C18.9 4.5 19.5 5.1 19.5 5.8V9M19.5 15V18.2C19.5 18.9 18.9 19.5 18.2 19.5H15M9 19.5H5.8C5.1 19.5 4.5 18.9 4.5 18.2V15",
  unfull:
    "M9 4.5V7.7C9 8.4 8.4 9 7.7 9H4.5M19.5 9H16.3C15.6 9 15 8.4 15 7.7V4.5M15 19.5V16.3C15 15.6 15.6 15 16.3 15H19.5M4.5 15H7.7C8.4 15 9 15.6 9 16.3V19.5",
  sound: "M4.8 9.3H7.8L12.2 5.6V18.4L7.8 14.7H4.8ZM15.6 9.2C16.6 10.5 16.6 13.5 15.6 14.8M18 6.8C20.2 9.5 20.2 14.5 18 17.2",
  muted: "M4.8 9.3H7.8L12.2 5.6V18.4L7.8 14.7H4.8ZM15.8 9.6L20.2 14.4M20.2 9.6L15.8 14.4",
  pen: "M15.4 4.6L19.4 8.6L9.2 18.8L4.6 19.4L5.2 14.8ZM13.2 6.8L17.2 10.8",
} as const;

export type Mark = keyof typeof MARKS;

export function TourMark({ mark, size = 18 }: { mark: Mark; size?: number }) {
  const filled = mark === "play";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 1.4 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={MARKS[mark]} />
    </svg>
  );
}

export function TourControls({
  index,
  count,
  playing,
  held = false,
  onPrev,
  onNext,
  onToggle,
  muted,
  onToggleMute,
  onFit,
  full,
  draw,
}: {
  index: number;
  count: number;
  playing: boolean;
  /** Waiting for the person to do something. */
  held?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
  muted?: boolean;
  onToggleMute?: () => void;
  onFit?: () => void;
  full?: { on: boolean; toggle: () => void };
  draw?: { on: boolean; toggle: () => void };
}) {
  return (
    <div className="ck-tour" role="group" aria-label="Walkthrough" data-held={held || undefined}>
      <button
        type="button"
        className="ck-tour-btn"
        onClick={onPrev}
        disabled={index === 0}
        aria-label="Previous point in the walkthrough"
      >
        <TourMark mark="prev" />
      </button>

      <button
        type="button"
        className="ck-tour-btn ck-tour-play"
        onClick={onToggle}
        aria-label={playing ? "Pause the walkthrough" : "Play the walkthrough"}
      >
        <TourMark mark={playing ? "pause" : "play"} size={16} />
      </button>

      <button
        type="button"
        className="ck-tour-btn"
        onClick={onNext}
        disabled={index >= count - 1}
        aria-label="Next point in the walkthrough"
      >
        <TourMark mark="next" />
      </button>

      <span className="ck-tour-count">
        {index + 1} / {count}
      </span>

      {onFit || onToggleMute || full || draw ? (
        <span className="ck-tour-sep" aria-hidden="true" />
      ) : null}

      {draw ? (
        <button
          type="button"
          className="ck-tour-btn"
          onClick={draw.toggle}
          aria-pressed={draw.on}
          data-on={draw.on || undefined}
          aria-label={draw.on ? "Put the pen away" : "Draw on the board"}
        >
          <TourMark mark="pen" />
        </button>
      ) : null}

      {onFit ? (
        <button
          type="button"
          className="ck-tour-btn"
          onClick={onFit}
          aria-label="Show the whole board"
          title="Show the whole board (F)"
        >
          <TourMark mark="fit" />
        </button>
      ) : null}

      {full ? (
        <button
          type="button"
          className="ck-tour-btn"
          onClick={full.toggle}
          aria-pressed={full.on}
          aria-label={full.on ? "Leave full screen" : "Full screen"}
          title={full.on ? "Leave full screen (⌃⌘F)" : "Full screen (⌃⌘F)"}
        >
          <TourMark mark={full.on ? "unfull" : "full"} />
        </button>
      ) : null}

      {onToggleMute ? (
        <button
          type="button"
          className="ck-tour-btn"
          onClick={onToggleMute}
          aria-pressed={!muted}
          aria-label={muted ? "Turn narration voice on" : "Turn narration voice off"}
          title={muted ? "Narration is off" : "Narration is on"}
        >
          <TourMark mark={muted ? "muted" : "sound"} />
        </button>
      ) : null}

      {held ? (
        <span className="ck-tour-turn" aria-live="polite">
          Your turn
        </span>
      ) : null}
    </div>
  );
}

/** The ring drawn around whatever is being looked at. */
export function TourSpotlight({ rect }: { rect: Rect }) {
  return (
    <div
      className="ck-spotlight"
      style={{ transform: `translate(${rect.x}px, ${rect.y}px)`, width: rect.w, height: rect.h }}
      aria-hidden="true"
    />
  );
}

/**
 * Drive a walkthrough.
 *
 * `holds` says a stop is waiting on the person; `blocked` says the whole tour
 * is waiting on something else (a question being answered). Both pause the
 * clock rather than skipping, so nothing is said into a gap.
 */
export function useTour(
  stops: Stop[],
  active: boolean,
  holds?: (id: string) => boolean,
  blocked?: () => boolean,
  autoplay = true,
) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [hushed, setHushed] = useState(!autoplay);
  const [started, setStarted] = useState(autoplay);
  const [byHand, setByHand] = useState(0);
  const detour = useRef<{ end: number; back: number } | null>(null);

  const count = stops.length;

  /* Where the next step goes: out of a detour, back where it came from. */
  const after = (from: number) => {
    const running = detour.current;
    if (running && from >= running.end) {
      detour.current = null;
      return Math.min(running.back, count - 1);
    }
    return from >= count - 1 ? null : from + 1;
  };

  const [empty, setEmpty] = useState(count === 0);
  if ((count === 0) !== empty) {
    setEmpty(count === 0);
    if (count === 0) setIndex(0);
  }

  useEffect(() => {
    if (count === 0) detour.current = null;
  }, [count]);

  const live = active && count > 0;
  const stop = live ? stops[Math.min(index, count - 1)] : null;
  const held = !!live && !!playing && !!stop && !!holds?.(stop.id);
  const waiting = !!live && !!stop && !!blocked?.();
  const paused = waiting && !hushed;
  const speaking = playing || paused;
  const holding = !!live && !!stop && !!holds?.(stop.id);

  /* How long a stop stays up: about how long its line takes to say, floored
   * at a readable minimum and capped so nothing sits forever. */
  useEffect(() => {
    if (!live || !playing || !stop || holding || waiting) return;
    const ms = Math.min(9000, Math.max(2600, 380 * stop.say.trim().split(/\s+/).length));
    const soon = window.setTimeout(() => {
      const next = after(index);
      if (next === null) setPlaying(false);
      else setIndex(next);
    }, ms);
    return () => window.clearTimeout(soon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, playing, stop, index, count, holding, waiting]);

  const go = useCallback((to: number, hush = false) => {
    detour.current = null;
    setPlaying(false);
    setHushed(hush);
    setStarted(true);
    setByHand((n) => n + 1);
    setIndex(Math.max(0, to));
  }, []);

  const next = useCallback(() => {
    detour.current = null;
    setPlaying(false);
    setHushed(false);
    setStarted(true);
    setByHand((n) => n + 1);
    setIndex((now) => Math.min(now + 1, count - 1));
  }, [count]);

  const prev = useCallback(() => {
    detour.current = null;
    setPlaying(false);
    setHushed(false);
    setStarted(true);
    setByHand((n) => n + 1);
    setIndex((now) => Math.max(now - 1, 0));
  }, []);

  /* Used by the clock rather than by a button: no "by hand" bump. */
  const advance = useCallback(() => {
    const to = after(index);
    if (to !== null) setIndex(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, index]);

  const toggle = useCallback(() => {
    if (!playing && paused) {
      setHushed(true);
      return;
    }
    setStarted(true);
    setHushed(playing);
    setPlaying(!playing);
    if (!playing) setByHand((n) => n + 1);
    /* Pressing play at the end starts it over. */
    if (!playing && count > 1 && index >= count - 1) setIndex(0);
  }, [playing, paused, count, index]);

  const hush = useCallback(() => {
    setPlaying(false);
    setHushed(true);
  }, []);

  /** Play `from`..`end`, then come back to `back`. */
  const takeDetour = useCallback((from: number, end: number, back: number) => {
    detour.current = { end, back };
    setStarted(true);
    setHushed(false);
    setPlaying(true);
    setByHand((n) => n + 1);
    setIndex(Math.max(0, from));
  }, []);

  useEffect(() => {
    if (!live) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event) || controlOwnsKey(event)) return;
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") prev();
      if (event.key === " ") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live, next, prev, toggle]);

  return useMemo(
    () => ({
      active: live,
      stop,
      index,
      count,
      playing,
      /** Playing, or paused mid-answer. */
      live: speaking,
      held,
      hushed,
      started,
      byHand,
      next,
      prev,
      toggle,
      go,
      advance,
      hush,
      detour: takeDetour,
    }),
    [
      live,
      stop,
      index,
      count,
      playing,
      speaking,
      held,
      hushed,
      started,
      byHand,
      next,
      prev,
      toggle,
      go,
      advance,
      hush,
      takeDetour,
    ],
  );
}
