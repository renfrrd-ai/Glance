import { state } from "@/lib/server/store";

export async function GET() {
  return Response.json(state.setup);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  /* "Set up again" clears what was recorded, so the steps are live once more. */
  if (body.again) state.setup = {};
  if (body.done) state.setup.done = true;
  if (body.dismissed) state.setup.dismissed = true;

  return Response.json(state.setup);
}
