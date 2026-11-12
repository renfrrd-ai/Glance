import { state } from "@/lib/server/store";

const body = () => ({ facts: state.memory, off: state.memoryOff, history: [] });

export async function GET() {
  return Response.json(body());
}

export async function POST(request: Request) {
  const sent = await request.json().catch(() => ({}));

  if (typeof sent.off === "boolean") state.memoryOff = sent.off;

  const texts: string[] = Array.isArray(sent.texts)
    ? sent.texts.filter((text: unknown) => typeof text === "string")
    : typeof sent.text === "string"
      ? [sent.text]
      : [];

  for (const text of texts)
    state.memory.unshift({
      id: `m${Date.now().toString(36)}${state.memory.length}`,
      text: text.slice(0, 400),
      kind: "told",
      seen: new Date().toISOString(),
    });

  return Response.json(body());
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id) state.memory = state.memory.filter((fact) => fact.id !== id);
  else state.memory = [];
  return Response.json(body());
}
