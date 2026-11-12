"use client";

/*
 * Library: the courses being worked through, and every board chalk has drawn.
 *
 * `version` goes up whenever the viewer closes, which is the signal to refetch
 * — a board made or finished in the viewer should be in the list behind it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";

import { SectionTile } from "@/components/art/section-art";
import { dayGroup, when } from "@/lib/when";

import { Pane } from "../pane";
import { Btn, Card, Row, Section } from "../primitives";

type Board = {
  id: string;
  title: string;
  /** Where it came from: a question about the screen, or a topic. */
  origin: "spatial" | "whiteboard" | string;
  sectionCount: number;
  createdAt: string | number;
};

type Course = {
  id: string;
  title: string;
  status: "outlining" | string;
  progress: { done: number; total: number };
  next?: { id: string; label: string } | null;
};

export function LibraryPane({
  onOpen,
  version = 0,
}: {
  onOpen: (path: string, title?: string) => void;
  version?: number;
}) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [origin, setOrigin] = useState("all");
  const [query, setQuery] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/study/courses", { headers: { "x-chalk-app": "1" } })
      .then((response) => response.json())
      .then((data) => setCourses(data.courses ?? []))
      .catch(() => {});
  }, [version]);

  const load = useCallback(() => {
    fetch("/api/boards?limit=200")
      .then((response) => response.json())
      .then((data) => {
        if (data.boards) {
          setBoards(data.boards);
          setProblem(null);
        } else setProblem(data.message ?? "Couldn't load your boards.");
      })
      .catch(() => setProblem("Couldn't load your boards."));
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  useEffect(() => {
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  /* Boards by the day they were made — "Today", "Yesterday", then the date. */
  const groups = useMemo(() => {
    const matching = (boards ?? []).filter(
      (board) =>
        (origin === "all" || board.origin === origin) &&
        (!query.trim() || board.title.toLowerCase().includes(query.trim().toLowerCase())),
    );

    const days: { label: string; items: Board[] }[] = [];
    for (const board of matching) {
      const label = dayGroup(board.createdAt);
      const day = days.find((one) => one.label === label);
      if (day) day.items.push(board);
      else days.push({ label, items: [board] });
    }
    return days;
  }, [boards, origin, query]);

  return (
    <Pane
      title="Library"
      wide
      lede="Every board chalk has made for you — from a topic, or from your screen."
      actions={
        <>
          <Btn variant="ghost" onClick={() => onOpen("/learn", "Courses")}>
            Courses
          </Btn>
          <Btn variant="primary" icon={Plus} onClick={() => onOpen("/new", "New board")}>
            New board
          </Btn>
        </>
      }
    >
      <Section
        title="Courses"
        desc="What you're learning — classes you come back to, built from a topic or your own files."
      >
        <Card>
          {courses.length ? (
            courses.map((course) => (
              <Row
                key={course.id}
                icon="learn"
                title={course.title}
                help={
                  course.status === "outlining"
                    ? "Planning…"
                    : `${course.progress.done} of ${course.progress.total} classes done${course.next ? ` · next: ${course.next.label}` : ""}`
                }
                side={
                  <Btn
                    size="sm"
                    onClick={() =>
                      onOpen(
                        course.next ? `/learn/${course.id}/${course.next.id}` : `/learn/${course.id}`,
                        course.title,
                      )
                    }
                  >
                    {course.next ? "Continue" : "Open"}
                  </Btn>
                }
              />
            ))
          ) : (
            <Row
              icon="learn"
              title="Learn something new"
              help="Say what you want to learn, or drop in a semester of lecture files."
              side={
                <Btn size="sm" variant="primary" onClick={() => onOpen("/learn", "Courses")}>
                  Start a course
                </Btn>
              }
            />
          )}
        </Card>
      </Section>

      <div className="cc-toolbar">
        <div className="cc-search">
          <Search size={15} />
          <input
            className="cc-input"
            value={query}
            placeholder="Search your boards"
            aria-label="Search your boards"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="cc-seg">
          {["all", "spatial", "whiteboard"].map((one) => (
            <button
              type="button"
              aria-pressed={origin === one}
              onClick={() => setOrigin(one)}
              key={one}
            >
              {one === "all" ? "All" : one === "spatial" ? "From your screen" : "From a topic"}
            </button>
          ))}
        </div>
      </div>

      {problem ? (
        <Card>
          <div className="cc-empty">{problem}</div>
        </Card>
      ) : boards === null ? (
        <Card>
          <div className="cc-empty">Loading your boards…</div>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <div className="cc-empty">
            {boards.length === 0 ? (
              <>
                <SectionTile id="library" size={64} />
                No boards yet. Ask chalk something, or start one from a topic.
              </>
            ) : (
              "Nothing matches."
            )}
          </div>
        </Card>
      ) : (
        groups.map((day) => (
          <div key={day.label}>
            <div className="cc-group-h">{day.label}</div>
            <Card>
              {day.items.map((board) => (
                <Row
                  key={board.id}
                  compact
                  icon={board.origin === "spatial" ? "screen" : "pen"}
                  title={board.title}
                  onClick={() => onOpen(`/board/${board.id}`, board.title)}
                  side={
                    <>
                      <span className="cc-meta">
                        {board.sectionCount === 1 ? "1 section" : `${board.sectionCount} sections`}
                      </span>
                      <span className="cc-meta" style={{ minWidth: 64, textAlign: "right" }}>
                        {when(board.createdAt)}
                      </span>
                      <ChevronRight size={14} color="var(--fg-3)" />
                    </>
                  }
                />
              ))}
            </Card>
          </div>
        ))
      )}
    </Pane>
  );
}
