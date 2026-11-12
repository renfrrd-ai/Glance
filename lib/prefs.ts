"use client";

/*
 * Where a setting lives.
 *
 * On the web a setting is kept in localStorage. Inside the Mac app the shell
 * owns it instead — the app reads the same settings from its own store, and the
 * web view would otherwise be a second, disagreeing copy. So usePref reads from
 * the shell when there is one, writes back through it, and mirrors the few keys
 * the board renderer reads straight out of localStorage.
 */

import { useCallback, useEffect, useState } from "react";

import { CURSOR_KEY } from "./cursor";

export type PrefKey = "profile" | "scripts" | "apps" | "cursor" | "spatial" | "board" | "appearance";

const APPEARANCE_KEY = "chalk.appearance";

const STORAGE_KEYS: Record<PrefKey, string> = {
  profile: "chalk.profile.v1",
  scripts: "chalk.control.scripts",
  apps: "chalk.control.apps",
  cursor: CURSOR_KEY,
  spatial: "chalk.control.spatial",
  board: "chalk.control.board",
  appearance: APPEARANCE_KEY,
};

/* The keys the renderer reads directly, so they are mirrored into localStorage
 * even when the shell is the owner. */
const MIRRORED = new Set<PrefKey>(["profile", "cursor", "board", "appearance"]);

/* The board's narration flag predates the rest and kept its own key. */
const VOICE_MUTED_KEY = "chalk-voice-muted";

/** What the Mac app exposes on `window`. Absent in a browser. */
export type ChalkShell = {
  pref?: (key: PrefKey) => Promise<unknown>;
  setPref?: (key: PrefKey, value: unknown) => Promise<boolean | void>;
  onPref?: (listener: (change: { key: PrefKey; value: unknown }) => void) => () => void;
  permissions?: () => Promise<Permissions>;
  openSettings?: (pane: string) => void;
  fullscreen?: () => void;
  fullscreenNow?: () => Promise<boolean>;
  onFullscreen?: (listener: (on: boolean) => void) => () => void;
  dragWindow?: () => void;
  titleDoubleClick?: () => void;
  askScreen?: (question: string) => void;
  typeAskNow?: () => Promise<boolean>;
  onTypeAsk?: (listener: () => void) => () => void;
  teachNow?: () => Promise<{ text?: string; title?: string } | null>;
  onTeach?: (listener: (payload: { text?: string; title?: string } | null) => void) => () => void;
  startMeeting?: (options: unknown) => Promise<unknown>;
  log?: (line: string) => void;
};

export type Permissions = {
  screen: boolean;
  accessibility: boolean;
  microphone: boolean;
  input?: boolean;
};

declare global {
  interface Window {
    chalkDesktop?: ChalkShell;
    __chalkFull?: {
      get: () => boolean;
      toggle: () => void;
      listen: (listener: () => void) => () => void;
    };
    __chalkGo?: (path: string) => void;
  }
}

/** The Mac shell, or null in a browser. */
export function shell(): ChalkShell | null {
  if (typeof window === "undefined") return null;
  const s = window.chalkDesktop;
  return s && typeof s.pref === "function" ? s : null;
}

export type Spatial = {
  /** Offer to type, press, copy or open the next step. */
  offers: boolean;
  /** Watch the spot it pointed at, and move on once you've done it. */
  watch: boolean;
  notch: "black" | "frosted" | "liquid";
  /** Scroll by itself to the next part of a walkthrough. */
  autoWalk: boolean;
  pace: "slower" | "normal" | "faster";
  drawLook: "hand" | "clean";
  /** Draw beside what it explains, or on a board of its own. */
  boardMode: "screen" | "sheet";
};

export const DEFAULT_SPATIAL: Spatial = {
  offers: true,
  watch: true,
  notch: "black",
  autoWalk: true,
  pace: "normal",
  drawLook: "hand",
  boardMode: "screen",
};

export const DEFAULT_BOARD = { narrate: true };

function readLocal(key: PrefKey) {
  try {
    if (key === "board") return { narrate: localStorage.getItem(VOICE_MUTED_KEY) !== "1" };
    const raw = localStorage.getItem(STORAGE_KEYS[key]);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeLocal(key: PrefKey, value: unknown) {
  try {
    if (key === "board") {
      const narrate = (value as { narrate?: boolean } | null)?.narrate === false;
      localStorage.setItem(VOICE_MUTED_KEY, narrate ? "1" : "0");
      return;
    }
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
    /* The board renderer and the cursor listen for these rather than polling. */
    if (key === "profile") window.dispatchEvent(new Event("chalk:profile"));
    if (key === "cursor") window.dispatchEvent(new Event("chalk:cursor"));
    if (key === "appearance") window.dispatchEvent(new Event("chalk:appearance"));
  } catch {
    /* private window, or storage is full */
  }
}

/* Roughly what a value costs to keep, counting the escaping the shell adds. */
function weight(value: unknown) {
  const json = JSON.stringify(value) ?? "";
  return new TextEncoder().encode(json).length + (json.match(/\//g)?.length ?? 0);
}

const MAX_PREF_BYTES = 512 * 1024;

/**
 * A setting, its setter, and whether it has finished loading.
 *
 * The third value matters: until the shell has answered, the value is only the
 * default, and writing then would overwrite the real setting with it.
 */
export function usePref<T>(key: PrefKey, fallback: T): [T, (value: T) => boolean, boolean] {
  const [value, setValue] = useState<T>(() =>
    shell() ? fallback : ((readLocal(key) as T) ?? fallback),
  );
  const [ready, setReady] = useState(() => !shell());

  useEffect(() => {
    let live = true;
    const host = shell();
    if (!host?.pref) return;

    host.pref(key).then((stored) => {
      if (!live) return;
      if (stored != null) {
        setValue(stored as T);
        if (MIRRORED.has(key)) writeLocal(key, stored);
      }
      setReady(true);
    });

    const stop = host.onPref?.((change) => {
      if (change?.key === key && change.value != null) setValue(change.value as T);
    });

    return () => {
      live = false;
      stop?.();
    };
  }, [key]);

  const save = useCallback(
    (next: T) => {
      const host = shell();
      if (host?.setPref && weight(next) > MAX_PREF_BYTES) {
        host.log?.(
          `control center — "${key}" is too big to keep (${Math.round(weight(next) / 1024)}KB), not saved`,
        );
        return false;
      }

      setValue(next);
      if (host?.setPref) {
        host
          .setPref(key, next)
          .then((kept) => {
            if (kept === false) host.log?.(`control center — the shell refused to keep "${key}"`);
          })
          .catch(() => {});
      }
      if (!host || MIRRORED.has(key)) writeLocal(key, next);
      return true;
    },
    [key],
  );

  return [value, save, ready];
}

/**
 * Keeps localStorage in step with the shell for the mirrored keys, so a board
 * opened in a web view sees what the app knows.
 */
export function useMirrored() {
  useEffect(() => {
    const host = shell();
    if (!host?.pref) return;

    let live = true;
    for (const key of MIRRORED) {
      host
        .pref(key)
        .then((value) => {
          if (live && value != null) writeLocal(key, value);
        })
        .catch(() => {});
    }

    const stop = host.onPref?.((change) => {
      if (change && MIRRORED.has(change.key) && change.value != null)
        writeLocal(change.key, change.value);
    });

    return () => {
      live = false;
      stop?.();
    };
  }, []);
}

/** The profile changing in another tab — a board open beside this one. */
export function onBoardProfile(listener: (profile: Record<string, unknown>) => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEYS.profile || !event.newValue) return;
    try {
      const next = JSON.parse(event.newValue);
      if (next && typeof next === "object" && !Array.isArray(next)) listener(next);
    } catch {
      /* someone else wrote something that isn't ours */
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** POST to the apps endpoint, raising whatever it says went wrong. */
export async function appsCall<T = unknown>(body: unknown): Promise<T> {
  const response = await fetch("/api/apps", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data as T;
}
