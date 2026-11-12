export async function POST() {
  /* Nothing to sign out of in development: there is no account yet. */
  return Response.json({ ok: true });
}
