import { state } from "@/lib/server/store";

export async function GET(request: Request) {
  const n = Number(new URL(request.url).searchParams.get("n") ?? 20);
  return Response.json({ rows: state.timings.slice(0, Math.max(1, Math.min(200, n))) });
}
