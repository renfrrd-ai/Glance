/*
 * Recordings, in the development store.
 *
 * A recording is a row plus a transcript that grows while it runs: each chunk
 * of audio arrives, is written down, and is appended. The audio itself is
 * never kept — only the words — which is both the privacy promise and the
 * reason an hour of lecture costs so little to store.
 */

export type Line = { at: number; source: string; text: string };

export type Recording = {
  id: string;
  kind: "class" | "meeting";
  title: string;
  language: string;
  startedAt: string;
  endedAt: string | null;
  courseId?: string;
  unitId?: string;
  transcript: Line[];
  /** What chalk made of it afterwards. */
  notes: string | null;
  /** Whether the writing-up has been asked for. */
  working: boolean;
};

const kept = globalThis as typeof globalThis & { __chalkRecordings?: Map<string, Recording> };

export const recordings: Map<string, Recording> =
  kept.__chalkRecordings ?? (kept.__chalkRecordings = new Map());

export const summarise = (recording: Recording) => ({
  id: recording.id,
  kind: recording.kind,
  title: recording.title,
  language: recording.language,
  startedAt: recording.startedAt,
  endedAt: recording.endedAt,
  /* Seconds, from the last thing said — a recording still running has no end. */
  length: recording.transcript.length
    ? recording.transcript[recording.transcript.length - 1].at
    : 0,
  lines: recording.transcript.length,
  notes: !!recording.notes,
});

export function newRecording(input: {
  kind?: string;
  title?: string;
  language?: string;
  courseId?: string;
  unitId?: string;
}): Recording {
  const id = `r${Date.now().toString(36)}`;
  const kind = input.kind === "meeting" ? "meeting" : "class";

  const recording: Recording = {
    id,
    kind,
    title:
      input.title?.trim() ||
      `${kind === "class" ? "Class" : "Conversation"}, ${new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "short",
      })}`,
    language: input.language || "en",
    startedAt: new Date().toISOString(),
    endedAt: null,
    ...(input.courseId ? { courseId: input.courseId } : {}),
    ...(input.unitId ? { unitId: input.unitId } : {}),
    transcript: [],
    notes: null,
    working: false,
  };

  recordings.set(id, recording);
  return recording;
}

/** Add a written-down chunk, keeping the transcript in time order. */
export function addLine(recording: Recording, line: Line) {
  recording.transcript.push(line);
  recording.transcript.sort((a, b) => a.at - b.at);
}
