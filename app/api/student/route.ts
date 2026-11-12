export async function POST(request: Request) {
  await request.json().catch(() => ({}));
  return Response.json({ message: "Checking a student email isn't wired up yet." }, { status: 501 });
}
