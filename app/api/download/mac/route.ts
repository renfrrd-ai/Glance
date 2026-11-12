export async function GET() {
  return Response.json({ message: "The Mac build isn't published from here yet." }, { status: 501 });
}
