/*
 * Reading from a connected app.
 *
 * This runs on the server because a browser cannot open an MCP connection, and
 * because a local server has to be spawned on the machine chalk runs on. It is
 * read-only by design: probe, list, read, and nothing that could change
 * anything in the app at the other end.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  if (!["probe", "resources", "read"].includes(action))
    return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });

  return Response.json(
    { error: "Connecting to apps isn't wired up yet." },
    { status: 501 },
  );
}
