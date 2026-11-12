/*
 * Reading a ChatGPT or Claude export and proposing what to keep. The real one
 * unpacks the archive, reads the person's own messages and summarises; nothing
 * about the chats themselves is ever stored.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File))
    return Response.json({ message: "Pick the .zip from your export." }, { status: 400 });

  return Response.json(
    { message: "Reading an export isn't wired up yet." },
    { status: 501 },
  );
}
