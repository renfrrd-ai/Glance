export async function POST(request: Request) {
  await request.json().catch(() => ({}));
  return Response.json({ message: "Opening the billing portal isn't wired up yet." }, { status: 501 });
}
