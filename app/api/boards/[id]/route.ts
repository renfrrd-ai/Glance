import { boards, summarise } from "@/lib/server/boards";
import type { BoardEvent } from "@/lib/board/events";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const board = boards.get(id);
  if (!board) return Response.json({ message: "No board with that id." }, { status: 404 });
  return Response.json({ board: summarise(board), events: board.events });
}

/* Appending, never rewriting: an annotation is one more event on the end. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const board = boards.get(id);
  if (!board) return Response.json({ message: "No board with that id." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const events: BoardEvent[] = Array.isArray(body.events) ? body.events : body.event ? [body.event] : [];
  if (!events.length) return Response.json({ message: "Nothing to add." }, { status: 400 });

  board.events.push(...events);
  return Response.json({ ok: true, count: board.events.length });
}
