import { isPlan } from "@/lib/plans";
import { state, usage } from "@/lib/server/store";

export async function GET() {
  return Response.json(usage());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  /* Looking at the app the way a user sees it. */
  if (typeof body.users === "boolean") state.usersView = body.users;

  /* Wearing a plan's limits for real, or taking them off again. */
  if ("preview" in body) {
    state.preview = body.preview === null ? null : isPlan(body.preview) ? body.preview : null;
    state.period = state.preview === "trial" ? "trial" : "week";
  }

  return Response.json(usage());
}

export async function DELETE() {
  /* Deleting an account is not something a development store should pretend to
   * do: it would report success and leave everything in place. */
  return Response.json(
    { message: "Deleting an account isn't wired up yet." },
    { status: 501 },
  );
}
