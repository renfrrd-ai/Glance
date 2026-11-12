"use client";

/*
 * What the person adds on top of a board: pen marks, sticky notes, and the
 * tools for making them. These sit in board coordinates, inside the world, so
 * they pan and zoom with everything else.
 */

import { useEffect, useRef, useState, useCallback } from "react";

import { Doodle } from "@/components/art/doodle";
import type { DrawingId } from "@/components/art/drawings";
import type { Ink, Point, StickyNote } from "@/lib/board/events";
import { strokePath } from "@/lib/board/strokes";

import type { CameraHandle, Tool } from "./surface";

const TOOLS: { id: Tool; art: DrawingId; label: string; key: string }[] = [
  { id: "pointer", art: "cursor", label: "Move around", key: "esc" },
  { id: "pen", art: "pen", label: "Draw on the board", key: "p" },
  { id: "note", art: "note", label: "Leave a note", key: "n" },
  { id: "eraser", art: "eraser", label: "Remove your marks", key: "e" },
  { id: "lasso", art: "lasso", label: "Circle something to ask about it", key: "c" },
];

export function Annotations({
  ink,
  notes,
  drawing,
  width,
  height,
  onEditNote,
  editing,
}: {
  ink: Ink[];
  notes: StickyNote[];
  /** The stroke being drawn right now. */
  drawing?: Point[] | null;
  width: number;
  height: number;
  onEditNote?: (id: string) => void;
  /** The note being edited, which the draft covers. */
  editing?: string | null;
}) {
  return (
    <>
      <svg className="ck-annotations" width={width} height={height} aria-hidden="true">
        {ink.map((stroke) => (
          <path
            key={stroke.id}
            /* roughness 0: a person's own line is already as rough as it is. */
            d={strokePath(stroke.points, { seed: stroke.id, size: 3.4, roughness: 0 })}
            fill={stroke.colour ?? "var(--o-here, #29A383)"}
          />
        ))}
        {drawing && drawing.length > 1 ? (
          <path
            d={strokePath(drawing, { seed: "live", size: 3.4, roughness: 0 })}
            fill="var(--o-here, #29A383)"
            opacity={0.9}
          />
        ) : null}
      </svg>

      {notes.map((note) =>
        note.id === editing ? null : (
          <div
            key={note.id}
            className="ck-note"
            data-tone={note.tone ?? "note"}
            data-gesture={onEditNote ? "note" : undefined}
            title={onEditNote ? "Double-click to edit" : undefined}
            onDoubleClick={onEditNote ? () => onEditNote(note.id) : undefined}
            style={{ transform: `translate(${note.x}px, ${note.y}px)` }}
          >
            <span className="ck-note-body">{note.body}</span>
          </div>
        ),
      )}
    </>
  );
}

/** A note being written. Enter keeps it, Escape drops it, blur keeps it. */
export function NoteDraft({
  x,
  y,
  body = "",
  onDone,
}: {
  x: number;
  y: number;
  body?: string;
  onDone: (body: string | null) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  /* Blur fires after Enter, so finishing has to happen exactly once. */
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const element = box.current;
      if (!element) return;
      element.focus({ preventScroll: true });
      element.setSelectionRange(element.value.length, element.value.length);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="ck-note ck-note-draft"
      data-gesture="own"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <textarea
        ref={box}
        className="ck-note-input"
        defaultValue={body}
        rows={3}
        placeholder="Write a note…"
        aria-label="Your note — Enter to keep it, Escape to cancel"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(null);
          } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            finish(event.currentTarget.value);
          }
        }}
        onBlur={(event) => finish(event.currentTarget.value)}
      />
    </div>
  );
}

export function Tools({ tool, onPick }: { tool: Tool; onPick: (tool: Tool) => void }) {
  return (
    <div className="ck-tools" role="toolbar" aria-label="Annotation tools">
      {TOOLS.map((one) => (
        <button
          key={one.id}
          type="button"
          className="ck-tool"
          data-on={tool === one.id}
          onClick={() => onPick(one.id)}
          title={`${one.label} (${one.key})`}
          aria-pressed={tool === one.id}
          aria-label={one.label}
        >
          <Doodle id={one.art} size={24} weight={1.7} />
        </button>
      ))}
    </div>
  );
}

/** Whether a key belongs to the control under it, rather than to the board. */
export function controlOwnsKey(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const role = target.getAttribute("role") ?? "";

  if (event.key === " ")
    return (
      target.tagName === "BUTTON" ||
      target.tagName === "SUMMARY" ||
      ["button", "checkbox", "switch", "radio", "tab", "menuitem", "option"].includes(role)
    );

  if (!event.key.startsWith("Arrow")) return false;
  return (
    ["slider", "spinbutton", "radio", "tab", "option", "menuitem", "scrollbar"].includes(role) ||
    target.closest('[role="radiogroup"], [role="tablist"], [role="listbox"], [role="menu"]') !== null
  );
}

/** Whether a keystroke is someone typing, rather than a shortcut. */
export function isTyping(event: KeyboardEvent) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * The tool in hand, and the gesture it is making.
 *
 * Strokes are collected in a ref and mirrored into state for the live preview;
 * a stroke of a dozen points or fewer is dropped, since that is a stray click
 * rather than a mark.
 */
export function useTools(
  camera: CameraHandle,
  on: {
    onInk: (points: Point[]) => void;
    onNote: (at: Point) => void;
    onErase: (at: Point) => void;
    onLasso?: (points: Point[]) => void;
  },
  keys = true,
) {
  const [tool, setTool] = useState<Tool>("pointer");
  const [drawing, setDrawing] = useState<Point[] | null>(null);

  const down = useRef(false);
  const points = useRef<Point[] | null>(null);
  const pointer = useRef<number | null>(null);
  const handlers = useRef(on);

  useEffect(() => {
    handlers.current = on;
  }, [on]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (tool === "pointer") return false;
      if ((event.target as Element).closest?.(".ck-overlay, [data-gesture='own']")) return false;

      /* A second pointer cancels the stroke rather than fighting with it. */
      if (down.current && pointer.current !== event.pointerId) {
        down.current = false;
        points.current = null;
        pointer.current = null;
        setDrawing(null);
        return false;
      }

      camera.cancelFlight?.();
      const at = camera.screenToWorld({ x: event.clientX, y: event.clientY });

      if (tool === "note") {
        handlers.current.onNote(at);
        setTool("pointer");
      } else if (tool === "eraser") {
        handlers.current.onErase(at);
      } else {
        down.current = true;
        pointer.current = event.pointerId;
        points.current = [at];
        setDrawing([at]);
        try {
          /* Throws if the pointer is already gone — the stroke still works,
           * it just stops tracking if the cursor leaves the surface. */
          (event.target as Element).setPointerCapture?.(event.pointerId);
        } catch {
          /* carry on without capture */
        }
      }
      return true;
    },
    [tool, camera],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!down.current || event.pointerId !== pointer.current) return;
      const at = camera.screenToWorld({ x: event.clientX, y: event.clientY });
      points.current = points.current ? [...points.current, at] : [at];
      setDrawing(points.current);
    },
    [camera],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!down.current || event.pointerId !== pointer.current) return;
      down.current = false;
      pointer.current = null;

      const stroke = points.current;
      points.current = null;
      setDrawing(null);

      if (!stroke || stroke.length <= 12) return;
      if (tool === "lasso") handlers.current.onLasso?.(stroke);
      else handlers.current.onInk(stroke);
    },
    [tool],
  );

  useEffect(() => {
    if (!keys) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTool("pointer");
        return;
      }
      if (isTyping(event)) return;
      /* Each key toggles its own tool off again. */
      if (event.key === "p") setTool((now) => (now === "pen" ? "pointer" : "pen"));
      if (event.key === "n") setTool((now) => (now === "note" ? "pointer" : "note"));
      if (event.key === "e") setTool((now) => (now === "eraser" ? "pointer" : "eraser"));
      if (event.key === "c") setTool((now) => (now === "lasso" ? "pointer" : "lasso"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys]);

  return { tool, setTool, drawing, handlers: { onPointerDown, onPointerMove, onPointerUp } };
}
