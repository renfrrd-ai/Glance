"use client";

/*
 * The small things that live around the rail rather than inside a pane: the
 * footer rows that offer the Mac app or a plan, the ask that opens the Mac app
 * for someone who already has it, the box for typing a question when the
 * microphone is off, and the viewer a board opens into.
 */

import { useEffect, useState } from "react";
import { ArrowUpRight, ExternalLink } from "lucide-react";

import { C, INK } from "@/components/art/palette";
import { ChalkMark } from "@/components/art/chalk-mark";
import { SectionTile } from "@/components/art/section-art";
import { shell } from "@/lib/prefs";

import { Btn } from "./primitives";

/** A Mac, and not an iPad pretending to be one. */
export const onAMac = () =>
  typeof navigator !== "undefined" &&
  /Macintosh|Mac OS X/.test(navigator.userAgent) &&
  (navigator.maxTouchPoints ?? 0) <= 1;

/** Hand this section over to the Mac app, if it is installed. */
export const openInApp = (section: string) => {
  window.location.href = `chalk://open${/^[a-z]{2,20}$/.test(section) ? `?section=${section}` : ""}`;
};

const STAY_ON_WEB = "chalk.web.stay";
const ASKED_APP = "chalk.web.askedApp";
const remember = (store: Storage, key: string) => {
  try {
    store.setItem(key, "1");
  } catch {
    /* private window */
  }
};

/**
 * Whether a permission is granted, drawn as a hand-stippled ring: filled and
 * ticked when it is on, three grey dots when it is not.
 */
export function PermissionDot({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <svg className="cc-ring" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9.6"
        fill="none"
        stroke={on ? C.marigold : "#5d5d63"}
        strokeWidth="2.4"
        strokeDasharray="3.1 2.55"
        strokeLinecap="round"
      />
      {on ? (
        <>
          <circle cx="12" cy="12" r="5.6" fill={C.marigold} />
          <path
            d="M9.6 12.2L11.3 13.8L14.5 10.4"
            fill="none"
            stroke={INK}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <g fill="#a8a8ad">
          <circle cx="9" cy="12" r="1.15" />
          <circle cx="12" cy="12" r="1.15" />
          <circle cx="15" cy="12" r="1.15" />
        </g>
      )}
    </svg>
  );
}

/** A colour, as a crayon-drawn dot — the cursor swatches. */
export function Swatch({ hex, on }: { hex: string; on: boolean }) {
  return (
    <svg className="cc-swatch" width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
      <g filter="url(#cc-crayon)">
        <path
          d="M12.1 2.6C17.6 2.5 21.4 6.1 21.4 11.9C21.4 17.6 17.5 21.5 12 21.4C6.4 21.4 2.6 17.7 2.6 12C2.6 6.2 6.5 2.7 12.1 2.6Z"
          fill={hex}
        />
      </g>
      {on ? (
        <path
          d="M8.2 12.3L10.9 14.9L15.9 9.4"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

/** The footer row that sells, or opens, the Mac app. */
export function GetMacRow({
  app,
  section,
  fold,
  onGet,
}: {
  app: { has?: boolean; opens?: number } | null;
  section: string;
  fold?: boolean;
  onGet: () => void;
}) {
  /* Someone who has it and has opened it on this Mac is already being asked by
   * <OpenAppAsk>; two offers at once is one too many. */
  if (app?.has && !(app.opens && onAMac())) return null;

  const installed = !!app?.has;
  const label = installed ? "Open chalk for Mac" : "Get the app";

  return (
    <button
      type="button"
      className="cc-getapp"
      onClick={() => (installed ? openInApp(section) : onGet())}
      aria-label={label}
      title={fold ? label : undefined}
    >
      <SectionTile id="spatial" size={fold ? 40 : 46} />
      <span className="cc-getapp-text">
        <b>{label}</b>
        <span>Ask about anything on your screen</span>
      </span>
      <ArrowUpRight className="cc-getapp-go" size={16} strokeWidth={2.2} aria-hidden />
    </button>
  );
}

/** The footer row during the free trial. */
export function GetAppRow({
  over,
  fold,
  onGet,
}: {
  over: boolean;
  fold?: boolean;
  onGet: () => void;
}) {
  const label = "Get premium";
  return (
    <button
      type="button"
      className="cc-getapp"
      data-premium=""
      onClick={onGet}
      aria-label={label}
      title={fold ? label : undefined}
    >
      <SectionTile id="plan" size={fold ? 40 : 46} />
      <span className="cc-getapp-text">
        <b>{label}</b>
        <span>{over ? "Your free week is over" : "Keep chalk after your free week"}</span>
      </span>
      <ArrowUpRight className="cc-getapp-go" size={16} strokeWidth={2.2} aria-hidden />
    </button>
  );
}

/**
 * Someone on the web who has the Mac app: try to hand them over, and say what
 * happened. The window losing focus just after the attempt is the only signal
 * a browser gives that a custom scheme was accepted.
 */
export function OpenAppAsk({ section, onClose }: { section: string; onClose: () => void }) {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    remember(window.sessionStorage, ASKED_APP);

    let tried = 0;
    const onBlur = () => {
      if (Date.now() - tried < 4000) setOpened(true);
    };
    window.addEventListener("blur", onBlur);

    const soon = window.setTimeout(() => {
      tried = Date.now();
      openInApp(section);
    }, 350);

    return () => {
      window.clearTimeout(soon);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="cc-getapp-ask"
      role="dialog"
      aria-modal="false"
      aria-label="Open chalk for Mac"
    >
      <ChalkMark size={46} />
      <div className="cc-getapp-ask-text">
        <b>{opened ? "Opened in chalk for Mac" : "Open chalk for Mac instead?"}</b>
        <span>
          {opened
            ? "You can close this tab, or keep going here."
            : "It’s on this Mac — and there, ⌘⌥ asks about anything on your screen."}
        </span>
      </div>
      <div className="cc-getapp-ask-row">
        {opened ? (
          <Btn variant="ghost" onClick={onClose}>
            Close
          </Btn>
        ) : (
          <>
            <Btn
              variant="ghost"
              onClick={() => {
                remember(window.localStorage, STAY_ON_WEB);
                onClose();
              }}
            >
              Use the web
            </Btn>
            <Btn variant="primary" onClick={() => openInApp(section)}>
              Open chalk
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * ⌘⌥ with no microphone: the question gets typed instead. The Mac app takes it
 * from here — it steps aside, looks at the screen, and answers there.
 */
export function TypeAsk({
  question,
  onQuestion,
  onClose,
  onFixMicrophone,
}: {
  question: string;
  onQuestion: (question: string) => void;
  onClose: () => void;
  onFixMicrophone: () => void;
}) {
  return (
    <div
      className="cc-typeask"
      role="dialog"
      aria-modal="true"
      aria-label="Ask about your screen"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="cc-typeask-card"
        onSubmit={(event) => {
          event.preventDefault();
          const asked = question.trim();
          if (!asked) return;
          shell()?.askScreen?.(asked);
          onQuestion("");
          onClose();
        }}
      >
        <div className="cc-typeask-title">Ask about your screen</div>
        <input
          className="cc-input"
          autoFocus
          value={question}
          maxLength={500}
          placeholder="What do you want to know about what's on screen?"
          aria-label="Your question"
          onChange={(event) => onQuestion(event.target.value)}
        />
        <p className="cc-typeask-note">
          The microphone is off, so type it. chalk steps aside, looks at your screen and answers
          there.
        </p>
        <div className="cc-typeask-row">
          <button type="button" className="cc-typeask-fix" onClick={onFixMicrophone}>
            Turn the microphone on
          </button>
          <span style={{ flex: 1 }} />
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <button
            type="submit"
            className="cc-btn"
            data-variant="primary"
            data-size="md"
            aria-disabled={!question.trim()}
          >
            Ask
          </button>
        </div>
      </form>
    </div>
  );
}

/** A board or a page opened from a pane, over the whole window. */
export function Viewer({
  path,
  title,
  onBack,
  onFrame,
}: {
  path: string;
  title?: string;
  onBack: () => void;
  onFrame?: (frame: HTMLIFrameElement) => void;
}) {
  const host = shell() as (ReturnType<typeof shell> & { openURL?: (url: string) => void }) | null;

  return (
    <div className="cc-viewer">
      <div className="cc-viewer-bar">
        <Btn variant="ghost" size="sm" onClick={onBack}>
          ‹ Back
        </Btn>
        <span className="cc-viewer-title">{title}</span>
        <Btn
          variant="ghost"
          size="sm"
          icon={ExternalLink}
          onClick={() => {
            const url = `${window.location.origin}${path}`;
            if (host?.openURL) host.openURL(url);
            else window.open(url, "_blank");
          }}
        >
          Open in browser
        </Btn>
      </div>
      <iframe
        className="cc-viewer-frame"
        src={path}
        title={title}
        allow="microphone; clipboard-write"
        onLoad={(event) => onFrame?.(event.currentTarget)}
      />
    </div>
  );
}
