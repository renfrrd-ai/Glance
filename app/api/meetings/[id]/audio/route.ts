import { addLine, recordings } from "@/lib/server/recordings";

/*
 * One chunk of audio, written down.
 *
 * The chunk arrives as soon as it closes — mid-recording — with where it sits
 * in the recording, which source it came from, and the words chalk should
 * hear right. The audio is transcribed and dropped; only the words are kept.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = recordings.get(id);
  if (!recording) return Response.json({ message: "No recording with that id." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File))
    return Response.json({ message: "That chunk had no audio in it." }, { status: 400 });

  const at = Number(form?.get("at") ?? 0);
  const source = String(form?.get("source") ?? "room");

  /*
   * Transcription is not wired up, so the chunk is noted rather than written
   * down — the recorder still sees its chunks land, and the transcript shows
   * what it would be filling in.
   */
  addLine(recording, {
    at: Number.isFinite(at) ? at : 0,
    source,
    text: `[${Math.round(audio.size / 1024)}KB of audio — transcription isn't wired up yet]`,
  });

  return Response.json({ ok: true, lines: recording.transcript.length });
}
