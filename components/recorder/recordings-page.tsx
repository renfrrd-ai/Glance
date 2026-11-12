"use client";

/*
 * Recordings: start one, and everything chalk has listened to.
 *
 * While one is running this page is the recording — the meter, the clock, and
 * the words as they come back — because watching the transcript fill in is
 * the only way to know it is actually hearing the room.
 */

import { useEffect, useRef, useState } from "react";

import { Paper, PaperCard, PaperEmpty, PaperRow } from "@/components/app/paper";
import { SectionIcon } from "@/components/art/section-art";
import { LANGUAGES } from "@/lib/profile";
import { when } from "@/lib/when";

import { useRecorder, useRecorderTick } from "./recorder";

type Summary = {
  id: string;
  kind: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  length: number;
  lines: number;
};

const clock = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

/** The level, as a row of bars rather than a number. */
function Meter({ level }: { level: number }) {
  const bars = 16;
  const lit = Math.round(level * bars);

  return (
    <span className="rc-meter" role="img" aria-label={`Input level ${Math.round(level * 100)}%`}>
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} data-on={i < lit || undefined} />
      ))}
    </span>
  );
}

function Running() {
  const recorder = useRecorder();
  const { secs, level } = useRecorderTick();
  const foot = useRef<HTMLDivElement>(null);

  /* Follow the transcript down as it fills in. */
  useEffect(() => {
    foot.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [recorder.lines.length]);

  if (!recorder.live) return null;
  const stopping = recorder.phase === "stopping";

  return (
    <>
      <div className="rc-live" data-stopping={stopping || undefined}>
        <div className="rc-live-head">
          <span className="rc-live-dot" aria-hidden />
          <span className="rc-live-time">{stopping ? "Finishing…" : clock(secs)}</span>
          <Meter level={level} />
          <span className="rc-live-streams">{recorder.live.streams.join(" · ")}</span>
          <button
            type="button"
            className="pa-btn"
            data-variant="primary"
            aria-disabled={stopping}
            onClick={() => void recorder.stop()}
          >
            {stopping ? "Finishing…" : "Stop"}
          </button>
        </div>

        <p className="rc-live-note">
          {recorder.problem
            ? recorder.problem
            : /* Skipped chunks are the feature working, so say so plainly. */
              `${recorder.sent} piece${recorder.sent === 1 ? "" : "s"} written down${
                recorder.skipped ? ` · ${recorder.skipped} skipped as silence` : ""
              }. The audio isn't kept — only the words.`}
        </p>
      </div>

      <PaperCard>
        {recorder.lines.length ? (
          recorder.lines.map((line, i) => (
            <div className="rc-line" key={`${line.at}-${i}`}>
              <span className="rc-line-at">{clock(line.at)}</span>
              <span className="rc-line-who">{line.source}</span>
              <span className="rc-line-text">{line.text}</span>
            </div>
          ))
        ) : (
          <p className="pa-empty" style={{ padding: "28px 0" }}>
            Listening… the words show up here a few seconds behind.
          </p>
        )}
        <div ref={foot} />
      </PaperCard>
    </>
  );
}

function Start({ onStarted }: { onStarted: () => void }) {
  const recorder = useRecorder();
  const [kind, setKind] = useState<"class" | "meeting">("class");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("en");
  const [tab, setTab] = useState(true);

  const starting = recorder.phase === "starting";

  return (
    <div className="pa-ask">
      <div className="rc-start">
        <div className="cc-seg rc-kind" role="radiogroup" aria-label="What to record">
          <button type="button" aria-pressed={kind === "class"} onClick={() => setKind("class")}>
            A class
          </button>
          <button type="button" aria-pressed={kind === "meeting"} onClick={() => setKind("meeting")}>
            A conversation
          </button>
        </div>

        <input
          className="cc-input rc-title"
          value={title}
          maxLength={120}
          placeholder={kind === "class" ? "What class is this?" : "What's this about?"}
          aria-label="What to call it"
          onChange={(event) => setTitle(event.target.value)}
        />

        <select
          className="cc-select"
          value={language}
          aria-label="What language it's in"
          onChange={(event) => setLanguage(event.target.value)}
        >
          {LANGUAGES.map(([code, name]) => (
            <option value={code} key={code}>
              {name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="pa-btn"
          data-variant="primary"
          aria-disabled={starting}
          onClick={async () => {
            const id = await recorder.start({ kind, language, title: title.trim(), tab });
            if (id) onStarted();
          }}
        >
          {starting ? "Starting…" : "Record"}
        </button>
      </div>

      {kind === "meeting" ? (
        <label className="rc-tab">
          <input type="checkbox" checked={tab} onChange={(event) => setTab(event.target.checked)} />
          <span>
            Include the other side — share the call&apos;s tab, with <b>Share tab audio</b> ticked.
          </span>
        </label>
      ) : null}

      <p className="pa-ask-note">
        {recorder.why ? (
          <>
            {recorder.why}{" "}
            <button type="button" className="rc-dismiss" onClick={recorder.dismiss}>
              Dismiss
            </button>
          </>
        ) : kind === "class" ? (
          "chalk listens, writes it down as it goes, and writes it up after. The audio is never kept."
        ) : (
          "Your microphone, and the call's tab if you share it. The audio is never kept — only the words."
        )}
      </p>
    </div>
  );
}

export function RecordingsPage({ initial }: { initial: Summary[] }) {
  const recorder = useRecorder();
  const [list, setList] = useState(initial);

  const reload = () =>
    fetch("/api/recordings", { headers: { "x-chalk-app": "1" } })
      .then((response) => response.json())
      .then((data) => setList(data.recordings ?? []))
      .catch(() => {});

  /* A recording that just finished belongs at the top of the list. */
  useEffect(() => {
    if (recorder.phase === "idle") void reload();
  }, [recorder.phase]);

  const running = recorder.phase === "recording" || recorder.phase === "stopping";

  return (
    <Paper
      art="recordings"
      title={running ? (recorder.live?.title ?? "Recording") : "Recordings"}
      lede={
        running
          ? "chalk is listening. The words appear a few seconds behind."
          : "Classes and conversations chalk has listened to and written up."
      }
    >
      {running ? <Running /> : <Start onStarted={reload} />}

      {!running && list.length ? (
        <PaperCard>
          {list.map((one) => (
            <PaperRow
              key={one.id}
              href={`/recordings/${one.id}`}
              lead={<SectionIcon id="recordings" size={22} />}
              title={one.title}
              help={
                one.endedAt
                  ? `${clock(one.length)} · ${one.lines} line${one.lines === 1 ? "" : "s"}`
                  : "Still going"
              }
              side={when(one.startedAt)}
            />
          ))}
        </PaperCard>
      ) : !running ? (
        <PaperEmpty>Nothing recorded yet.</PaperEmpty>
      ) : null}
    </Paper>
  );
}
