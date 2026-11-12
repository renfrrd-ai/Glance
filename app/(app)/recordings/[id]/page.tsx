import { notFound } from "next/navigation";

import { Paper, PaperCard, PaperEmpty } from "@/components/app/paper";
import { recordings } from "@/lib/server/recordings";
import { when } from "@/lib/when";

import "@/styles/paper.css";

export const dynamic = "force-dynamic";

const clock = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: recordings.get(id)?.title ?? "Recording" };
}

export default async function Recording({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recording = recordings.get(id);
  if (!recording) notFound();

  const length = recording.transcript.length
    ? recording.transcript[recording.transcript.length - 1].at
    : 0;

  return (
    <Paper
      art="recordings"
      title={recording.title}
      lede={`${recording.kind === "class" ? "Class" : "Conversation"} · ${when(recording.startedAt)}${
        recording.endedAt ? ` · ${clock(length)}` : " · still going"
      }`}
      actions={
        <a className="pa-btn" href="/recordings">
          All recordings
        </a>
      }
    >
      {recording.notes ? (
        <PaperCard>
          <div className="rc-notes">{recording.notes}</div>
        </PaperCard>
      ) : recording.endedAt ? (
        <p className="pa-ask-note" style={{ maxWidth: 880, margin: "0 auto 18px" }}>
          {recording.working
            ? "chalk has this one to write up — that part isn't wired up yet, so the transcript is what there is."
            : "Not written up."}
        </p>
      ) : null}

      {recording.transcript.length ? (
        <PaperCard>
          {recording.transcript.map((line, i) => (
            <div className="rc-line" key={`${line.at}-${i}`}>
              <span className="rc-line-at">{clock(line.at)}</span>
              <span className="rc-line-who">{line.source}</span>
              <span className="rc-line-text">{line.text}</span>
            </div>
          ))}
        </PaperCard>
      ) : (
        <PaperEmpty>Nothing was written down from this one.</PaperEmpty>
      )}
    </Paper>
  );
}
