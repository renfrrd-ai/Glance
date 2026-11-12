/*
 * Boards, in the development store.
 *
 * A board is its event list plus a little about it for the Library. Saving an
 * annotation appends an event — boards are never rewritten, only added to.
 */

import { boardTitle, project, type BoardEvent } from "@/lib/board/events";
import { sampleBoard } from "./sample-board";

export type StoredBoard = {
  id: string;
  /** Where it came from: a question about the screen, or a topic. */
  origin: "spatial" | "whiteboard";
  createdAt: string;
  events: BoardEvent[];
};

const kept = globalThis as typeof globalThis & { __chalkBoards?: Map<string, StoredBoard> };

export const boards: Map<string, StoredBoard> =
  kept.__chalkBoards ?? (kept.__chalkBoards = new Map());

/* One board to open on a fresh start, so the board is something to look at
 * rather than an empty sheet with a "nothing here" message. */
if (boards.size === 0) {
  const id = "sample";
  boards.set(id, {
    id,
    origin: "whiteboard",
    createdAt: new Date().toISOString(),
    events: sampleBoard(),
  });
}

/** What the Library lists. */
export const summarise = (board: StoredBoard) => ({
  id: board.id,
  title: boardTitle(board.events) ?? "Untitled board",
  origin: board.origin,
  sectionCount: project(board.events).length,
  createdAt: board.createdAt,
});

export function newBoard(topic: string, origin: StoredBoard["origin"] = "whiteboard") {
  const id = `b${Date.now().toString(36)}`;
  const board: StoredBoard = {
    id,
    origin,
    createdAt: new Date().toISOString(),
    /* The real chalk writes these as it thinks; here the sample stands in, so
     * the rest of the board — layout, routing, the walkthrough — is exercised. */
    events: sampleBoard(topic),
  };
  boards.set(id, board);
  return board;
}
