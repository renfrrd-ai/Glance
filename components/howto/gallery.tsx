"use client";

/*
 * The how-to films.
 *
 * Each film is a silent picture plus a separate audio track, so the same
 * footage can be narrated or scored without encoding it twice. The two are kept
 * in step by hand: the video is the clock, and the audio is nudged back
 * whenever it drifts more than a fifth of a second.
 *
 * The catalogue is a static file, /howto/index.json, so it can be updated
 * without a deploy.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { C } from "@/components/art/palette";
import { Tile } from "@/components/art/doodle";
import type { DrawingId } from "@/components/art/drawings";

export type Platform = "web" | "mac";

export type Film = {
  slug: string;
  title: string;
  blurb: string;
  /** Seconds. */
  length: number;
  platforms: Platform[];
  picture: string;
  poster: string;
  voice: string;
  music?: string;
  captions: string;
};

export type Howto = { films: Film[]; music?: string };

export const url = (file: string) => `/howto/${file}`;

export async function loadHowto(): Promise<Howto | null> {
  try {
    const response = await fetch(url("index.json"), { cache: "no-cache" });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data.films) ? (data as Howto) : null;
  } catch {
    return null;
  }
}

export function clock(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

type Cue = { from: number; to: number; text: string };

const atSeconds = (stamp: string) => {
  const [hours, minutes, rest] = stamp.trim().split(":");
  if (rest === undefined) return Number(hours) * 60 + Number(minutes.replace(",", "."));
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(rest.replace(",", "."));
};

export function parseVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n").filter(Boolean);
    const timing = lines.find((line) => line.includes("-->"));
    if (!timing) continue;
    const [from, to] = timing.split("-->");
    const body = lines.slice(lines.indexOf(timing) + 1).join(" ").trim();
    if (!body) continue;
    cues.push({ from: atSeconds(from), to: atSeconds(to), text: body });
  }
  return cues;
}

const PLATFORMS: Record<Platform, string> = { web: "Web", mac: "Mac" };

/** How each film is illustrated in the list. */
const FILM_ART: Record<string, { tile: DrawingId; color: string; dark?: boolean }> = {
  board: { tile: "board", color: C.green },
  spatial: { tile: "spatial", color: C.vermilion },
  courses: { tile: "learn", color: C.marigold, dark: true },
  practice: { tile: "question", color: C.pink },
  record: { tile: "voice", color: C.peri, dark: true },
  setup: { tile: "spatial", color: C.sky, dark: true },
};

function Player({
  film,
  credit,
  autoPlay = false,
  onEnded,
}: {
  film: Film;
  credit?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const frame = useRef<HTMLDivElement>(null);

  const [track, setTrack] = useState<"voice" | "music">("voice");
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(film.length);
  const [cues, setCues] = useState<Cue[]>([]);
  const [captions, setCaptions] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(url(film.captions))
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => {
        if (live) setCues(parseVtt(text));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [film.captions]);

  /* Keep the audio with the picture, but only when it has actually drifted. */
  const sync = useCallback((force = false) => {
    const picture = video.current;
    const sound = audio.current;
    if (!picture || !sound) return;
    if (!force && Math.abs(sound.currentTime - picture.currentTime) <= 0.2) return;
    try {
      sound.currentTime = picture.currentTime;
    } catch {
      /* not seekable yet */
    }
  }, []);

  useEffect(() => {
    const picture = video.current;
    const sound = audio.current;
    if (!picture || !sound) return;

    const onPlay = () => {
      setPlaying(true);
      setStarted(true);
      sync(true);
      sound.play().catch(() => {});
    };
    const onPause = () => {
      setPlaying(false);
      sound.pause();
    };
    const onWaiting = () => sound.pause();
    const onPlaying = () => {
      if (picture.paused) return;
      sync(true);
      sound.play().catch(() => {});
    };
    const onSeeked = () => sync(true);
    const onTime = () => {
      setAt(picture.currentTime);
      if (!picture.paused) sync();
    };
    const onMeta = () => {
      if (Number.isFinite(picture.duration)) setLength(picture.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      sound.pause();
      onEnded?.();
    };

    picture.addEventListener("play", onPlay);
    picture.addEventListener("pause", onPause);
    picture.addEventListener("waiting", onWaiting);
    picture.addEventListener("playing", onPlaying);
    picture.addEventListener("seeked", onSeeked);
    picture.addEventListener("timeupdate", onTime);
    picture.addEventListener("loadedmetadata", onMeta);
    picture.addEventListener("ended", onEnd);

    return () => {
      picture.removeEventListener("play", onPlay);
      picture.removeEventListener("pause", onPause);
      picture.removeEventListener("waiting", onWaiting);
      picture.removeEventListener("playing", onPlaying);
      picture.removeEventListener("seeked", onSeeked);
      picture.removeEventListener("timeupdate", onTime);
      picture.removeEventListener("loadedmetadata", onMeta);
      picture.removeEventListener("ended", onEnd);
    };
  }, [sync, onEnded]);

  useEffect(() => {
    if (autoPlay) video.current?.play().catch(() => {});
  }, [autoPlay]);

  const switchTrack = (next: "voice" | "music") => {
    if (next === track) return;
    setTrack(next);

    const sound = audio.current;
    const picture = video.current;
    if (!sound || !picture) return;

    sound.src = url(next === "music" && film.music ? film.music : film.voice);
    const onMeta = () => {
      sync(true);
      if (!picture.paused) sound.play().catch(() => {});
      sound.removeEventListener("loadedmetadata", onMeta);
    };
    sound.addEventListener("loadedmetadata", onMeta);
    sound.load();
  };

  const toggle = () => {
    const picture = video.current;
    if (!picture) return;
    if (picture.paused) picture.play().catch(() => {});
    else picture.pause();
  };

  const seek = (to: number) => {
    const picture = video.current;
    if (!picture) return;
    picture.currentTime = Math.max(0, Math.min(length, to));
    setAt(picture.currentTime);
  };

  const caption = captions ? (cues.find((cue) => at >= cue.from && at < cue.to)?.text ?? "") : "";
  const scored = track === "music" && film.music;

  return (
    <div className="hw-player">
      <div
        className="hw-frame"
        ref={frame}
        data-playing={playing || undefined}
        data-started={started || undefined}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "k") {
            event.preventDefault();
            toggle();
          } else if (event.key === "ArrowRight") seek(at + 5);
          else if (event.key === "ArrowLeft") seek(at - 5);
        }}
      >
        <video
          ref={video}
          className="hw-video"
          src={url(film.picture)}
          poster={url(film.poster)}
          muted
          playsInline
          preload="metadata"
          onClick={toggle}
          aria-label={`${film.title} — how-to film`}
        />
        <audio ref={audio} src={url(film.voice)} preload="auto" />

        {caption ? (
          <div className="hw-caption" aria-live="off">
            <span>{caption}</span>
          </div>
        ) : null}

        {playing ? null : (
          <button
            type="button"
            className="hw-big"
            onClick={toggle}
            aria-label={started ? "Play" : `Play ${film.title}`}
          >
            <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
          </button>
        )}

        <div className="hw-bar">
          <button
            type="button"
            className="hw-btn"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
              </svg>
            )}
          </button>

          <input
            className="hw-seek"
            type="range"
            min={0}
            max={length || 1}
            step={0.05}
            value={at}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Seek"
            style={{ "--hw-at": `${(at / (length || 1)) * 100}%` } as React.CSSProperties}
          />

          <span className="hw-time">
            {clock(at)} / {clock(length)}
          </span>

          {film.music ? (
            <span className="hw-sound" role="group" aria-label="Sound">
              <button type="button" data-on={track === "voice" || undefined} onClick={() => switchTrack("voice")}>
                Voice
              </button>
              <button type="button" data-on={track === "music" || undefined} onClick={() => switchTrack("music")}>
                Music
              </button>
            </span>
          ) : null}

          <button
            type="button"
            className="hw-btn hw-cc"
            data-on={captions || undefined}
            onClick={() => setCaptions((on) => !on)}
            aria-label={captions ? "Hide captions" : "Show captions"}
            aria-pressed={captions}
          >
            CC
          </button>

          <button
            type="button"
            className="hw-btn"
            onClick={() => {
              const box = frame.current;
              if (!box) return;
              if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
              else if (box.requestFullscreen) box.requestFullscreen().catch(() => {});
              else
                (
                  video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
                )?.webkitEnterFullscreen?.();
            }}
            aria-label="Full screen"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {scored && credit ? <p className="hw-credit">Music: {credit}</p> : null}
    </div>
  );
}

export function HowtoGallery({
  start,
  only,
  slugs,
  autoPlay = false,
}: {
  /** The film to open on. */
  start?: string;
  /** Only the films for this platform. */
  only?: Platform;
  /** Only these films, in the catalogue's order. */
  slugs?: string[];
  autoPlay?: boolean;
}) {
  const [catalogue, setCatalogue] = useState<Howto | null | "loading">("loading");
  const [here, setHere] = useState(start);
  const [play, setPlay] = useState(autoPlay);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadHowto().then((loaded) => {
      if (live) setCatalogue(loaded);
    });
    return () => {
      live = false;
    };
  }, []);

  if (catalogue === "loading")
    return (
      <div className="hw" aria-busy="true">
        <div className="hw-player hw-ghost" />
      </div>
    );

  const films = catalogue
    ? catalogue.films.filter(
        (film) =>
          (!only || film.platforms.includes(only)) && (!slugs || slugs.includes(film.slug)),
      )
    : [];

  if (!catalogue || !films.length)
    return slugs ? null : (
      <div className="hw">
        <p className="hw-none">The how-to videos are on their way.</p>
      </div>
    );

  const film = films.find((one) => one.slug === here) ?? films[0];
  const platforms = (list: Platform[]) => list.map((one) => PLATFORMS[one]).join(" and ");

  return (
    <div
      className="hw"
      ref={box}
      data-layout={films.length > 3 ? "side" : films.length > 1 ? "below" : "one"}
    >
      <div className="hw-now">
        <Player key={film.slug} film={film} credit={catalogue.music} autoPlay={play} />
        <div className="hw-about">
          <h3>{film.title}</h3>
          <p>{film.blurb}</p>
          <span className="hw-meta">
            {clock(film.length)} · {platforms(film.platforms)}
          </span>
        </div>
      </div>

      {films.length > 1 ? (
        <ol className="hw-list" aria-label="How-to videos">
          {films.map((one) => {
            const art = FILM_ART[one.slug] ?? { tile: "board" as DrawingId, color: C.navy };
            const on = one.slug === film.slug;
            return (
              <li key={one.slug}>
                <button
                  type="button"
                  className="hw-row"
                  data-on={on || undefined}
                  data-dark={art.dark || undefined}
                  aria-current={on || undefined}
                  style={{ "--hw-c": art.color } as React.CSSProperties}
                  onClick={() => {
                    setHere(one.slug);
                    setPlay(true);
                    /* On a narrow screen the player is above the list. */
                    if (window.matchMedia("(max-width: 999px)").matches)
                      box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <Tile id={art.tile} size={46} tile={on ? "#fff" : art.color} paper={C.cream} />
                  <span className="hw-row-text">
                    <b>{one.title}</b>
                    <span>
                      {clock(one.length)} · {platforms(one.platforms)}
                    </span>
                  </span>
                  <span className="hw-row-go" aria-hidden="true">
                    {on ? (
                      "Playing"
                    ) : (
                      <svg viewBox="0 0 24 24" width="14" height="14">
                        <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
                      </svg>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

/** The music credit, for pages that show the films with their score. */
export function HowtoCredit() {
  const [music, setMusic] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadHowto().then((loaded) => {
      if (live) setMusic(loaded?.music ?? null);
    });
    return () => {
      live = false;
    };
  }, []);

  return music ? <p className="hw-footnote">Music in the music versions: {music}</p> : null;
}
