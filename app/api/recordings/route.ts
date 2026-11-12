import { newRecording, recordings, summarise } from "@/lib/server/recordings";

export async function GET() {
  const list = [...recordings.values()]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .map(summarise);

  return Response.json({ recordings: list });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const recording = newRecording(body);
  return Response.json({ recording: summarise(recording) }, { status: 201 });
}
