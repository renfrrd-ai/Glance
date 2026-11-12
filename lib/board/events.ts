/*
 * A board is an append-only list of events, not a document.
 *
 * chalk writes the board while it talks, so the thing being saved is the
 * sequence in which it happened: open a section, add a block, say a line,
 * connect two blocks, look at one. That sequence is what the walkthrough
 * replays, what a late joiner catches up on, and what an edit appends to.
 *
 * Reading it is projection: `project` folds the events into the sections and
 * blocks to draw, and the other functions here pull out one view each.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type Block = {
  id: string;
  /** What to draw: see components/board/block.tsx. */
  kind: string;
  x: number;
  y: number;
  w: number;
  /** A starting height; what is drawn may be taller, and is measured. */
  h?: number;
  props?: Record<string, unknown>;
};

export type Connection = {
  from: string;
  to: string;
  label?: string;
  /** "map" edges are the thick ones between sections. */
  kind?: "map" | string;
};

export type Section = {
  id: string;
  title: string;
  layout?: string;
  icon?: string;
  blocks: Block[];
  connections: Connection[];
  /** Sections this one follows from. */
  buildsOn?: { id: string; label?: string }[];
};

export type Ink = { id: string; points: Point[]; colour?: string };
export type StickyNote = { id: string; x: number; y: number; body: string; tone?: string };

export type Focus = {
  id: string;
  blockIds?: string[];
  stroke?: string;
  reason?: string;
  region?: Rect;
};

export type Asked = {
  id: string;
  at: string | number;
  question: string;
  answer?: string;
  quote?: string;
  about?: string;
  answeredIn?: string;
};

export type BoardEvent =
  | { t: "title"; text: string }
  | {
      t: "section_open";
      id: string;
      title: string;
      layout?: string;
      icon?: string;
      buildsOn?: { id: string; label?: string }[];
    }
  | { t: "block_add"; sectionId: string; block: Block }
  | { t: "block_update"; blockId: string; props: Record<string, unknown> }
  | { t: "connect"; sectionId: string; connection: Connection }
  | { t: "narrate"; text: string; blockId?: string }
  | { t: "focus"; id: string; blockIds?: string[]; stroke?: string; reason?: string; region?: Rect }
  | { t: "blur" }
  | { t: "ink"; id: string; points: Point[]; colour?: string }
  | { t: "note"; id: string; x: number; y: number; body: string; tone?: string }
  | { t: "erase"; id: string }
  | {
      t: "asked";
      id: string;
      at: string | number;
      question: string;
      answer?: string;
      quote?: string;
      sectionId?: string;
      drawnIn?: string;
    };

/** The sections to draw, in the order they were opened. */
export function project(events: BoardEvent[]): Section[] {
  const order: string[] = [];
  const sections = new Map<string, Section>();

  for (const event of events)
    switch (event.t) {
      case "section_open": {
        /* Re-opening a section carries on with it rather than starting again. */
        if (sections.has(event.id)) break;
        const builds = (event.buildsOn ?? []).filter(
          (one) => sections.has(one.id) && one.id !== event.id,
        );
        sections.set(event.id, {
          id: event.id,
          title: event.title,
          layout: event.layout,
          blocks: [],
          connections: [],
          ...(event.icon ? { icon: event.icon } : {}),
          ...(builds.length ? { buildsOn: builds } : {}),
        });
        order.push(event.id);
        break;
      }

      case "block_add": {
        const section = sections.get(event.sectionId);
        if (section && !section.blocks.some((block) => block.id === event.block.id))
          section.blocks.push(event.block);
        break;
      }

      case "connect": {
        const section = sections.get(event.sectionId);
        if (section) section.connections.push(event.connection);
        break;
      }

      case "block_update":
        for (const section of sections.values()) {
          const block = section.blocks.find((one) => one.id === event.blockId);
          if (block) {
            block.props = { ...block.props, ...event.props };
            break;
          }
        }
        break;
    }

  return order.map((id) => sections.get(id) as Section);
}

/** The board's title: the last one it was given. */
export function boardTitle(events: BoardEvent[]) {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.t === "title" && event.text.trim()) return event.text.trim();
  }
  return null;
}

/** What the person drew and wrote on top, minus whatever they rubbed out. */
export function annotations(events: BoardEvent[]) {
  const erased = new Set(events.flatMap((event) => (event.t === "erase" ? [event.id] : [])));

  return {
    ink: events.flatMap((event) =>
      event.t !== "ink" || erased.has(event.id)
        ? []
        : [{ id: event.id, points: event.points, colour: event.colour }],
    ),
    notes: events.flatMap((event) =>
      event.t !== "note" || erased.has(event.id)
        ? []
        : [{ id: event.id, x: event.x, y: event.y, body: event.body, tone: event.tone }],
    ),
  };
}

/** What chalk is looking at right now, if anything. */
export function focusOf(events: BoardEvent[]): Focus | null {
  let focus: Focus | null = null;
  for (const event of events) {
    if (event.t === "focus")
      focus = {
        id: event.id,
        blockIds: event.blockIds,
        stroke: event.stroke,
        reason: event.reason,
        region: event.region,
      };
    else if (event.t === "blur") focus = null;
  }
  return focus;
}

/**
 * What is said at each block.
 *
 * Narration mostly arrives before the block it is about — chalk says what it
 * is about to draw, then draws it — so lines are held until the next block
 * appears. A line that names its own block wins over that guess.
 */
export function narrationByBlock(events: BoardEvent[]) {
  const byBlock = new Map<string, string>();
  const named = new Map<string, string>();
  let waiting: string[] = [];
  let last: string | null = null;

  for (const event of events) {
    if (event.t === "narrate" && event.blockId) {
      named.set(event.blockId, event.text);
      continue;
    }
    if (event.t === "narrate") {
      /* A first line with nothing waiting belongs to the block just drawn. */
      if (waiting.length === 0 && last && !byBlock.has(last)) byBlock.set(last, event.text);
      else waiting.push(event.text);
      continue;
    }
    if (event.t === "block_add") {
      if (waiting.length > 0) {
        byBlock.set(event.block.id, waiting.join(" "));
        waiting = [];
      }
      last = event.block.id;
    }
  }

  for (const [blockId, text] of named) byBlock.set(blockId, text);
  return byBlock;
}

/** Everything asked of this board, with what it was answered with. */
export function questionsOf(events: BoardEvent[]): Asked[] {
  const asked: Asked[] = [];
  const sections = new Set(
    events.flatMap((event) => (event.t === "section_open" ? [event.id] : [])),
  );
  const seen = new Set<string>();

  for (const event of events) {
    if (event.t !== "asked" || seen.has(event.id)) continue;
    seen.add(event.id);

    /* Only point at the section the answer was drawn in if it still exists. */
    const drawnIn = event.drawnIn && sections.has(event.drawnIn) ? event.drawnIn : undefined;

    asked.push({
      id: event.id,
      at: event.at,
      question: event.question,
      ...(event.answer ? { answer: event.answer } : {}),
      ...(event.quote ? { quote: event.quote } : {}),
      ...(event.sectionId ? { about: event.sectionId } : {}),
      ...(drawnIn ? { answeredIn: drawnIn } : {}),
    });
  }

  return asked;
}
