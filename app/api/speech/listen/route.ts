/* Writing down what was just read aloud. */
export async function POST(request: Request) {
  await request.formData().catch(() => null);
  return Response.json({ message: "Transcription isn't wired up yet." }, { status: 501 });
}
