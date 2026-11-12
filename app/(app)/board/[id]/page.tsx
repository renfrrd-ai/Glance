import { notFound } from "next/navigation";

import { BoardPage } from "@/components/board/board-page";
import { boards } from "@/lib/server/boards";
import { boardTitle } from "@/lib/board/events";

import "@/styles/board.css";
import "@/styles/board-theme.css";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const board = boards.get(id);
  return { title: board ? (boardTitle(board.events) ?? "Board") : "Board" };
}

export default async function Board({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const board = boards.get(id);
  if (!board) notFound();

  /* The events are sent whole: the board is a projection of them, and the
   * client needs all of them to replay the walkthrough anyway. */
  return <BoardPage id={id} events={board.events} />;
}
