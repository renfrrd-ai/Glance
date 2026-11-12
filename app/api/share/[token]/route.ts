import { state } from "@/lib/server/store";

export async function DELETE(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  state.shares = state.shares.filter((share) => share.token !== token);
  return Response.json({ ok: true, shares: state.shares });
}
