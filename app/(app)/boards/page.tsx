import { boards, summarise } from "@/lib/server/boards";
import { when } from "@/lib/when";
import { Paper, PaperCard, PaperEmpty, PaperRow } from "@/components/app/paper";
import { SectionIcon } from "@/components/art/section-art";

import "@/styles/paper.css";

export const dynamic = "force-dynamic";

export default function Boards() {
  const list = [...boards.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map(summarise);

  return (
    <Paper
      art="boards"
      title="Boards"
      lede="Everything chalk has drawn for you — from a topic, or from something on your screen."
      actions={
        <a className="pa-btn" data-variant="primary" href="/new">
          New board
        </a>
      }
    >
      {list.length ? (
        <PaperCard>
          {list.map((board) => (
            <PaperRow
              key={board.id}
              href={`/board/${board.id}`}
              lead={<SectionIcon id={board.origin === "spatial" ? "screen" : "pen"} size={22} />}
              title={board.title}
              help={board.sectionCount === 1 ? "1 section" : `${board.sectionCount} sections`}
              side={when(board.createdAt)}
            />
          ))}
        </PaperCard>
      ) : (
        <PaperEmpty>No boards yet. Ask chalk something, or start one from a topic.</PaperEmpty>
      )}
    </Paper>
  );
}
