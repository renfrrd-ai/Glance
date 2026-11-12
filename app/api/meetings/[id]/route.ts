import { recordings } from "@/lib/server/recordings";

/** Polled while recording, for the transcript as it comes back. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = recordings.get(id);
  if (!recording) return Response.json({ message: "No recording with that id." }, { status: 404 });

  return Response.json({ meeting: { id, transcript: recording.transcript } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = recordings.get(id);
  if (!recording) return Response.json({ message: "No recording with that id." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  if (body.ended && !recording.endedAt) recording.endedAt = new Date().toISOString();

  return Response.json({ ok: true });
}
