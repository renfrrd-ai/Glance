import { boards, keepBoard, standInBoard, summarise } from "@/lib/server/boards";
import { canWrite, writeBoard } from "@/lib/server/write-board";
import type { Profile } from "@/lib/profile";

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
  const origin = body.origin === "spatial" ? "spatial" : "whiteboard";

  if (topic.length < 2)
    return Response.json({ message: "Say what to draw a board about." }, { status: 400 });

  /*
   * The profile comes from the client because that is where it lives — in the
   * Mac app's own store, or in this browser (lib/prefs.ts). It only ever
   * steers how the board is written, so a missing or odd one costs nothing.
   */
  const profile: Profile | undefined =
    body.profile && typeof body.profile === "object" ? body.profile : undefined;

  /* No key configured: hand back the stand-in rather than an error page, and
   * say so, so this is obviously a seam and not a mysterious board. */
  if (!canWrite()) {
    const board = standInBoard(topic, origin);
    return Response.json(
      {
        board: summarise(board),
        drawn: false,
        message: "Set ANTHROPIC_API_KEY to have chalk draw this one itself.",
      },
      { status: 201 },
    );
  }

  const written = await writeBoard(topic, profile);
  if (!written.ok) return Response.json({ message: written.why }, { status: written.status });

  const board = keepBoard(written.events, origin);
  return Response.json({ board: summarise(board), drawn: true }, { status: 201 });
}
