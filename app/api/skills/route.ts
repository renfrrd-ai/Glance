import { state } from "@/lib/server/store";

export async function GET() {
  return Response.json({ skills: state.skills });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id) state.skills = state.skills.filter((skill) => skill.id !== id);
  else state.skills = [];
  return Response.json({ skills: state.skills });
}
