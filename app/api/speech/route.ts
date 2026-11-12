/* Speaking a line: the personality's voice and tone go to the speech model. */
export async function POST(request: Request) {
  await request.json().catch(() => ({}));
  return Response.json({ message: "Speech isn't wired up yet." }, { status: 501 });
}
