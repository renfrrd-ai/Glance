"use client";

/*
 * Asking for a board.
 *
 * A question typed here, or handed over from the Mac app through
 * sessionStorage — "teach me this" about something on screen puts the text
 * there and opens this page.
 */

import { useEffect, useRef, useState } from "react";

import { Paper } from "./paper";

const STARTERS = [
  "How a transformer reads a sentence",
  "Why interest rates move currencies",
  "The citric acid cycle, in one pass",
  "What a Kalman filter actually does",
];

export function NewBoard() {
  const [topic, setTopic] = useState("");
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  /* Anything handed over from the Mac app, or from a lasso on a board. */
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
    box.current?.focus();
  }, []);

  const draw = async () => {
    const asked = topic.trim();
    if (asked.length < 2) return;

    setAsking(true);
    setProblem(null);

    const result = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
      body: JSON.stringify({ topic: asked }),
    })
      .then(async (response) => ({ ok: response.ok, data: await response.json().catch(() => ({})) }))
      .catch(() => ({ ok: false, data: { message: "chalk couldn't be reached." } }));

    if (!result.ok || !result.data?.board?.id) {
      setAsking(false);
      setProblem(String(result.data?.message ?? "That didn't work."));
      return;
    }

    window.location.href = `/board/${result.data.board.id}`;
  };

  return (
    <Paper
      art="boards"
      title="What do you want to understand?"
      lede="Say it the way you'd say it out loud. chalk draws a board and walks you through it."
    >
      <div className="pa-ask">
        <textarea
          ref={box}
          value={topic}
          maxLength={14000}
          placeholder="Ask about anything — or paste what you're stuck on."
          aria-label="What to draw a board about"
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={(event) => {
            /* Enter sends; Shift-Enter is a new line, since some of these are
             * a pasted paragraph rather than a question. */
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void draw();
            }
          }}
        />

        <div className="pa-ask-row">
          <p className="pa-ask-note">
            {problem ?? "Enter to draw it. Shift-Enter for a new line."}
          </p>
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

      <div className="pa-chips">
        {STARTERS.map((starter) => (
          <button type="button" className="pa-chip" key={starter} onClick={() => setTopic(starter)}>
            {starter}
          </button>
        ))}
      </div>
    </Paper>
  );
}
