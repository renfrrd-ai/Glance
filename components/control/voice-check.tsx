"use client";

/*
 * Check chalk hears you.
 *
 * chalk writes five sentences out of this person's own words, they read each
 * one aloud while holding a button, and whatever comes back is lined up against
 * the sentence that was asked for. Every difference that involves one of their
 * words is kept as a fix (see lib/mishearings.ts) and used from then on.
 *
 * The microphone is released twenty seconds after the last reading, so a pane
 * left open does not sit holding it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, X } from "lucide-react";

import { applyHears, heardRight, learnMishearings, mergeHears } from "@/lib/mishearings";
import type { Profile } from "@/lib/profile";

import { Btn, Card, Row, Section, Tag } from "./primitives";

type Result =
  | { error: string }
  | { heard: string; learned: { heard: string; meant: string }[]; right: boolean };

const RELEASE_AFTER = 20_000;

export function VoiceCheck({
  profile,
  update,
}: {
  profile: Profile;
  update: (patch: Partial<Profile>) => void;
}) {
  const [phrases, setPhrases] = useState<string[] | null>(null);
  const [at, setAt] = useState(0);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [state, setState] = useState<"idle" | "loading" | "recording" | "hearing">("idle");

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const holding = useRef(false);
  const release = useRef<number | null>(null);
  const holdButton = useRef<HTMLButtonElement>(null);

  const hears = profile.hears ?? [];
  const vocabulary = profile.vocabulary ?? [];

  const drop = useCallback(() => {
    if (release.current !== null) {
      window.clearTimeout(release.current);
      release.current = null;
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const dropSoon = useCallback(() => {
    if (release.current !== null) window.clearTimeout(release.current);
    release.current = window.setTimeout(drop, RELEASE_AFTER);
  }, [drop]);

  useEffect(() => {
    const stop = () => {
      const open = recorder.current;
      recorder.current = null;
      if (open && open.state !== "inactive") {
        open.onstop = null;
        open.stop();
      }
      drop();
    };
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [drop]);

  /* Keep the hold button under the thumb as the sentences advance. */
  useEffect(() => {
    if (phrases) holdButton.current?.focus({ preventScroll: true });
  }, [phrases, at]);

  const writeSentences = async () => {
    setState("loading");
    setResults({});
    setAt(0);
    try {
      const response = await fetch("/api/profile/phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
        body: JSON.stringify({ words: vocabulary }),
      });
      const data = await response.json();
      setPhrases(data.phrases?.length ? data.phrases : null);
    } catch {
      setPhrases(null);
    }
    setState("idle");
  };

  const startReading = async () => {
    if (state !== "idle" || !phrases) return;
    holding.current = true;
    if (release.current !== null) {
      window.clearTimeout(release.current);
      release.current = null;
    }

    try {
      stream.current ??= await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      /* Let go during the permission prompt: nothing to record. */
      if (!holding.current) {
        dropSoon();
        return;
      }

      chunks.current = [];
      const open = new MediaRecorder(stream.current);
      open.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      open.start();
      recorder.current = open;
      setState("recording");
    } catch {
      setResults((all) => ({
        ...all,
        [at]: { error: "chalk can't reach the microphone — check Privacy." },
      }));
    }
  };

  const stopReading = async () => {
    holding.current = false;
    const open = recorder.current;
    if (!open || state !== "recording" || !phrases) return;

    recorder.current = null;
    setState("hearing");

    const audio = await new Promise<Blob>((done) => {
      open.onstop = () => done(new Blob(chunks.current, { type: open.mimeType || "audio/webm" }));
      open.stop();
    });

    const body = new FormData();
    body.append("audio", audio, /mp4|m4a|aac/.test(open.mimeType) ? "read.mp4" : "read.webm");
    if (vocabulary.length) body.append("words", vocabulary.join(","));

    let next = { ...results };
    try {
      const response = await fetch("/api/speech/listen", {
        method: "POST",
        headers: { "x-chalk-app": "1" },
        body,
      });
      const text: string = (await response.json()).text?.trim() ?? "";

      if (text) {
        const learned = learnMishearings(phrases[at], text, vocabulary);
        if (learned.length) update({ hears: mergeHears(profile.hears, learned) });
        next = {
          ...next,
          [at]: {
            heard: text,
            learned,
            /* Right only if nothing had to be learned and, with the fixes we
             * already have applied, it matches. */
            right: !learned.length && heardRight(phrases[at], applyHears(text, hears), vocabulary),
          },
        };
      } else {
        next = {
          ...next,
          [at]: { error: "Didn't catch that — hold the button the whole time you read." },
        };
      }
    } catch {
      next = { ...next, [at]: { error: "Couldn't reach chalk to transcribe it." } };
    }

    setResults(next);

    /* Move to the next sentence that has not been read — unless this one
     * failed, which is worth another try. */
    const left = phrases
      .map((_, index) => index)
      .filter((index) => {
        const result = next[index];
        return !result || "error" in result;
      });
    const then = left.find((index) => index > at) ?? left[0];
    const failedHere = next[at] && "error" in next[at];
    if (then !== undefined && !failedHere) setAt(then);

    if (left.length) dropSoon();
    else drop();
    setState("idle");
  };

  const done = phrases
    ? phrases.filter((_, index) => {
        const result = results[index];
        return result && !("error" in result);
      }).length
    : 0;
  const allDone = !!phrases && done >= phrases.length;
  const learnedCount = Object.values(results).reduce(
    (total, result) => total + ("learned" in result ? result.learned.length : 0),
    0,
  );
  const differentCount = Object.values(results).filter(
    (result) => "right" in result && !result.right && !result.learned.length,
  ).length;

  const helpFor = (index: number, result: Result | undefined) => {
    if (!result)
      return index === at
        ? "Hold “Hold to read” — or the space bar — and read this aloud, then let go."
        : undefined;
    if ("error" in result) return result.error;
    if (result.learned.length)
      return `Heard “${result.heard}” — learned ${result.learned
        .map((one) => `“${one.heard}” → ${one.meant}`)
        .join(", ")}`;
    return result.right ? `Heard “${result.heard}”` : `Heard “${result.heard}” — tap to read it again`;
  };

  return (
    <Section
      title="Check chalk hears you"
      meta={hears.length ? `${hears.length} fix${hears.length === 1 ? "" : "es"} learned` : undefined}
      desc="Read a few sentences made of your own words. Wherever chalk mishears one, it learns the fix and uses it from then on."
    >
      <Card>
        {phrases ? (
          <>
            {phrases.map((phrase, index) => {
              const result = results[index];
              return (
                <Row
                  key={index}
                  title={`“${phrase}”`}
                  on={index === at && !allDone}
                  onClick={
                    state === "idle" && (index !== at || allDone)
                      ? () => {
                          setResults((all) => {
                            const rest = { ...all };
                            delete rest[index];
                            return rest;
                          });
                          setAt(index);
                        }
                      : undefined
                  }
                  help={helpFor(index, result)}
                  side={
                    !result || "error" in result ? null : (
                      <Tag tone={result.learned.length ? "neutral" : result.right ? "ok" : "warn"}>
                        {result.learned.length
                          ? "Learned"
                          : result.right
                            ? "Heard right"
                            : "Heard differently"}
                      </Tag>
                    )
                  }
                />
              );
            })}

            <Row
              title={
                allDone
                  ? `Done — ${
                      learnedCount
                        ? `${learnedCount} fix${learnedCount === 1 ? "" : "es"} learned`
                        : differentCount
                          ? `${differentCount} heard differently`
                          : "chalk heard all of it"
                    }`
                  : `${done} of ${phrases.length}`
              }
              side={
                allDone ? (
                  <Btn onClick={() => void writeSentences()}>Again</Btn>
                ) : (
                  <button
                    type="button"
                    className="cc-btn"
                    data-variant="primary"
                    ref={holdButton}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      void startReading();
                    }}
                    onPointerUp={() => void stopReading()}
                    onPointerLeave={() => {
                      holding.current = false;
                      if (state === "recording") void stopReading();
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== " " && event.key !== "Enter") return;
                      event.preventDefault();
                      if (!event.repeat) void startReading();
                    }}
                    onKeyUp={(event) => {
                      if (event.key !== " " && event.key !== "Enter") return;
                      event.preventDefault();
                      void stopReading();
                    }}
                    onBlur={() => {
                      holding.current = false;
                      if (state === "recording") void stopReading();
                    }}
                  >
                    <Mic size={14} />{" "}
                    {state === "recording"
                      ? "Reading… let go when done"
                      : state === "hearing"
                        ? "Listening back…"
                        : state === "loading"
                          ? "Writing…"
                          : "Hold to read"}
                  </button>
                )
              }
            />
          </>
        ) : (
          <Row
            title={
              vocabulary.length
                ? `Five sentences with your words — ${vocabulary.slice(0, 4).join(", ")}${vocabulary.length > 4 ? "…" : ""}`
                : "Five everyday sentences (add your own words above to make them yours)"
            }
            side={
              <Btn
                variant="primary"
                disabled={state === "loading"}
                onClick={() => void writeSentences()}
              >
                {state === "loading" ? "Writing…" : "Start"}
              </Btn>
            }
          />
        )}

        {hears.length ? (
          <Row title="Fixes chalk uses" help="Tap one to drop it." side={null}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {hears.map((hear) => (
                <button
                  type="button"
                  className="cc-btn"
                  data-variant="ghost"
                  data-size="sm"
                  aria-label={`Forget ${hear.heard}`}
                  onClick={() =>
                    update({ hears: hears.filter((one) => one.heard !== hear.heard) })
                  }
                  key={hear.heard}
                >
                  “{hear.heard}” → {hear.meant} <X size={12} />
                </button>
              ))}
            </div>
          </Row>
        ) : null}
      </Card>
    </Section>
  );
}
