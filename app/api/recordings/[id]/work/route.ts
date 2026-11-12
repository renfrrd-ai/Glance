import { recordings } from "@/lib/server/recordings";

/*
 * Write the recording up once it has ended.
 *
 * The client sends what chalk knows about this person's words, because the
 * writing-up has to get their course codes and names right too. The real one
 * turns the transcript into notes; here it only records that it was asked.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = recordings.get(id);
  if (!recording) return Response.json({ message: "No recording with that id." }, { status: 404 });

  await request.json().catch(() => ({}));
  recording.working = true;

  return Response.json({ ok: true });
}
