"use client";

/*
 * A whole board.
 *
 * Events in, board out. The sections are laid out left to right as sheets; the
 * blocks inside each one are stacked so nothing collides; connectors are routed
 * around whatever is in the way; and the walkthrough flies the camera from
 * block to block, with the cursor arriving just after the camera does.
 *
 * Everything here is derived from the event list — there is no board state of
 * its own apart from where the camera is and what the person has drawn, which
 * is why replaying, resuming and editing are all the same operation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BoardEvent, Point, Rect, Section } from "@/lib/board/events";
import {
  annotations as readAnnotations,
  boardTitle,
  focusOf,
  narrationByBlock,
  project,
} from "@/lib/board/events";
import { boundsOf } from "@/lib/board/camera";
import { routeAround } from "@/lib/board/routing";

import { Annotations, NoteDraft, Tools, useTools } from "./annotations";
import { BlockCard } from "./block";
import { Connectors, type Edge } from "./connectors";
import { Cursor, Note } from "./cursor";
import { TourControls, TourMark, TourSpotlight, useTour, type Stop } from "./tour";
import {
  BlockFrame,
  restack,
  Surface,
  useCanvasCamera,
  useMeasuredHeights,
  useViewport,
} from "./surface";

/** How far apart sections sit, and the least room a sheet's heading takes. */
const SHEET_GAP = 320;
const SHEET_HEAD = 104;
const BLOCK_GAP = 24;

type Placed = Rect & { id: string; sectionId: string };

/** A height to lay a block out at until it has been measured. */
const guessHeight = (block: { h?: number }) => block.h ?? 180;

export function BoardView({
  events,
  /** Extra events the person adds — ink, notes, erasures — handed back up. */
  onAnnotate,
  /** Whether the walkthrough plays itself on open. */
  autoplay = true,
  onAsk,
}: {
  events: BoardEvent[];
  onAnnotate?: (event: BoardEvent) => void;
  autoplay?: boolean;
  /** Something was circled with the lasso. */
  onAsk?: (about: { points: Point[]; blocks: string[] }) => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const viewport = useViewport(shell);
  const camera = useCanvasCamera();
  const { observe, heights } = useMeasuredHeights();

  const sections = useMemo(() => project(events), [events]);
  const narration = useMemo(() => narrationByBlock(events), [events]);
  const marks = useMemo(() => readAnnotations(events), [events]);
  const looking = useMemo(() => focusOf(events), [events]);
  const title = useMemo(() => boardTitle(events), [events]);

  /* ---- layout ----------------------------------------------------------- */

  /*
   * Sections run left to right; blocks inside one are stacked into a column
   * of the section's width. Positions written into the events are respected —
   * chalk places a block where it wants it — and restack only ever pushes a
   * block down, never sideways, so the shape it drew survives.
   */
  const layout = useMemo(() => {
    const sheets: (Rect & { id: string; title: string; index: number; head: number })[] = [];
    const placed: Placed[] = [];
    let left = 0;

    for (const [index, section] of sections.entries()) {
      const width = Math.max(
        520,
        ...section.blocks.map((block) => block.x + block.w),
      );

      /* The heading is measured too: a title that wraps to three lines must
       * push the blocks down, not sit on top of the first one. */
      const head = Math.max(SHEET_HEAD, heights[`sheet:${section.id}`] ?? 0);

      const stacked = restack(
        section.blocks.map((block) => ({
          id: block.id,
          x: left + block.x,
          y: head + block.y,
          w: block.w,
          h: guessHeight(block),
        })),
        heights,
        guessHeight,
        BLOCK_GAP,
      );

      for (const block of stacked) placed.push({ ...block, sectionId: section.id });

      const bottom = stacked.length
        ? Math.max(...stacked.map((block) => block.y + block.h))
        : head + 120;

      sheets.push({
        id: section.id,
        title: section.title,
        index,
        x: left,
        y: 0,
        w: width,
        h: bottom + 48,
        head,
      });

      left += width + SHEET_GAP;
    }

    return { sheets, placed };
  }, [sections, heights]);

  const rectOf = useCallback(
    (id: string) => layout.placed.find((block) => block.id === id),
    [layout],
  );

  /* ---- connectors ------------------------------------------------------- */

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];

    for (const section of sections) {
      const mine = layout.placed.filter((block) => block.sectionId === section.id);
      const sheet = layout.sheets.find((one) => one.id === section.id);

      for (const connection of section.connections) {
        const from = rectOf(connection.from);
        const to = rectOf(connection.to);
        if (!from || !to) continue;

        const inTheWay = mine.filter(
          (block) => block.id !== connection.from && block.id !== connection.to,
        );

        out.push({
          from: connection.from,
          to: connection.to,
          label: connection.label,
          kind: connection.kind,
          points: routeAround(from, to, inTheWay, sheet ? sheet.y + sheet.head - 40 : -Infinity),
        });
      }

      /* A section that builds on another gets a thick edge between them. */
      for (const builds of section.buildsOn ?? []) {
        const from = layout.sheets.find((one) => one.id === builds.id);
        const to = layout.sheets.find((one) => one.id === section.id);
        if (!from || !to) continue;
        out.push({
          from: builds.id,
          to: section.id,
          kind: "map",
          label: builds.label,
          points: [
            { x: Math.round(from.x + from.w), y: Math.round(from.y + from.head / 2) },
            { x: Math.round(to.x), y: Math.round(to.y + to.head / 2) },
          ],
        });
      }
    }

    return out;
  }, [sections, layout, rectOf]);

  const bounds = useMemo(
    () => boundsOf(layout.sheets.length ? layout.sheets : [{ x: 0, y: 0, w: 800, h: 600 }]),
    [layout],
  );

  /* ---- the walkthrough -------------------------------------------------- */

  /* One stop per block that has something said about it, in drawn order. */
  const stops = useMemo<Stop[]>(
    () =>
      layout.placed.flatMap((block) => {
        const say = narration.get(block.id);
        return say ? [{ id: block.id, say }] : [];
      }),
    [layout.placed, narration],
  );

  const tour = useTour(stops, stops.length > 0, undefined, undefined, autoplay);
  const [muted, setMuted] = useState(false);

  /* Fly to the stop being talked about, unless the person has taken over. */
  useEffect(() => {
    if (!tour.active || !tour.stop) return;
    const rect = rectOf(tour.stop.id);
    if (!rect) return;
    camera.flyTo(rect, viewport, { fill: 0.56, maxZoom: 1.25 });
  }, [tour.active, tour.stop, tour.byHand, rectOf, camera, viewport]);

  /* Open on the whole board, so the shape is seen before the detail. */
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || !layout.sheets.length || viewport.w < 2) return;
    framed.current = true;
    camera.fit(bounds, viewport, 72);
  }, [bounds, camera, layout.sheets.length, viewport]);

  const fit = useCallback(() => {
    camera.release();
    camera.fit(bounds, viewport, 72);
  }, [bounds, camera, viewport]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "f" && !event.metaKey && !event.ctrlKey) fit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fit]);

  /* ---- what the person adds --------------------------------------------- */

  const [draft, setDraft] = useState<{ x: number; y: number; id?: string; body?: string } | null>(
    null,
  );

  const near = useCallback(
    (at: Point) =>
      marks.ink.find((stroke) =>
        stroke.points.some((point) => Math.hypot(point.x - at.x, point.y - at.y) < 18),
      ) ??
      marks.notes.find(
        (note) => Math.abs(note.x - at.x) < 140 && Math.abs(note.y - at.y) < 90,
      ),
    [marks],
  );

  const tools = useTools(camera, {
    onInk: (points) =>
      onAnnotate?.({ t: "ink", id: `i${Date.now().toString(36)}`, points }),
    onNote: (at) => setDraft({ x: Math.round(at.x), y: Math.round(at.y) }),
    onErase: (at) => {
      const hit = near(at);
      if (hit) onAnnotate?.({ t: "erase", id: hit.id });
    },
    onLasso: (points) => {
      const box = {
        x: Math.min(...points.map((p) => p.x)),
        y: Math.min(...points.map((p) => p.y)),
        w: Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
        h: Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
      };
      const inside = layout.placed
        .filter(
          (block) =>
            block.x < box.x + box.w &&
            block.x + block.w > box.x &&
            block.y < box.y + box.h &&
            block.y + block.h > box.y,
        )
        .map((block) => block.id);
      onAsk?.({ points, blocks: inside });
    },
  });

  /* ---- what the cursor is doing ----------------------------------------- */

  const toScreen = useCallback(
    (at: Point) => {
      const now = camera.read();
      return { x: (at.x - now.x) * now.z, y: (at.y - now.y) * now.z };
    },
    [camera],
  );

  const held = tour.stop ? rectOf(tour.stop.id) : null;
  const cursorTarget = held
    ? { x: held.x + held.w - 18, y: held.y + 20, label: undefined }
    : null;

  const spotlight = looking?.region ?? (held ? { x: held.x, y: held.y, w: held.w, h: held.h } : null);

  return (
    <div className="ck-board" ref={shell} style={{ position: "absolute", inset: 0 }}>
      <Surface
        camera={camera}
        tool={tools.tool}
        toolHandlers={tools.handlers}
        onTap={({ block }) => {
          if (!block) return;
          const at = stops.findIndex((stop) => stop.id === block);
          if (at >= 0) tour.go(at, true);
        }}
        overlay={
          <>
            <div className="ck-hud">
              <span>{title ?? "Board"}</span>
              {sections.length ? (
                <span>
                  {sections.length} section{sections.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            <Tools tool={tools.tool} onPick={tools.setTool} />

            {tour.stop && tour.live && !muted ? (
              <div className="ck-say-dock">
                <Note>{tour.stop.say}</Note>
              </div>
            ) : null}

            {stops.length ? (
              <TourControls
                index={tour.index}
                count={tour.count}
                playing={tour.playing}
                held={tour.held}
                onPrev={tour.prev}
                onNext={tour.next}
                onToggle={tour.toggle}
                muted={muted}
                onToggleMute={() => setMuted((on) => !on)}
                onFit={fit}
                draw={{
                  on: tools.tool === "pen",
                  toggle: () => tools.setTool(tools.tool === "pen" ? "pointer" : "pen"),
                }}
              />
            ) : null}

            <button type="button" className="ck-fit" onClick={fit} aria-label="Show the whole board">
              <TourMark mark="fit" size={22} />
            </button>

            <Cursor
              mode={tour.active && cursorTarget ? "placing" : "hidden"}
              target={cursorTarget}
              toScreen={toScreen}
            />
          </>
        }
      >
        {layout.sheets.map((sheet) => (
          <div
            key={sheet.id}
            className="ck-sheet-head"
            data-sheet={sheet.id}
            ref={observe(`sheet:${sheet.id}`)}
            style={{ transform: `translate(${sheet.x}px, ${sheet.y}px)`, width: sheet.w, opacity: 1 }}
          >
            <span className="ck-sheet-num">{sheet.index + 1}</span>
            <h2 className="ck-sheet-title">{sheet.title}</h2>
          </div>
        ))}

        <Connectors
          edges={edges}
          width={Math.max(1, Math.round(bounds.x + bounds.w + 400))}
          height={Math.max(1, Math.round(bounds.y + bounds.h + 400))}
        />

        {layout.placed.map((block) => {
          const section = sections.find((one) => one.id === block.sectionId);
          const source = section?.blocks.find((one) => one.id === block.id);
          if (!source) return null;

          return (
            <BlockFrame
              key={block.id}
              id={block.id}
              x={block.x}
              y={block.y}
              w={block.w}
              h={source.h ?? 0}
              measure={observe(block.id)}
              held={tour.stop?.id === block.id}
              dim={!!tour.stop && tour.live && tour.stop.id !== block.id}
            >
              <BlockCard block={source} />
            </BlockFrame>
          );
        })}

        {spotlight ? <TourSpotlight rect={spotlight} /> : null}

        <Annotations
          ink={marks.ink}
          notes={marks.notes}
          drawing={tools.drawing}
          width={Math.max(1, Math.round(bounds.x + bounds.w + 400))}
          height={Math.max(1, Math.round(bounds.y + bounds.h + 400))}
          editing={draft?.id ?? null}
          onEditNote={(id) => {
            const note = marks.notes.find((one) => one.id === id);
            if (note) setDraft({ x: note.x, y: note.y, id, body: note.body });
          }}
        />

        {draft ? (
          <NoteDraft
            x={draft.x}
            y={draft.y}
            body={draft.body}
            onDone={(body) => {
              const kept = body?.trim();
              if (kept) {
                /* Editing replaces: rub the old one out, write the new one. */
                if (draft.id) onAnnotate?.({ t: "erase", id: draft.id });
                onAnnotate?.({
                  t: "note",
                  id: `n${Date.now().toString(36)}`,
                  x: draft.x,
                  y: draft.y,
                  body: kept,
                });
              } else if (body !== null && draft.id) {
                onAnnotate?.({ t: "erase", id: draft.id });
              }
              setDraft(null);
            }}
          />
        ) : null}

        {!sections.length ? (
          <div className="ck-blank" style={{ width: viewport.w, height: viewport.h }}>
            <span className="ck-blank-lead">Nothing on this board yet.</span>
            <span className="ck-blank-sub">Ask chalk something, and it draws here.</span>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}

export type { Section };
