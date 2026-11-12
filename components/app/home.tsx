"use client";

/*
 * Home: the one box you type into, and what you were last doing under it.
 *
 * The ask box is the same one as /new rather than a link to it, because the
 * first thing someone wants to do here is ask — making them click through to
 * a second page to type is a step that earns nothing.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SectionIcon } from "@/components/art/section-art";
import { DEFAULT_PROFILE, type Profile } from "@/lib/profile";
import { usePref } from "@/lib/prefs";
import { when } from "@/lib/when";

import { Paper, PaperCard, PaperEmpty, PaperRow } from "./paper";

type BoardSummary = {
  id: string;
  title: string;
  origin: string;
  sectionCount: number;
  createdAt: string;
};

type Course = {
  id: string;
  title: string;
  status: string;
  progress: { done: number; total: number };
  next: { id: string; label: string } | null;
};

export function Home({ boards, courses }: { boards: BoardSummary[]; courses: Course[] }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [asking, setAsking] = useState(false);
  const [profile] = usePref<Profile>("profile", DEFAULT_PROFILE);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  /* A question handed over from the Mac app lands here too. */
  useEffect(() => {
    try {
      const handed = sessionStorage.getItem("chalk.ask");
      if (handed) {
        setTopic(handed);
        sessionStorage.removeItem("chalk.ask");
      }
    } catch {
      /* private window */
    }
  }, []);

  const draw = async () => {
    const asked = topic.trim();
    if (asked.length < 2) return;

    setAsking(true);
    setProblem(null);

    const result = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
      body: JSON.stringify({ topic: asked, profile }),
    })
      .then(async (response) => ({ ok: response.ok, data: await response.json().catch(() => ({})) }))
      .catch(() => ({ ok: false, data: { message: "chalk couldn't be reached." } }));

    if (!result.ok || !result.data?.board?.id) {
      setAsking(false);
      setProblem(String(result.data?.message ?? "That didn't work."));
      return;
    }

    /* A board chalk didn't write says so, rather than passing itself off. */
    if (result.data.drawn === false && result.data.message)
      try {
        sessionStorage.setItem("chalk.board-note", String(result.data.message));
      } catch {
        /* private window */
      }

    router.push(`/board/${result.data.board.id}`);
  };

  return (
    <Paper art="home" title="What are we learning?" lede="Ask about anything, and chalk draws it out.">
      <div className="pa-ask">
        <textarea
          ref={box}
          value={topic}
          maxLength={14000}
          placeholder="Ask about anything — or paste what you're stuck on."
          aria-label="What to learn"
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void draw();
            }
          }}
        />
        <div className="pa-ask-row">
          <p className="pa-ask-note">{problem ?? "Enter to draw it. Shift-Enter for a new line."}</p>
          <button
            type="button"
            className="pa-btn"
            data-variant="primary"
            aria-disabled={asking || topic.trim().length < 2}
            onClick={() => void draw()}
          >
            {asking ? "Drawing…" : "Draw it"}
          </button>
        </div>
      </div>

      {courses.length ? (
        <PaperCard>
          {courses.map((course) => (
            <PaperRow
              key={course.id}
              href={course.next ? `/learn/${course.id}/${course.next.id}` : `/learn/${course.id}`}
              lead={<SectionIcon id="learn" size={22} />}
              title={course.title}
              help={
                course.status === "outlining"
                  ? "Planning…"
                  : `${course.progress.done} of ${course.progress.total} classes done`
              }
              side={course.next ? "Continue" : "Open"}
            />
          ))}
        </PaperCard>
      ) : null}

      {boards.length ? (
        <PaperCard>
          {boards.map((board) => (
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
        <PaperEmpty>Nothing yet — ask something above and chalk draws you a board.</PaperEmpty>
      )}
    </Paper>
  );
}
