export async function POST(request: Request) {
  await request.json().catch(() => ({}));
  return Response.json({ message: "Cancelling a plan isn't wired up yet." }, { status: 501 });
}
