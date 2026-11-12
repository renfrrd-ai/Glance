import { state } from "@/lib/server/store";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  return Response.json({ boards: state.boards.slice(0, Math.max(1, Math.min(500, limit))) });
}
