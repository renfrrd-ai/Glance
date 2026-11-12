/*
 * What chalk writes, and how it becomes a board.
 *
 * The shape asked for (DrawnBoard) is deliberately flatter than the board's
 * own events: the events are a union, and asking a model to pick a variant per
 * item invites near-misses, while a list of sections each holding blocks is
 * one thing to get right. `toEvents` does the rest, and owns the ordering
 * rules the board model depends on.
 *
 * Kept apart from lib/server/write-board.ts, which holds the API call, so this
 * — the part with the rules in it — can be tested without a key.
 */

import { z } from "zod";

import type { Block, BoardEvent } from "./events";

/* ---- what we ask for -------------------------------------------------- */

/*
 * A flat shape on purpose. The board's own events are a union, and asking a
 * model to pick a variant per item invites near-misses; a list of sections,
 * each holding blocks, is one thing to get right. The events are built from it
 * below, where the ordering rules live.
 */

const BlockKind = z.enum([
  "text",
  "term",
  "steps",
  "bullets",
  "formula",
  "code",
  "quote",
  "table",
  "example",
  "warning",
  "insight",
  "question",
]);

const DrawnBlock = z.object({
  id: z.string().describe("short, lowercase, unique across the whole board, e.g. b1"),
  kind: BlockKind,
  title: z.string().describe("a few words; what this block is"),
  body: z
    .string()
    .describe("the prose, the formula, or the code. Empty when items are used instead."),
  items: z
    .array(z.string())
    .describe("the steps or bullets, in order. Empty for every other kind."),
  say: z
    .string()
    .describe(
      "what chalk says out loud as it draws this block — one or two spoken sentences, not a reading of the block",
    ),
  column: z
    .number()
    .int()
    .describe("0 for the main column, 1 for a block set beside it"),
});

const DrawnConnection = z.object({
  from: z.string().describe("a block id in this section"),
  to: z.string().describe("a block id in this section"),
  label: z.string().describe("two or three words, or empty for no label"),
});

const DrawnSection = z.object({
  id: z.string().describe("short, lowercase, unique, e.g. s1"),
  title: z.string().describe("what this part of the explanation is"),
  blocks: z.array(DrawnBlock),
  connections: z.array(DrawnConnection),
  buildsOn: z
    .string()
    .describe("the id of the section this follows from, or empty for the first one"),
  buildsOnLabel: z.string().describe("two or three words for that link, or empty"),
});

export const DrawnBoard = z.object({
  title: z.string().describe("the board's title — what it explains, in a few words"),
  sections: z.array(DrawnSection),
});

export type Drawn = z.infer<typeof DrawnBoard>;

/* ---- turning what came back into a board ------------------------------ */

/* Blocks are laid out in two columns; the board's own stacking (restack in
 * components/board/surface.tsx) settles the vertical positions from the
 * measured heights, so only the order and the column matter here. */
const COLUMN_X = [40, 500];
const COLUMN_W = [420, 360];

function blockFrom(drawn: Drawn["sections"][number]["blocks"][number], index: number): Block {
  const column = drawn.column === 1 ? 1 : 0;

  const props: Record<string, unknown> = { title: drawn.title };
  if (drawn.body.trim()) props.body = drawn.body.trim();
  if (drawn.items.length) props.items = drawn.items;
  if (drawn.kind === "formula" && drawn.body.trim()) props.latex = drawn.body.trim();
  if (drawn.kind === "term") props.term = drawn.title;

  return {
    id: drawn.id,
    kind: drawn.kind,
    /* y is a hint only: a starting order within the column. */
    x: COLUMN_X[column],
    y: index * 200,
    w: COLUMN_W[column],
    props,
  };
}

/** The drawn board, as the event list the board model reads. */
export function toEvents(drawn: Drawn): BoardEvent[] {
  const events: BoardEvent[] = [{ t: "title", text: drawn.title }];
  const opened = new Set<string>();

  for (const section of drawn.sections) {
    if (opened.has(section.id)) continue;
    opened.add(section.id);

    const builds =
      section.buildsOn && opened.has(section.buildsOn) && section.buildsOn !== section.id
        ? [{ id: section.buildsOn, ...(section.buildsOnLabel ? { label: section.buildsOnLabel } : {}) }]
        : undefined;

    events.push({
      t: "section_open",
      id: section.id,
      title: section.title,
      ...(builds ? { buildsOn: builds } : {}),
    });

    /* Each column counts its own blocks, so two columns do not interleave
     * their starting heights. */
    const placed = [0, 0];
    const ids = new Set<string>();

    for (const block of section.blocks) {
      if (!block.id || ids.has(block.id)) continue;
      ids.add(block.id);

      const column = block.column === 1 ? 1 : 0;
      /* Said before drawn: chalk says what it is about to put up, which is
       * what narrationByBlock expects. */
      if (block.say.trim()) events.push({ t: "narrate", text: block.say.trim() });
      events.push({
        t: "block_add",
        sectionId: section.id,
        block: blockFrom(block, placed[column]++),
      });
    }

    for (const connection of section.connections) {
      /* An arrow to a block that was never drawn would route from nowhere. */
      if (!ids.has(connection.from) || !ids.has(connection.to)) continue;
      if (connection.from === connection.to) continue;
      events.push({
        t: "connect",
        sectionId: section.id,
        connection: {
          from: connection.from,
          to: connection.to,
          ...(connection.label.trim() ? { label: connection.label.trim() } : {}),
        },
      });
    }
  }

  return events;
}
