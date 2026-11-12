"use client";

/*
 * The recorder, and the pill that follows it around.
 *
 * Recording outlives any one page — you start a class recording and then go
 * and look at a board — so the provider sits at the root, and a small pill
 * keeps the recording reachable from wherever you end up.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { RecorderProvider, useRecorder, useRecorderTick } from "./recorder";

function Pill() {
  const recorder = useRecorder();
  const { secs } = useRecorderTick();
  const here = usePathname() ?? "";

  /* On the recordings screens the recording is already in front of you. */
  if (!recorder.live || here.startsWith("/recordings")) return null;
  if (recorder.phase !== "recording" && recorder.phase !== "stopping") return null;

  return (
    <div className="rc-pill" role="status" aria-live="polite">
      <span className="rc-pill-dot" aria-hidden />
      <span className="rc-pill-what">
        {recorder.phase === "stopping"
          ? "Finishing the recording…"
          : `Recording · ${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`}
      </span>
      <Link className="rc-pill-link" href={`/recordings/${recorder.live.id}`}>
        Back to it
      </Link>
      {recorder.phase === "recording" ? (
        <button type="button" className="rc-pill-stop" onClick={() => void recorder.stop()}>
          Stop
        </button>
      ) : null}
    </div>
  );
}

export function RecorderRoot({ children }: { children: ReactNode }) {
  const here = usePathname() ?? "";

  /* The screens chalk draws on are not places to start a recording from. */
  if (here.startsWith("/spatial/") || here.startsWith("/dev/")) return <>{children}</>;

  return (
    <RecorderProvider>
      {children}
      <Pill />
    </RecorderProvider>
  );
}
