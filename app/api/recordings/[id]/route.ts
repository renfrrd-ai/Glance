import { recordings, summarise } from "@/lib/server/recordings";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = recordings.get(id);
  if (!recording) return Response.json({ message: "No recording with that id." }, { status: 404 });

  return Response.json({
    recording: summarise(recording),
    transcript: recording.transcript,
    notes: recording.notes,
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  recordings.delete(id);
  return Response.json({ ok: true });
}
