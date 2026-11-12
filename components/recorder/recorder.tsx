"use client";

/*
 * Recording a class.
 *
 * The hard part is not capturing audio — it is capturing an hour of a lecture
 * hall on someone's laptop without filling a disk, flattening a battery, or
 * losing the last ten minutes when a tab is closed. So nothing is held:
 *
 *   - each source is recorded in chunks, and a chunk is uploaded and
 *     transcribed the moment it closes. The audio is never kept, only words.
 *   - a chunk ends at a *pause*, not on a timer — the level is watched against
 *     the quietest it has been, and the chunk closes when the room goes quiet,
 *     or at ~15s if it never does. Cutting mid-word costs a word.
 *   - a chunk that never rose above the noise floor is dropped rather than
 *     uploaded: silence is never sent anywhere.
 *
 * Two sources can run at once — the microphone, and a shared tab for a call —
 * and each is labelled so the transcript knows who was speaking.
 *
 * On the Mac the app records instead (`startMeeting`), because it can capture
 * system audio properly; this provider then just follows its state.
 */

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { shell } from "@/lib/prefs";
import { readProfileWords } from "@/lib/profile-words";

export type RecordingKind = "class" | "meeting";

export type StartOptions = {
  kind: RecordingKind;
  language: string;
  title?: string;
  courseId?: string;
  unitId?: string;
  /** Also capture a shared tab's audio, for a call. */
  tab?: boolean;
};

export type Live = {
  id: string;
  kind: RecordingKind;
  /** Who is doing the recording. */
  via: "browser" | "shell";
  started: number;
  title: string;
  language: string;
  /** What each captured source is called, for the transcript. */
  streams: string[];
};

export type Line = { at: number; source: string; text: string };

type Phase = "idle" | "starting" | "recording" | "stopping" | "error";

/** One captured source, and what is known about how loud it is. */
type Track = {
  stream: MediaStream;
  source: "me" | "them" | "room";
  rec: MediaRecorder | null;
  /** The loudest this chunk has been. */
  peak: number;
  analyser: AnalyserNode | null;
  /* Backed by a plain ArrayBuffer on purpose: getFloatTimeDomainData won't
   * take a view that might sit on a SharedArrayBuffer. */
  buf: Float32Array<ArrayBuffer> | null;
  ended: boolean;
  level: number;
  /** The quietest this chunk has been — the room's noise floor. */
  floor: number;
};

type Session = {
  id: string;
  started: number;
  tracks: Track[];
  stop: boolean;
  uploads: Promise<unknown>[];
  lang: string;
  /** Words chalk should hear right, and the fixes it has learned. */
  words: string;
  hears: string;
  audio: AudioContext | null;
  meter: number;
  lock: WakeLockSentinel | null;
  relock: (() => void) | null;
  problem: string | null;
  sent: number;
  skipped: number;
  /** Something went wrong that recording cannot continue through. */
  dead: string | null;
};

/* A chunk closes when the level has sat at the floor for this long… */
const QUIET_AFTER = 12;
/* …and never runs longer than this, pause or no pause. */
const CHUNK_MAX = 15;
/* Below this peak, a chunk is silence and is not uploaded. */
const FLOOR = 0.006;

async function call(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("x-chalk-app", "1");
  if (options.body && !(options.body instanceof FormData) && !headers.has("content-type"))
    headers.set("content-type", "application/json");

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
  return data;
}

/** What went wrong getting a microphone, in words worth reading. */
function whyNoMicrophone(problem: unknown) {
  const name = problem instanceof Error ? problem.name : "";
  const text = problem instanceof Error ? problem.message : String(problem ?? "");

  if (name === "NotAllowedError" || name === "SecurityError" || /denied|permission|notallowed/i.test(text))
    return "chalk needs the microphone to listen — allow it for this page (and for your browser in System Settings › Privacy › Microphone), then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError" || /notfound|no device|requested device/i.test(text))
    return "There's no microphone chalk can use — plug one in and try again.";
  if (name === "NotReadableError" || name === "AbortError")
    return "The microphone is busy or couldn't start — close anything else using it and try again.";

  return text || "chalk couldn't start recording.";
}

const extensionFor = (mime: string) =>
  /mp4|m4a|aac/.test(mime) ? "mp4" : /ogg/.test(mime) ? "ogg" : /wav/.test(mime) ? "wav" : "webm";

/**
 * Record one chunk from one track, then call itself for the next.
 *
 * Recursive rather than looping because each chunk's end is decided by what it
 * heard — the next one starts only once this one has closed and been sent.
 */
function recordChunk(session: Session, track: Track) {
  if (session.stop || track.ended) return;

  const chunks: Blob[] = [];
  const at = Math.max(0, Math.round((Date.now() - session.started) / 1000));

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(track.stream);
  } catch {
    track.ended = true;
    return;
  }

  track.rec = recorder;
  track.peak = 0;
  track.floor = Infinity;

  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };

  recorder.onstop = () => {
    const audio = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    /* Without an analyser there is nothing to judge by, so send it. */
    const heardSomething = !track.analyser || track.peak >= FLOOR;

    if (heardSomething && audio.size > 2000) {
      const body = new FormData();
      body.append("audio", audio, `chunk.${extensionFor(recorder.mimeType)}`);
      body.append("source", track.source);
      body.append("at", String(at));
      body.append("language", session.lang);
      if (session.words) body.append("words", session.words);
      if (session.hears) body.append("hears", session.hears);

      session.sent++;

      const send = () =>
        fetch(`/api/meetings/${session.id}/audio`, {
          method: "POST",
          headers: { "x-chalk-app": "1" },
          body,
        });
      const pause = () => new Promise((done) => window.setTimeout(done, 2000));

      /* One retry on a busy server, then give up on this chunk — the next one
       * is already being recorded and is worth more than this one. */
      session.uploads.push(
        send()
          .then(
            (response) => (response.status === 502 || response.status === 503 ? pause().then(send) : response),
            () => pause().then(send),
          )
          .then(async (response) => {
            session.problem = response.ok
              ? null
              : ((await response.json().catch(() => null))?.message ??
                `the words didn't come back (${response.status})`);
          })
          .catch(() => {
            session.problem = "chalk couldn't be reached — the words from this moment may be missing";
          }),
      );
    } else if (!heardSomething) {
      session.skipped++;
    }

    if (!session.stop && !track.ended) recordChunk(session, track);
  };

  try {
    recorder.start();
  } catch {
    track.ended = true;
    return;
  }

  /* Watch for the pause to cut on. */
  const opened = Date.now();
  const watch = window.setInterval(() => {
    if (recorder.state !== "recording") {
      window.clearInterval(watch);
      return;
    }

    const running = (Date.now() - opened) / 1000;
    /* Quiet means "back down to about this room's floor", not "silent" — a
     * lecture hall is never silent. */
    const quiet =
      track.analyser !== null &&
      Number.isFinite(track.floor) &&
      running >= QUIET_AFTER &&
      track.level <= Math.max(FLOOR, 2.5 * track.floor);
    /* Without an analyser there is no pause to find, so cut sooner. */
    const tooLong = running >= CHUNK_MAX + (track.analyser ? 4 : 0);

    if (quiet || tooLong) {
      window.clearInterval(watch);
      recorder.stop();
    }
  }, 50);
}

type Recorder = {
  phase: Phase;
  live: Live | null;
  /** Why it stopped, or why it will not start. */
  why: string;
  lines: Line[];
  sent: number;
  skipped: number;
  problem: string | null;
  start: (options: StartOptions) => Promise<string | null>;
  stop: () => Promise<void>;
  dismiss: () => void;
};

const RecorderContext = createContext<Recorder | null>(null);
/* The clock and the meter tick every 100ms, so they are their own context —
 * everything that only cares whether a recording exists stays still. */
const TickContext = createContext({ secs: 0, level: 0 });

export function RecorderProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState<Live | null>(null);
  const [why, setWhy] = useState("");
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [counts, setCounts] = useState<{ sent: number; skipped: number; problem: string | null }>({
    sent: 0,
    skipped: 0,
    problem: null,
  });

  const session = useRef<Session | null>(null);
  const liveRef = useRef<Live | null>(null);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const release = useCallback(async (open: Session) => {
    window.clearInterval(open.meter);
    if (open.relock) document.removeEventListener("visibilitychange", open.relock);
    open.tracks.forEach((track) => track.stream.getTracks().forEach((one) => one.stop()));
    await open.audio?.close().catch(() => {});
    await open.lock?.release().catch(() => {});
  }, []);

  /* Leaving the page mid-recording: let go of the microphone, and tell the
   * server the recording ended so it is not left open forever. */
  useEffect(
    () => () => {
      const open = session.current;
      if (!open) return;
      open.stop = true;
      release(open);
      fetch(`/api/meetings/${open.id}`, {
        method: "PATCH",
        keepalive: true,
        headers: { "x-chalk-app": "1", "content-type": "application/json" },
        body: JSON.stringify({ ended: true }),
      }).catch(() => {});
    },
    [release],
  );

  /* Closing the tab mid-recording loses whatever has not been uploaded. */
  useEffect(() => {
    if (phase !== "recording" || live?.via !== "browser") return;
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [phase, live?.via]);

  /* The clock, and the transcript as it comes back. */
  useEffect(() => {
    if (phase !== "recording" || !live) return;

    const tick = () => {
      setSecs(Math.round((Date.now() - live.started) / 1000));
      const open = session.current;
      if (!open) return;
      const problem = open.dead ?? open.problem;
      setCounts((now) =>
        now.sent === open.sent && now.skipped === open.skipped && now.problem === problem
          ? now
          : { sent: open.sent, skipped: open.skipped, problem },
      );
    };

    const poll = () =>
      void fetch(`/api/meetings/${live.id}`, { headers: { "x-chalk-app": "1" } })
        .then((response) => response.json())
        .then((data) => {
          const transcript: Line[] | undefined = data.meeting?.transcript;
          if (!transcript) return;
          setLines((now) =>
            /* Same length and same last line: nothing new. */
            now.length === transcript.length &&
            now[now.length - 1]?.text === transcript[transcript.length - 1]?.text
              ? now
              : transcript,
          );
        })
        .catch(() => {});

    tick();
    poll();
    const clock = window.setInterval(tick, 1000);
    const words = window.setInterval(poll, 4000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(words);
    };
  }, [phase, live]);

  const start = useCallback(
    async (options: StartOptions) => {
      if (phase === "starting" || phase === "recording" || phase === "stopping") return null;

      setPhase("starting");
      setWhy("");
      setLines([]);
      setSecs(0);
      setCounts({ sent: 0, skipped: 0, problem: null });

      const host = shell();
      const byApp = options.kind === "meeting" && !!host?.startMeeting;
      const opened: MediaStream[] = [];

      try {
        let microphone: MediaStream | null = null;
        let tab: MediaStream | null = null;

        if (!byApp) {
          if (!navigator.mediaDevices?.getUserMedia)
            throw new Error("This browser won't let chalk use a microphone on this page.");

          microphone = await navigator.mediaDevices.getUserMedia({
            audio: {
              noiseSuppression: true,
              echoCancellation: true,
              autoGainControl: true,
              channelCount: 1,
            },
          });
          opened.push(microphone);

          if (options.kind === "meeting" && options.tab && navigator.mediaDevices.getDisplayMedia) {
            tab = await navigator.mediaDevices
              .getDisplayMedia({ video: { frameRate: 1 }, audio: true })
              .catch(() => null);

            if (tab) opened.push(tab);
            else setWhy("No tab was shared, so chalk is recording the microphone only.");

            /* A tab shared without its audio is a video track we don't want. */
            if (tab && !tab.getAudioTracks().length) {
              tab.getTracks().forEach((one) => one.stop());
              tab = null;
              setWhy(
                "That share had no sound, so chalk is recording the microphone only. To include the call, choose its tab and tick “Share tab audio”.",
              );
            }
          }
        }

        const { recording } = await call("/api/recordings", {
          method: "POST",
          body: JSON.stringify({
            kind: options.kind,
            language: options.language,
            title: options.title,
            courseId: options.courseId,
            unitId: options.unitId,
          }),
        });

        if (byApp) {
          const started = await host!
            .startMeeting!(recording.id)
            .catch((problem: unknown) => ({
              ok: false,
              why: problem instanceof Error ? problem.message : null,
            }));

          if (!(started as { ok?: boolean })?.ok) {
            /* Don't leave an empty recording behind. */
            await call(`/api/recordings/${recording.id}`, { method: "DELETE" }).catch(() => {});
            throw new Error((started as { why?: string })?.why ?? "chalk couldn't start recording.");
          }

          setLive({
            id: recording.id,
            kind: options.kind,
            via: "shell",
            started: Date.now(),
            title: recording.title,
            language: options.language,
            streams: ["You", "Them"],
          });
          setPhase("recording");
          return recording.id;
        }

        const known = await readProfileWords();

        const open: Session = {
          id: recording.id,
          started: Date.now(),
          tracks: [],
          stop: false,
          uploads: [],
          lang: options.language,
          words: known.vocabulary.slice(0, 80).join(","),
          hears: known.hears.length ? JSON.stringify(known.hears) : "",
          audio: null,
          meter: 0,
          lock: null,
          relock: null,
          problem: null,
          sent: 0,
          skipped: 0,
          dead: null,
        };

        /* In a class the microphone is pointed at the lecturer; in a call with
         * a shared tab it is you; otherwise it is the room. */
        const mine: Track["source"] = options.kind === "class" ? "them" : tab ? "me" : "room";
        open.tracks.push({
          stream: microphone!,
          source: mine,
          rec: null,
          peak: 0,
          analyser: null,
          buf: null,
          ended: false,
          level: 0,
          floor: Infinity,
        });

        if (tab)
          open.tracks.push({
            stream: new MediaStream(tab.getAudioTracks()),
            source: "them",
            rec: null,
            peak: 0,
            analyser: null,
            buf: null,
            ended: false,
            level: 0,
            floor: Infinity,
          });

        /* An analyser per track: this is what finds the pauses. */
        try {
          open.audio = new AudioContext();
          await open.audio.resume().catch(() => {});
          for (const track of open.tracks) {
            const analyser = open.audio.createAnalyser();
            analyser.fftSize = 2048;
            open.audio.createMediaStreamSource(track.stream).connect(analyser);
            track.analyser = analyser;
            track.buf = new Float32Array(new ArrayBuffer(4 * analyser.fftSize));
          }
        } catch {
          /* No AudioContext: chunks fall back to cutting on time alone. */
          open.audio = null;
        }

        open.meter = window.setInterval(() => {
          let loudest = 0;

          for (const track of open.tracks) {
            if (!track.analyser || !track.buf) continue;
            track.analyser.getFloatTimeDomainData(track.buf);

            let sum = 0;
            for (let i = 0; i < track.buf.length; i++) sum += track.buf[i] * track.buf[i];
            const rms = Math.sqrt(sum / track.buf.length);

            track.peak = Math.max(track.peak, rms);
            track.level = rms;
            track.floor = Math.min(track.floor, rms);
            loudest = Math.max(loudest, rms);
          }

          /* Rounded to twentieths: the meter is a picture, not a measurement,
           * and this keeps it from re-rendering on every frame. */
          setLevel((now) => {
            const next = Math.round(20 * Math.min(1, Math.sqrt(6 * loudest))) / 20;
            return next === now ? now : next;
          });
        }, 100);

        tab?.getTracks().forEach((one) => {
          one.onended = () => {
            const track = open.tracks.find((each) => each.source === "them");
            if (track) track.ended = true;
          };
        });

        microphone!.getAudioTracks().forEach((one) => {
          one.onended = () => {
            if (open.stop) return;
            const track = open.tracks.find((each) => each.stream === microphone);
            if (track) track.ended = true;
            open.dead =
              "The microphone stopped — chalk can’t hear anything now. Stop, check the microphone, and record again.";
          };
        });

        /* An hour of recording should not be cut short by the screen sleeping,
         * and a wake lock is dropped whenever the tab is hidden. */
        const wakeLock = navigator.wakeLock;
        if (wakeLock) {
          const take = () => Promise.resolve().then(() => wakeLock.request("screen"));
          open.lock = await take().catch(() => null);
          open.relock = () => {
            if (document.visibilityState !== "visible" || open.stop) return;
            if (open.lock && !open.lock.released) return;
            take()
              .then((lock) => {
                if (open.stop) lock.release().catch(() => {});
                else open.lock = lock;
              })
              .catch(() => {});
          };
          document.addEventListener("visibilitychange", open.relock);
        }

        session.current = open;
        open.tracks.forEach((track) => recordChunk(open, track));

        setLive({
          id: recording.id,
          kind: options.kind,
          via: "browser",
          started: open.started,
          title: recording.title,
          language: options.language,
          streams: open.tracks.map((track) =>
            track.source === "me"
              ? "You"
              : track.source === "room"
                ? "Room"
                : options.kind === "class"
                  ? "Lecturer"
                  : "Them",
          ),
        });
        setPhase("recording");
        return recording.id;
      } catch (problem) {
        opened.forEach((stream) => stream.getTracks().forEach((one) => one.stop()));
        setWhy(whyNoMicrophone(problem));
        setPhase("error");
        return null;
      }
    },
    [phase],
  );

  /* Finishing: the words are still arriving, so the writing-up is kicked off
   * with what chalk knows about this person's vocabulary. */
  const finish = useCallback(
    async (id: string, after: number) => {
      if (after) await new Promise((done) => window.setTimeout(done, after));

      const known = await readProfileWords();
      await call(`/api/recordings/${id}/work`, {
        method: "POST",
        body: JSON.stringify(known),
      }).catch(() => {});

      setPhase("idle");
      setLive(null);
      setLevel(0);
      setWhy("");

      /* Only take them to the recording if they are still on this screen. */
      const here = window.location.pathname.replace(/\/$/, "");
      if (here === "/recordings" || here === `/recordings/${id}`) router.push(`/recordings/${id}`);
    },
    [router],
  );

  const stop = useCallback(async () => {
    const running = liveRef.current;
    if (!running || phase !== "recording") return;

    setPhase("stopping");

    if (running.via === "shell") {
      try {
        await (shell() as { stopMeeting?: () => Promise<void> } | null)?.stopMeeting?.();
      } catch {
        /* the app will stop on its own */
      }
      /* The app is still sending its last chunks. */
      await finish(running.id, 16000);
      return;
    }

    const open = session.current;
    if (!open) return;

    open.stop = true;
    open.tracks.forEach((track) => {
      if (track.rec?.state === "recording") track.rec.stop();
    });

    /* Let the last onstop fire, then wait for everything in flight. */
    await new Promise((done) => window.setTimeout(done, 400));
    await Promise.all(open.uploads);
    await release(open);
    session.current = null;

    await call(`/api/meetings/${open.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ended: true }),
    }).catch(() => {});

    await finish(open.id, 0);
  }, [phase, finish, release]);

  /* The Mac app is already recording: pick its session up rather than start one. */
  const follow = useCallback(async (id: string) => {
    const found = await call(`/api/recordings/${id}`).catch(() => null);
    if (!found || liveRef.current) return;

    const started = Date.parse(found.recording.startedAt);
    setLive({
      id,
      kind: found.recording.kind,
      via: "shell",
      started: Number.isFinite(started) ? started : Date.now(),
      title: found.recording.title,
      language: found.recording.language ?? "",
      streams: ["You", "Them"],
    });
    setLines([]);
    setPhase("recording");
  }, []);

  const onRecordings = (usePathname() ?? "").startsWith("/recordings");

  useEffect(() => {
    if (!onRecordings) return;
    (shell() as { meeting?: () => Promise<{ recording?: boolean; id?: string } | null> } | null)
      ?.meeting?.()
      .then((state) => {
        if (state?.recording && state.id && !liveRef.current) follow(state.id);
      })
      .catch(() => {});
  }, [follow, onRecordings]);

  useEffect(() => {
    const host = shell() as {
      onMeeting?: (listener: (state: { recording?: boolean; id?: string }) => void) => () => void;
    } | null;
    if (!host?.onMeeting) return;

    const stopListening = host.onMeeting((state) => {
      const running = liveRef.current;

      /* The app stopped a recording we were following. */
      if (running?.via === "shell" && !state.recording && phase === "recording") {
        setPhase("stopping");
        finish(running.id, 16000);
        return;
      }

      /* The app started one while we were looking at this screen. */
      if (onRecordings && state.recording && state.id && !running && (phase === "idle" || phase === "error"))
        follow(state.id);
    });

    return () => stopListening?.();
  }, [phase, finish, follow, onRecordings]);

  const dismiss = useCallback(() => {
    setWhy("");
    if (phase === "error") setPhase("idle");
  }, [phase]);

  const recorder = useMemo<Recorder>(
    () => ({
      phase,
      live,
      why,
      lines,
      sent: counts.sent,
      skipped: counts.skipped,
      problem: counts.problem,
      start,
      stop,
      dismiss,
    }),
    [phase, live, why, lines, counts, start, stop, dismiss],
  );

  const tick = useMemo(() => ({ secs, level }), [secs, level]);

  return (
    <RecorderContext.Provider value={recorder}>
      <TickContext.Provider value={tick}>{children}</TickContext.Provider>
    </RecorderContext.Provider>
  );
}

export function useRecorder() {
  const recorder = useContext(RecorderContext);
  if (!recorder) throw new Error("useRecorder outside RecorderProvider");
  return recorder;
}

/** The clock and the level, which change ten times a second. */
export const useRecorderTick = () => useContext(TickContext);
