import { boards, newBoard, summarise } from "@/lib/server/boards";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const list = [...boards.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.max(1, Math.min(500, limit)))
    .map(summarise);

  return Response.json({ boards: list });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";

  if (topic.length < 2)
    return Response.json({ message: "Say what to draw a board about." }, { status: 400 });

  const board = newBoard(topic, body.origin === "spatial" ? "spatial" : "whiteboard");
  return Response.json({ board: summarise(board) }, { status: 201 });
}
