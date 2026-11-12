import { state } from "@/lib/server/store";

export async function GET() {
  return Response.json({ shares: state.shares });
}
