"use client";

/*
 * The page a board lives on.
 *
 * It owns the event list — the server's events, plus whatever the person adds
 * — and posts each addition back. Nothing waits on the server: a mark appears
 * the moment it is drawn, and the save is a side effect.
 */

import { useCallback, useState } from "react";

import type { BoardEvent } from "@/lib/board/events";

import { BoardView } from "./board-view";

export function BoardPage({ id, events: initial }: { id: string; events: BoardEvent[] }) {
  const [events, setEvents] = useState(initial);

  const append = useCallback(
    (event: BoardEvent) => {
      setEvents((all) => [...all, event]);
      fetch(`/api/boards/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
        body: JSON.stringify({ event }),
      }).catch(() => {
        /* The mark is already on the board; losing the save is better than
         * taking it back off under the person who just drew it. */
      });
    },
    [id],
  );

  return (
    <BoardView
      events={events}
      onAnnotate={append}
      onAsk={({ blocks }) => {
        /* Circling something is a question about it. Until asking is wired up,
         * hand it to the board's own search rather than swallow it. */
        if (!blocks.length) return;
        window.dispatchEvent(new CustomEvent("chalk:asked", { detail: { board: id, blocks } }));
      }}
    />
  );
}
