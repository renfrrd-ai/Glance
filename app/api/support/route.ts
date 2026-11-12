import { state } from "@/lib/server/store";

export async function GET() {
  return Response.json({ reports: state.reports });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (message.length < 3)
    return Response.json({ message: "Say what happened, in a few words." }, { status: 400 });

  state.reports.unshift({
    id: `r${Date.now().toString(36)}`,
    status: "open",
    at: new Date().toISOString(),
    message: message.slice(0, 2000),
  });

  return Response.json({ ok: true, reports: state.reports });
}
