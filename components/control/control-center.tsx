"use client";

/*
 * The control center: the one window chalk lives in.
 *
 * The left rail switches between two things. A section of the app proper —
 * Home, Boards, Pages — is a real page of the site, kept in an iframe so its
 * own state survives switching away and back. A settings pane is a React pane
 * that lives in this file's neighbourhood and renders into <main>.
 *
 * Which one you are looking at is in the address bar as a hash, so a link can
 * open straight onto it, and so going back in the browser does what you'd
 * expect. A hash that is a path instead of a section id (#/learn/page/abc) is
 * a deep link into one of the framed apps.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Ellipsis,
  Eye,
  LifeBuoy,
  LogOut,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";

import { ArtDefs } from "@/components/art/art-defs";
import { ChalkMark } from "@/components/art/chalk-mark";
import { Person, SectionIcon } from "@/components/art/section-art";
import * as A from "@/lib/plans";
import { DEFAULT_PROFILE, teaches, type Profile } from "@/lib/profile";
import {
  onBoardProfile,
  shell,
  useMirrored,
  usePref,
  type Permissions,
} from "@/lib/prefs";

import { Btn } from "./primitives";
import { PaneProvider } from "./pane-context";
import {
  ALL_IDS,
  APPS,
  APP_PATHS,
  HASH_ALIASES,
  isApp,
  PHONE,
  SECTION_NAMES,
  SETTINGS,
  SETTINGS_IDS,
} from "./sections";
import { GetAppRow, GetMacRow, OpenAppAsk, PermissionDot, TypeAsk, Viewer } from "./shell-extras";
import { HowTo } from "./howto";
import { ReportProblem } from "./report-problem";
import { SpatialSetup } from "./spatial-setup";
import { AppsPane } from "./panes/apps";
import { BoardPane } from "./panes/board";
import { CursorPane } from "./panes/cursor";
import { LearnPane } from "./panes/learn";
import { LibraryPane } from "./panes/library";
import { MemoryPane } from "./panes/memory";
import { PlanPane } from "./panes/plan";
import { PrivacyPane } from "./panes/privacy";
import { SpatialPane } from "./panes/spatial";
import { YouPane } from "./panes/you";

type FrameState = Record<string, { path: string; n: number } | undefined>;
type ViewerState = { path: string; title?: string; n: number } | null;
type AppStatus = { has?: boolean; opens?: number } | null;

/** Which framed app a deep path belongs to. */
function appForPath(path: string) {
  if (path.startsWith("/agents") || path.startsWith("/learn/agents")) return "agents";
  if (path.startsWith("/recordings")) return "recordings";
  if (path.startsWith("/learn/materials")) return "materials";
  if (path.startsWith("/learn/pages") || path.startsWith("/learn/page/")) return "pages";
  if (path.startsWith("/teach")) return "teach";
  if (path.startsWith("/new") || path.startsWith("/board")) return "boards";
  return "home";
}

/* Remembering that an app was opened once, so the "open the Mac app?" ask does
 * not greet the same person twice. */
const ASKED_FOREVER = "chalk.open-app.asked";
const ASKED_THIS_VISIT = "chalk.open-app.session";
const has = (store: Storage, key: string) => {
  try {
    return !!store.getItem(key);
  } catch {
    return false;
  }
};
const onAMac = () =>
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform || navigator.userAgent);

export function ControlCenter() {
  /* Nothing here can render on the server: it is all window, hash and iframe. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(PHONE);
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const [here, setHere] = useState("home");
  const [lastApp, setLastApp] = useState("home");
  const [lastPane, setLastPane] = useState("you");
  const [frames, setFrames] = useState<FrameState>({});
  const [viewer, setViewer] = useState<ViewerState>(null);
  const openViewer = useCallback(
    (path: string, title?: string) => setViewer({ path, title, n: Date.now() }),
    [],
  );
  const [viewerClosed, setViewerClosed] = useState(0);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const searchBox = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState(false);
  const scrolledChips = useRef<string | null>(null);

  /* ---- the hash is the address ------------------------------------------ */

  useEffect(() => {
    const read = () => {
      const hash =
        window.location.hash.slice(1) ||
        (new URLSearchParams(window.location.search).has("pay") ? "plan" : "");

      /* A deep link into a framed app: #/learn/page/abc */
      if (hash.startsWith("/") && !hash.startsWith("//")) {
        const app = appForPath(hash);
        setFrames((open) => ({ ...open, [app]: { path: hash, n: Date.now() } }));
        setHere(app);
        setLastApp(app);
        history.replaceState(null, "", `#${app}`);
        return;
      }

      const id = HASH_ALIASES[hash] ?? hash;
      if (!ALL_IDS.includes(id)) return;
      setHere(id);
      if (isApp(id)) setLastApp(id);
      else setLastPane(id);
    };

    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  /* ---- a deploy happened while this tab was open ------------------------ */

  const build = useRef<string | null>(null);
  const stale = useRef(false);

  useEffect(() => {
    const check = () =>
      void fetch("/api/version", { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          if (!data.build) return;
          if (build.current === null) build.current = data.build;
          else if (data.build !== build.current) stale.current = true;
        })
        .catch(() => {});

    check();
    const every = window.setInterval(check, 30_000);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(every);
      window.removeEventListener("focus", check);
    };
  }, []);

  /* Going somewhere is the moment to pick up a new build: the page is about to
   * change anyway, so the reload costs nothing. */
  const go = (id: string) => {
    setSearching(false);
    setSheet(false);
    if (stale.current) {
      history.replaceState(null, "", `#${id}`);
      location.reload();
      return;
    }
    setViewer(null);
    setHere(id);
    if (isApp(id)) setLastApp(id);
    else setLastPane(id);
    history.replaceState(null, "", `#${id}`);
  };

  /* ---- going back inside a framed app ---------------------------------- */

  /*
   * An iframe's own history is not ours to read, and its back button would walk
   * the whole control center back. So each frame's path is sampled and kept as
   * a stack here: that is what ⌘[ pops. `expected` holds the path we just asked
   * a frame to go to, so the sampler does not record our own move as a visit.
   */
  const frameEls = useRef<Record<string, HTMLIFrameElement | null>>({});
  const trail = useRef<Record<string, string[]>>({});
  const expected = useRef<Record<string, string>>({});
  const [canBack, setCanBack] = useState(false);

  useEffect(() => {
    const sample = () => {
      for (const section of APPS) {
        let path: string | null = null;
        try {
          const location = frameEls.current[section.id]?.contentWindow?.location;
          path =
            location && location.href !== "about:blank"
              ? `${location.pathname}${location.search}${location.hash}`
              : null;
        } catch {
          /* a frame on another origin — nothing to follow */
          path = null;
        }
        /* A question in the query string is a one-off, not a place. */
        if (!path || /[?&]ask=/.test(path)) continue;

        const stack = (trail.current[section.id] ??= []);
        const waiting = expected.current[section.id];
        if (waiting) {
          if (path === waiting) delete expected.current[section.id];
          continue;
        }
        if (stack[stack.length - 1] === path) continue;
        /* Stepping onto the previous entry is a back, not a new visit. */
        if (stack[stack.length - 2] === path) stack.pop();
        else stack.push(path);
      }

      const stack = isApp(here) ? trail.current[here] : undefined;
      setCanBack(!!viewer || (stack?.length ?? 0) > 1);
    };

    sample();
    const every = window.setInterval(sample, 400);
    return () => window.clearInterval(every);
  }, [here, viewer]);

  const back = useCallback(() => {
    if (viewer) {
      setViewer(null);
      setViewerClosed((n) => n + 1);
      return;
    }
    if (!isApp(here)) return;

    const stack = trail.current[here];
    const frame = frameEls.current[here]?.contentWindow;
    if (!stack || stack.length < 2 || !frame) return;

    stack.pop();
    const target = stack[stack.length - 1];
    expected.current[here] = target;
    /* A framed app can offer a soft navigation; otherwise replace, so the
     * frame's own history does not grow a step we already popped. */
    const soft = frame.__chalkGo;
    try {
      if (soft) soft(target);
      else frame.location.replace(target);
    } catch {
      delete expected.current[here];
    }
  }, [here, viewer]);

  const backRef = useRef(back);
  useEffect(() => {
    backRef.current = back;
  }, [back]);

  /* ---- full screen ----------------------------------------------------- */

  const [full, setFull] = useState(false);

  useEffect(() => {
    const host = shell();
    if (host?.onFullscreen) {
      host.fullscreenNow?.()
        .then((on) => setFull(!!on))
        .catch(() => {});
      const stop = host.onFullscreen((on) => setFull(!!on));
      return () => stop?.();
    }
    const sync = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFull = useCallback(() => {
    const host = shell();
    if (host?.fullscreen) {
      host.fullscreen();
      return;
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  /* Going full screen hides the rail with it; leaving brings it back. */
  const [railHidden, setRailHidden] = useState(false);
  const [wasFull, setWasFull] = useState(full);
  if (full !== wasFull) {
    setWasFull(full);
    setRailHidden(full);
  }

  /* A real phone gets the tab bar; a narrow Mac window keeps the rail, folded
   * down to icons with the label as a tooltip. */
  const onPhone = phone && !shell();
  const folded = phone && !full && !searching && !onPhone;

  /* The board renderer asks whether it is full screen, from inside a frame. */
  const fullRef = useRef(full);
  const fullListeners = useRef(new Set<() => void>());
  useEffect(() => {
    fullRef.current = full;
    for (const listener of fullListeners.current) listener();
  }, [full]);

  useEffect(() => {
    window.__chalkFull = {
      get: () => fullRef.current,
      toggle: () => toggleFull(),
      listen: (listener) => {
        fullListeners.current.add(listener);
        return () => fullListeners.current.delete(listener);
      },
    };
    return () => {
      delete window.__chalkFull;
    };
  }, [toggleFull]);

  /* ---- keys ------------------------------------------------------------ */

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.metaKey && !event.ctrlKey && event.key === "[") {
        event.preventDefault();
        backRef.current();
      } else if (event.metaKey && event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFull();
      } else if (event.metaKey && event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setRailHidden((hidden) => !hidden);
      }
    },
    [toggleFull],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  /* The same shortcuts have to work while the focus is inside a frame. */
  const listenInFrame = (frame: HTMLIFrameElement) => {
    try {
      frame.contentWindow?.addEventListener("keydown", onKey);
    } catch {
      /* another origin */
    }
  };

  /* ---- the profile ----------------------------------------------------- */

  /*
   * Typing in a field should feel immediate, but each keystroke must not reach
   * the shell. So `draft` is what the panes edit, and it is written back 400ms
   * after the last change — and on the way out of the page, whichever comes
   * first.
   */
  const [saved, save, profileReady] = usePref<Profile>("profile", DEFAULT_PROFILE);
  const [draft, setDraft] = useState<Profile>(DEFAULT_PROFILE);
  const [seen, setSeen] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);

  if (seen !== saved) {
    setSeen(saved);
    if (!dirty) setDraft({ ...DEFAULT_PROFILE, ...saved });
  }

  useEffect(() => {
    if (!profileReady || !dirty) return;
    const soon = window.setTimeout(() => {
      save(draft);
      setDirty(false);
    }, 400);
    return () => window.clearTimeout(soon);
  }, [draft, profileReady, save, dirty]);

  const update = useCallback((patch: Partial<Profile>) => {
    setDirty(true);
    setDraft((profile) => ({ ...profile, ...patch }));
  }, []);

  useMirrored();

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const unsaved = useRef(false);
  useEffect(() => {
    unsaved.current = profileReady && dirty;
  }, [profileReady, dirty]);

  useEffect(() => {
    const flush = () => {
      if (!unsaved.current) return;
      unsaved.current = false;
      save(draftRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [save]);

  /* A board open in another tab can learn something about you too. */
  useEffect(
    () =>
      onBoardProfile((patch) => {
        const merged = JSON.stringify({ ...draftRef.current, ...patch });
        if (merged !== JSON.stringify(draftRef.current)) update(patch as Partial<Profile>);
      }),
    [update],
  );

  useEffect(() => {
    if (profileReady)
      shell()?.log?.(
        `control center open — profile ${saved.name ? "set" : "empty"}, section ${here}`,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileReady]);

  /* ---- what the Mac has let chalk do ----------------------------------- */

  const [perms, setPerms] = useState<Permissions | null>(null);
  const refreshPerms = useCallback(() => {
    shell()
      ?.permissions?.()
      .then(setPerms)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshPerms();
    window.addEventListener("focus", refreshPerms);
    return () => window.removeEventListener("focus", refreshPerms);
  }, [refreshPerms]);

  /* ---- what is on top of the panes ------------------------------------- */

  const [typeAsk, setTypeAsk] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [setup, setSetup] = useState(false);
  /* false: closed. null: open at the first video. a string: open at that one. */
  const [howto, setHowto] = useState<string | null | false>(false);
  const [askToOpenApp, setAskToOpenApp] = useState(false);
  const [question, setQuestion] = useState("");

  useEffect(() => {
    const open = () => setSetup(true);
    window.addEventListener("chalk:setup-open", open);
    if (shell())
      fetch("/api/spatial/setup", { headers: { "x-chalk-app": "1" } })
        .then((response) => (response.ok ? response.json() : null))
        .then((state) => {
          if (!state || state.done || state.dismissed) return;
          setSetup(true);
        })
        .catch(() => {});
    return () => window.removeEventListener("chalk:setup-open", open);
  }, []);

  useEffect(() => {
    const host = shell();
    host?.typeAskNow?.()
      .then((asking) => {
        if (asking) setTypeAsk(true);
      })
      .catch(() => {});
    const stop = host?.onTypeAsk?.(() => setTypeAsk(true));
    return () => stop?.();
  }, []);

  /* ---- the account ----------------------------------------------------- */

  const [plan, setPlan] = useState("founder");
  const [features, setFeatures] = useState("founder");
  const [usersView, setUsersView] = useState(false);
  const [previewing, setPreviewing] = useState(true);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [app, setApp] = useState<{ known: boolean; status: AppStatus }>({
    known: false,
    status: null,
  });
  const [trial, setTrial] = useState<{ over: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/account")
      .then((response) => response.json())
      .then((data) => {
        if (data.account?.email) setAccountName(data.account.name || data.account.email);
        setTrial(
          data.period === "trial"
            ? { over: typeof data.trialEnds === "string" && Date.parse(data.trialEnds) < Date.now() }
            : null,
        );

        const status: AppStatus = data.account?.app ?? null;
        setApp({ known: true, status });

        /* Someone who has opened the Mac app before, back on the web: offer it
         * once, and never again in this browser. */
        if (
          !shell() &&
          status?.opens &&
          onAMac() &&
          !has(window.localStorage, ASKED_FOREVER) &&
          !has(window.sessionStorage, ASKED_THIS_VISIT)
        )
          setAskToOpenApp(true);

        if (A.isPlan(data.plan)) {
          setPlan(data.plan);
          setFeatures(A.isPlan(data.features) ? data.features : data.plan);
          setUsersView(data.usersView === true);
          setPreviewing(
            (data.plan === "founder" || data.previewing === true) && data.usersView !== true,
          );
        }
      })
      .catch(() => setApp({ known: true, status: null }));
  }, []);

  const setUsersViewOnServer = async (on: boolean) => {
    await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
      body: JSON.stringify({ users: on }),
    }).catch(() => {});
    window.location.reload();
  };

  /* ?as=educator shows the rail a teacher would see, without being one. */
  const [asRole] = useState<"educator" | "learner" | null>(() => {
    if (typeof window === "undefined") return null;
    const as = new URLSearchParams(window.location.search).get("as");
    if (as === "educator" || as === "teacher") return "educator";
    if (as === "learner" || as === "student") return "learner";
    return null;
  });

  const isEducator = asRole ? asRole === "educator" : teaches(saved);
  const canPreview = previewing && !asRole;
  const teachOpen = A.hasTeach(features) || asRole === "educator";
  /* A teacher whose Teach section is not available lands on Teach-as-Home. */
  const teachAsHome = isEducator && !canPreview && teachOpen;
  const homePath = teachAsHome ? "/teach" : "/learn";

  const railSections = APPS.filter(
    (section) =>
      (section.id !== "teach" || (canPreview && teachOpen)) &&
      (section.id !== "agents" || A.hasAutopilot(features)),
  );

  const pathFor = (id: string) => (id === "home" ? homePath : APP_PATHS.get(id));

  /* Home changing where it points invalidates its back trail. */
  useEffect(() => {
    trail.current.home = [];
    delete expected.current.home;
  }, [homePath]);

  /* Keep the open frames honest about the rail we actually have. */
  if (teachAsHome && here === "teach") {
    setHere("home");
    setLastApp("home");
  } else if (teachAsHome && lastApp === "teach") {
    setLastApp("home");
  } else if (teachAsHome && frames.teach) {
    const { teach, ...rest } = frames;
    setFrames({ ...rest, home: teach });
  } else if (frames.home?.n === 0 && frames.home.path !== homePath) {
    setFrames({ ...frames, home: { path: homePath, n: 0 } });
  } else if (isApp(here) && pathFor(here) && !frames[here]) {
    setFrames({ ...frames, [here]: { path: pathFor(here) as string, n: 0 } });
  }

  /* ---- warming the next frame ------------------------------------------ */

  /*
   * Once the section you are on has loaded and the machine is idle, the next
   * section nobody has opened yet is loaded behind it. Switching to it is then
   * instant. It stays warm for twenty seconds, and is otherwise just an open
   * frame like any other.
   */
  const [loaded, setLoaded] = useState(() => new Set<string>());
  const [warm, setWarm] = useState<string | null>(null);

  const toWarm =
    isApp(here) && APP_PATHS.has(here) && loaded.has(here) && !warm
      ? (railSections.find((section) => section.path && section.id !== here && !frames[section.id])
          ?.id ?? null)
      : null;

  useEffect(() => {
    if (!toWarm) return;
    const path = pathFor(toWarm);
    if (!path) return;

    let idle = 0;
    const soon = window.setTimeout(() => {
      const start = () => {
        setFrames((open) => (open[toWarm] ? open : { ...open, [toWarm]: { path, n: 0 } }));
        setWarm(toWarm);
      };
      idle =
        typeof window.requestIdleCallback === "function"
          ? window.requestIdleCallback(start, { timeout: 2000 })
          : window.setTimeout(start, 16);
    }, 1200);

    return () => {
      window.clearTimeout(soon);
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toWarm]);

  useEffect(() => {
    if (!warm) return;
    const cool = window.setTimeout(() => setWarm((id) => (id === warm ? null : id)), 20_000);
    return () => window.clearTimeout(cool);
  }, [warm]);

  /* ---- "teach me this" from the Mac app -------------------------------- */

  useEffect(() => {
    const host = shell();
    if (!host) return;

    const open = (payload: { text?: string; title?: string } | null) => {
      if (!payload?.text) return;
      try {
        sessionStorage.setItem("chalk.ask", payload.text.slice(0, 14_000));
      } catch {
        /* nothing to do: the new board will just start empty */
      }
      openViewer("/new", payload.title ? `Board: ${payload.title}` : "New board");
    };

    host.teachNow?.().then(open).catch(() => {});
    const stop = host.onTeach?.(open);
    return () => stop?.();
  }, [openViewer]);

  if (!mounted) return <div className="cc" />;

  /* ---- what the rail shows --------------------------------------------- */

  const onMac = !!shell();
  const name = draft.name?.trim() || accountName || "You";
  const needle = query.trim().toLowerCase();

  const settingsGroups = SETTINGS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !needle || `${item.label} ${item.find}`.toLowerCase().includes(needle),
    ),
  })).filter((group) => group.items.length);

  const permRows = perms
    ? [
        { name: "Screen", ok: perms.screen },
        { name: "Accessibility", ok: perms.accessibility },
        { name: "Microphone", ok: perms.microphone },
      ]
    : [];

  const onApp = isApp(here);
  const framed = onApp && APP_PATHS.has(here);

  const foot = (
    <div className="cc-foot">
      {trial && here !== "plan" && (onMac || app.status?.has) ? (
        <GetAppRow over={trial.over} fold={folded} onGet={() => go("plan")} />
      ) : !onMac && app.known && here !== "spatial" ? (
        <GetMacRow app={app.status} section={here} fold={folded} onGet={() => go("spatial")} />
      ) : null}

      {onMac && perms && permRows.some((row) => !row.ok) ? (
        <div className="cc-can">
          {permRows
            .filter((row) => !row.ok)
            .map((row) => (
              <button
                type="button"
                className="cc-can-row"
                onClick={() => go("privacy")}
                key={row.name}
              >
                <PermissionDot on={row.ok} size={16} />
                {row.name} is off
                <em>Fix</em>
              </button>
            ))}
          {perms && !perms.microphone ? (
            <button
              type="button"
              className="cc-can-row cc-can-type"
              onClick={() => setTypeAsk(true)}
            >
              Type a question instead
              <em>⌘⌥</em>
            </button>
          ) : null}
        </div>
      ) : null}

      {asRole ? (
        <a
          className="cc-view"
          href="/control"
          aria-label={`Exit the ${asRole === "educator" ? "teacher’s" : "learner’s"} view`}
          title={folded ? `Exit the ${asRole === "educator" ? "teacher’s" : "learner’s"} view` : undefined}
        >
          <span className="cc-view-label">
            {asRole === "educator" ? "Teacher’s view" : "Learner’s view"}
          </span>
          <span className="cc-view-exit">Exit</span>
          <LogOut className="cc-view-icon" size={18} strokeWidth={1.9} aria-hidden />
        </a>
      ) : null}

      {usersView ? (
        <button
          type="button"
          className="cc-view"
          onClick={() => void setUsersViewOnServer(false)}
          aria-label="Back to my view"
          title={folded ? "Users' view — back to mine" : undefined}
        >
          <span className="cc-view-label">Users’ view</span>
          <span className="cc-view-exit">My view</span>
          <Eye className="cc-view-icon" size={18} strokeWidth={1.9} aria-hidden />
        </button>
      ) : plan !== "founder" || asRole ? null : (
        <button
          type="button"
          className="cc-nav"
          onClick={() => void setUsersViewOnServer(true)}
          aria-label="See what users see"
          title={folded ? "See what users see" : undefined}
        >
          <Eye size={18} strokeWidth={1.9} />
          <span className="cc-nav-label">See what users see</span>
        </button>
      )}

      <button
        type="button"
        className="cc-nav"
        onClick={() => setHowto(null)}
        aria-label="How-to videos"
        title={folded ? "How-to videos" : undefined}
      >
        <CirclePlay size={18} strokeWidth={1.9} />
        <span className="cc-nav-label">How-to videos</span>
      </button>

      <button
        type="button"
        className="cc-nav"
        onClick={() => setReporting(true)}
        aria-label="Report a problem"
        title={folded ? "Report a problem" : undefined}
      >
        <LifeBuoy size={18} strokeWidth={1.9} />
        <span className="cc-nav-label">Report a problem</span>
      </button>

      <button
        type="button"
        className="cc-nav cc-nav-full"
        onClick={toggleFull}
        title={`${full ? "Exit full screen" : "Full screen"}  ⌃⌘F`}
        aria-pressed={full}
      >
        {full ? <Minimize2 size={18} strokeWidth={1.9} /> : <Maximize2 size={18} strokeWidth={1.9} />}
        <span className="cc-nav-label">{full ? "Exit full screen" : "Full screen"}</span>
      </button>

      {onApp ? (
        <button
          type="button"
          className="cc-nav cc-nav-settings"
          onClick={() => go(lastPane)}
          aria-label="Settings"
          title={folded ? "Settings" : undefined}
        >
          <SettingsIcon size={18} strokeWidth={1.9} />
          <span className="cc-nav-label">Settings</span>
        </button>
      ) : null}

      <button
        type="button"
        className="cc-me"
        onClick={() => go("plan")}
        aria-label={`${name} — ${A.PLANS[plan].name} plan`}
        title={folded ? `${name} · ${A.PLANS[plan].name} plan` : undefined}
      >
        <Person name={draft.name} size={30} />
        <span className="cc-me-text">
          <div className="cc-me-name">{name}</div>
          <div className="cc-me-plan">
            {A.PLANS[plan].name} plan{onMac || accountName ? "" : " · this browser"}
          </div>
        </span>
        <ChevronRight size={14} color="var(--fg-3)" />
      </button>
    </div>
  );

  const navButton = (id: string, label: string) => {
    const on = here === id && !viewer;
    return (
      <button
        type="button"
        className="cc-nav"
        data-on={on}
        aria-current={on ? "page" : undefined}
        aria-label={label}
        title={folded ? label : undefined}
        onClick={() => go(id)}
        key={id}
      >
        <SectionIcon id={id} size={22} />
        <span className="cc-nav-label">{label}</span>
      </button>
    );
  };

  /* Four sections fit across the bottom of a phone; the rest go in the sheet. */
  const tabs = railSections.slice(0, 4);
  const inSheet = !viewer && !tabs.some((section) => section.id === here);
  const allPanes = SETTINGS.flatMap((group) => group.items);

  return (
    <div
      className="cc"
      data-mac={onMac || undefined}
      data-fold={folded || undefined}
      data-phone={onPhone || undefined}
      data-full={full || undefined}
      data-hidden={railHidden || undefined}
    >
      {/* On the Mac the window has no title bar, so the top of the rail drags it. */}
      {onMac && !full ? (
        <div
          className="cc-drag"
          aria-hidden
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            if (event.detail === 2) shell()?.titleDoubleClick?.();
            else shell()?.dragWindow?.();
          }}
        />
      ) : null}

      {railHidden ? (
        <div className="cc-dock">
          <button
            type="button"
            className="cc-dock-btn"
            onClick={() => setRailHidden(false)}
            title="Show sidebar  ⌃⌘S"
            aria-label="Show sidebar"
          >
            <PanelLeftOpen size={17} strokeWidth={2} />
            <span>Show sidebar</span>
          </button>
          {full ? (
            <button
              type="button"
              className="cc-dock-btn"
              onClick={toggleFull}
              title="Exit full screen  ⌃⌘F"
              aria-label="Exit full screen"
            >
              <Minimize2 size={16} strokeWidth={2} />
              <span>Exit full screen</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <ArtDefs />

      {setup ? (
        <SpatialSetup
          onClose={() => setSetup(false)}
          profile={draft}
          update={update}
          onWatch={(video) => setHowto(video)}
        />
      ) : null}

      {howto !== false ? (
        <HowTo start={howto ?? undefined} onClose={() => setHowto(false)} />
      ) : null}

      {askToOpenApp && !onMac ? (
        <OpenAppAsk section={here} onClose={() => setAskToOpenApp(false)} />
      ) : null}

      {reporting ? (
        <ReportProblem
          page={`${here}${frames[here]?.path ? ` ${frames[here]?.path}` : ""}`}
          onClose={() => setReporting(false)}
        />
      ) : null}

      {typeAsk ? (
        <TypeAsk
          question={question}
          onQuestion={setQuestion}
          onClose={() => setTypeAsk(false)}
          onFixMicrophone={() => {
            setTypeAsk(false);
            go("privacy");
          }}
        />
      ) : null}

      {onApp ? (
        <nav className="cc-rail" aria-label="chalk">
          <div className="cc-brand">
            <span className="cc-brand-name">
              <ChalkMark size={26} />
              chalk
            </span>
            <span className="cc-brand-tools">
              <button
                type="button"
                className="cc-hist"
                aria-label="Back"
                title="Back  ⌘["
                disabled={!canBack}
                onClick={back}
              >
                <ArrowLeft size={18} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className="cc-hist"
                aria-label="Hide sidebar"
                title="Hide sidebar  ⌃⌘S"
                onClick={() => setRailHidden(true)}
              >
                <PanelLeftClose size={18} strokeWidth={2} />
              </button>
            </span>
          </div>
          <div className="cc-navs">
            {railSections.map((section) => navButton(section.id, section.label))}
          </div>
          {foot}
        </nav>
      ) : (
        <nav className="cc-rail" aria-label="Settings">
          <button
            type="button"
            className="cc-back"
            onClick={() => go(lastApp)}
            aria-label="Back to chalk"
            title={folded ? "Back to chalk" : undefined}
          >
            <ChevronLeft size={16} strokeWidth={2.2} />
            <span className="cc-nav-label">Back to chalk</span>
          </button>

          <button
            type="button"
            className="cc-nav cc-find-open"
            aria-label="Search settings"
            title="Search settings"
            onClick={() => {
              setSearching(true);
              requestAnimationFrame(() => searchBox.current?.focus());
            }}
          >
            <Search size={18} strokeWidth={1.9} />
          </button>

          <div className="cc-find">
            <Search size={15} />
            <input
              ref={searchBox}
              className="cc-input"
              value={query}
              placeholder="Search settings"
              aria-label="Search settings"
              onChange={(event) => setQuery(event.target.value)}
              onBlur={() => {
                if (!query.trim()) setSearching(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing && settingsGroups[0]) {
                  go(settingsGroups[0].items[0].id);
                  setQuery("");
                } else if (event.key === "Escape") {
                  setQuery("");
                }
              }}
            />
          </div>

          {settingsGroups.length === 0 ? (
            <div className="cc-nav-none">Nothing called that.</div>
          ) : (
            settingsGroups.map((group) => (
              <div key={group.label}>
                <div className="cc-nav-group">{group.label}</div>
                <div className="cc-navs">
                  {group.items.map((item) => navButton(item.id, item.label))}
                </div>
              </div>
            ))
          )}
          {foot}
        </nav>
      )}

      {/*
        Every app that has been opened keeps its frame, hidden. Remounting is
        what the `n` in the key is for: a deep link re-points an already open
        frame, and only then should it reload.
      */}
      <div className="cc-apps" hidden={!framed}>
        {APPS.map((section) => {
          const open = frames[section.id];
          if (!open) return null;
          return (
            <iframe
              className={`cc-app-frame${section.id === warm && section.id !== here ? " cc-app-frame--warm" : ""}`}
              src={open.path}
              title={section.label}
              hidden={section.id !== here && section.id !== warm}
              ref={(element) => {
                frameEls.current[section.id] = element;
              }}
              onLoad={(event) => {
                delete expected.current[section.id];
                listenInFrame(event.currentTarget);
                setLoaded((done) => (done.has(section.id) ? done : new Set(done).add(section.id)));
                setWarm((id) => (id === section.id ? null : id));
              }}
              allow="microphone; clipboard-write; clipboard-read; fullscreen"
              key={`${section.id}:${open.n}:${open.n ? "" : open.path}`}
            />
          );
        })}
      </div>

      <main className="cc-main" hidden={framed}>
        {onPhone && !onApp ? (
          <div
            className="cc-setbar"
            aria-label="Settings"
            ref={(element) => {
              const current = element?.querySelector<HTMLElement>('[data-on="true"]');
              if (!element || !current || scrolledChips.current === here) return;
              scrolledChips.current = here;
              element.scrollLeft = current.offsetLeft - (element.clientWidth - current.clientWidth) / 2;
            }}
          >
            {allPanes.map((pane) => (
              <button
                type="button"
                className="cc-setchip"
                data-on={here === pane.id}
                aria-current={here === pane.id ? "page" : undefined}
                onClick={() => go(pane.id)}
                key={pane.id}
              >
                {pane.label}
              </button>
            ))}
          </div>
        ) : null}

        {trial?.over && here !== "plan" ? (
          <div className="cc-trial-over" role="status">
            <span>{A.TRIAL_OVER}</span>
            <Btn variant="primary" size="sm" onClick={() => go("plan")}>
              Choose a plan
            </Btn>
          </div>
        ) : null}

        <PaneProvider
          value={{
            art: here,
            order: [...railSections.map((section) => section.id), ...SETTINGS_IDS],
            names: SECTION_NAMES,
            go: (id) => {
              if (ALL_IDS.includes(id)) go(id);
            },
          }}
        >
          {here === "you" ? (
            <YouPane profile={draft} update={update} />
          ) : here === "memory" ? (
            <MemoryPane profile={draft} update={update} go={go} />
          ) : here === "learn" ? (
            <LearnPane profile={draft} update={update} />
          ) : here === "plan" ? (
            <PlanPane onChange={setPlan} />
          ) : here === "privacy" ? (
            <PrivacyPane perms={perms} onRefresh={refreshPerms} />
          ) : here === "spatial" ? (
            <SpatialPane />
          ) : here === "board" ? (
            <BoardPane profile={draft} update={update} />
          ) : here === "cursor" ? (
            <CursorPane />
          ) : here === "library" ? (
            <LibraryPane onOpen={openViewer} version={viewerClosed} />
          ) : here === "apps" ? (
            <AppsPane
              educator={isEducator}
              onTeach={(title, text) => {
                try {
                  sessionStorage.setItem("chalk.ask", `Teach me this — "${title}":\n\n${text.slice(0, 12_000)}`);
                } catch {
                  /* the board will start empty */
                }
                openViewer("/new", `Learning: ${title}`);
              }}
            />
          ) : null}
        </PaneProvider>
      </main>

      {/* A board or a page opened from a pane, over everything, with its own bar. */}
      {viewer ? (
        <Viewer
          key={viewer.n}
          path={viewer.path}
          title={viewer.title}
          onFrame={listenInFrame}
          onBack={() => {
            setViewer(null);
            setViewerClosed((n) => n + 1);
          }}
        />
      ) : null}

      {onPhone ? (
        <nav className="cc-tabs" aria-label="chalk">
          {tabs.map((section) => {
            /* On Home, the back arrow takes the place of the Home tab, since
             * that is where a board was opened from. */
            if (section.id === "home" && canBack && !viewer)
              return (
                <button type="button" className="cc-tab cc-tab-back" onClick={back} key="back">
                  <ChevronLeft size={26} strokeWidth={2.2} />
                  <span>Back</span>
                </button>
              );

            const on = here === section.id && !viewer && !sheet;
            return (
              <button
                type="button"
                className="cc-tab"
                data-on={on}
                aria-current={on ? "page" : undefined}
                onClick={() => {
                  /* Tapping the tab you are on goes back to the top of it. */
                  if (!on) {
                    go(section.id);
                    return;
                  }
                  const stack = trail.current[section.id];
                  const frame = frameEls.current[section.id]?.contentWindow;
                  if (!stack || stack.length < 2 || !frame) return;
                  const root = stack[0];
                  stack.length = 1;
                  expected.current[section.id] = root;
                  const soft = frame.__chalkGo;
                  try {
                    if (soft) soft(root);
                    else frame.location.replace(root);
                  } catch {
                    delete expected.current[section.id];
                  }
                }}
                key={section.id}
              >
                <SectionIcon id={section.id} size={24} />
                <span>{section.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="cc-tab"
            data-on={sheet || inSheet}
            aria-expanded={sheet}
            aria-haspopup="dialog"
            onClick={() => setSheet((open) => !open)}
          >
            <Ellipsis size={24} strokeWidth={2.2} />
            <span>More</span>
          </button>
        </nav>
      ) : null}

      {onPhone && sheet ? (
        <div
          className="cc-sheet-wrap"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSheet(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSheet(false);
          }}
        >
          <div
            className="cc-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("button, a")) setSheet(false);
            }}
          >
            <div className="cc-sheet-grip" aria-hidden />
            <div className="cc-navs">
              {railSections.slice(4).map((section) => navButton(section.id, section.label))}
              <button type="button" className="cc-nav" data-on={!onApp} onClick={() => go(lastPane)}>
                <SettingsIcon size={20} strokeWidth={1.9} />
                <span className="cc-nav-label">Settings</span>
              </button>
            </div>
            {foot}
          </div>
        </div>
      ) : null}
    </div>
  );
}
