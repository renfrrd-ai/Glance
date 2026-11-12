export async function POST(request: Request) {
  await request.json().catch(() => ({}));
  return Response.json({ message: "Redeeming a code isn't wired up yet." }, { status: 501 });
}
