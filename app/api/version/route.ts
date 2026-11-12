import { BUILD } from "@/lib/server/store";

/* Polled by the control center: a change here means a deploy happened, and the
 * next navigation should reload rather than fetch chunks that are gone. */
export async function GET() {
  return Response.json({ build: BUILD });
}
