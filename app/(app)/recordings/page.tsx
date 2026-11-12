import { recordings, summarise } from "@/lib/server/recordings";
import { RecordingsPage } from "@/components/recorder/recordings-page";

import "@/styles/paper.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recordings" };

export default function Recordings() {
  const list = [...recordings.values()]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .map(summarise);

  return <RecordingsPage initial={list} />;
}
