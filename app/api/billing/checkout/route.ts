export async function POST(request: Request) {
  await request.json().catch(() => ({}));
  return Response.json({ message: "Starting a checkout isn't wired up yet." }, { status: 501 });
}
