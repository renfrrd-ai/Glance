import { boards, summarise } from "@/lib/server/boards";
import { state } from "@/lib/server/store";
import { Home } from "@/components/app/home";

import "@/styles/paper.css";

export const dynamic = "force-dynamic";

export default function Learn() {
  const recent = [...boards.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 6)
    .map(summarise);

  return <Home boards={recent} courses={state.courses} />;
}
