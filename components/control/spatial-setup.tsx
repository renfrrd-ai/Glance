"use client";

/*
 * Setting Spatial up: seven steps, each one tried once rather than explained.
 *
 * Most steps cannot be completed in this window at all — they happen on the
 * Mac, in another app. So the wizard watches: it polls the shell for
 * permissions and the server for what has been done, and a step ticks itself
 * off when it actually happens. Skipping is always allowed, and a skipped step
 * still counts as passed so the next one unlocks.
 */

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";

import { SectionTile } from "@/components/art/section-art";
import type { Profile } from "@/lib/profile";
import { shell, type Permissions } from "@/lib/prefs";

import { Btn } from "./primitives";
import { VoiceCheck } from "./voice-check";

const STEPS = [
  { id: "hello", label: "Meet Spatial" },
  { id: "allow", label: "Let chalk see and point" },
  { id: "voice", label: "Teach chalk your voice" },
  { id: "ask", label: "Ask a question" },
  { id: "notch", label: "Open the notch" },
  { id: "walk", label: "Get walked through" },
  { id: "ready", label: "You’re set" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/** What the server knows about this person's progress. */
type SetupState = {
  asked?: string;
  opened?: string;
  walked?: string;
  done?: boolean;
  dismissed?: boolean;
};

const saveSetup = (patch: Record<string, unknown>) =>
  fetch("/api/spatial/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
    body: JSON.stringify(patch),
  })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

/** The two keys, and what to do with them. */
function Keys({ how }: { how: "hold" | "tap" | "double" }) {
  return (
    <div className="cs-keys" data-how={how} aria-hidden>
      <span className="cs-key">
        <b>⌘</b>
        <i>command</i>
      </span>
      <span className="cs-key">
        <b>⌥</b>
        <i>option</i>
      </span>
      <em>{how === "hold" ? "hold, ask, let go" : how === "tap" ? "a quick tap" : "tap tap"}</em>
    </div>
  );
}

function Waiting({
  done,
  doneText,
  waitText,
}: {
  done: boolean;
  doneText: string;
  waitText: string;
}) {
  return (
    <div className="cs-wait" data-done={done || undefined} role="status">
      <span className="cs-wait-dot">{done ? <Check size={14} strokeWidth={3} /> : null}</span>
      {done ? doneText : waitText}
    </div>
  );
}

export function SpatialSetup({
  onClose,
  profile,
  update,
  onWatch,
}: {
  onClose: () => void;
  profile: Profile;
  update: (patch: Partial<Profile>) => void;
  /** Open a how-to film instead. */
  onWatch?: (slug: string) => void;
}) {
  const host = shell() as
    | (ReturnType<typeof shell> & { walkPermissions?: (which: string) => void })
    | null;

  const [{ at, since }, setAt] = useState<{ at: StepId; since: number }>(() => ({
    at: "hello",
    since: Date.now(),
  }));
  const goTo = useCallback((step: StepId) => setAt({ at: step, since: Date.now() }), []);

  const [voiceDone, setVoiceDone] = useState(false);
  const [words, setWords] = useState((profile.vocabulary ?? []).join(", "));
  const [perms, setPerms] = useState<(Permissions & { keys?: boolean }) | null>(null);
  const [state, setState] = useState<SetupState>({});
  const [skipped, setSkipped] = useState(new Set<StepId>());

  useEffect(() => {
    let live = true;
    const poll = () => {
      host?.permissions?.()
        .then((granted) => {
          if (live) setPerms(granted);
        })
        .catch(() => {});
      fetch("/api/spatial/setup", { headers: { "x-chalk-app": "1" } })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (live && data) setState(data);
        })
        .catch(() => {});
    };

    poll();
    const every = window.setInterval(poll, 1500);
    return () => {
      live = false;
      window.clearInterval(every);
    };
  }, [host]);

  const canTry = !!(perms?.screen && perms.accessibility && perms.keys !== false);

  const passed: Record<StepId, boolean> = {
    hello: at !== "hello",
    allow: canTry,
    voice: voiceDone,
    ask: !!state.asked,
    notch: !!state.opened,
    walk: !!state.walked,
    ready: !!state.done,
  };

  const index = STEPS.findIndex((step) => step.id === at);

  const next = useCallback(() => {
    const now = STEPS.findIndex((step) => step.id === at);
    goTo(STEPS[Math.min(STEPS.length - 1, now + 1)].id);
  }, [at, goTo]);

  /* A step that completes while you are looking at it moves on by itself. */
  const stamp = at === "ask" ? state.asked : at === "notch" ? state.opened : at === "walk" ? state.walked : undefined;
  const justNow = !!stamp && Date.parse(stamp) > since;

  useEffect(() => {
    if (!justNow) return;
    const soon = window.setTimeout(next, 1400);
    return () => window.clearTimeout(soon);
  }, [justNow, next]);

  const skip = () => {
    setSkipped((all) => new Set(all).add(at));
    next();
  };

  const finish = async () => {
    await saveSetup({ done: true });
    onClose();
  };

  const later = async () => {
    await saveSetup({ dismissed: true });
    onClose();
  };

  const permission = (
    which: "screen" | "accessibility" | "microphone" | "keys",
    title: string,
    why: string,
    optional = false,
  ) => {
    const ok = (perms as Record<string, boolean> | null)?.[which] ?? false;
    return (
      <div className="cs-perm" data-ok={ok || undefined}>
        <span className="cs-perm-dot">{ok ? <Check size={14} strokeWidth={3} /> : null}</span>
        <span className="cs-perm-text">
          <b>
            {title}
            {optional ? <em> · optional</em> : null}
          </b>
          <span>{why}</span>
        </span>
        {ok ? (
          <span className="cs-perm-on">On</span>
        ) : (
          <Btn
            size="sm"
            variant="primary"
            onClick={() => {
              /* chalk can point at the switch itself, once it is allowed to. */
              if (host?.walkPermissions) host.walkPermissions(which);
              else if (which !== "keys") host?.openSettings?.(which);
            }}
          >
            Show me
          </Btn>
        )}
      </div>
    );
  };

  return (
    <div
      className="cs"
      role="dialog"
      aria-modal="true"
      aria-label="Set up Spatial"
      onKeyDown={(event) => {
        if (event.key === "Escape") void later();
      }}
    >
      <div className="cs-card">
        <aside className="cs-side">
          <SectionTile id="spatial" size={64} />
          <h2>Set up Spatial</h2>
          <p>About two minutes. You’ll try each thing once.</p>
          <ol className="cs-steps">
            {STEPS.map((step, i) => (
              <li
                key={step.id}
                data-on={step.id === at || undefined}
                data-done={(passed[step.id] && !skipped.has(step.id)) || undefined}
              >
                <button
                  type="button"
                  onClick={() => goTo(step.id)}
                  disabled={
                    i > index && !passed[STEPS[i - 1].id] && !skipped.has(STEPS[i - 1].id)
                  }
                >
                  <span className="cs-step-n">
                    {passed[step.id] && !skipped.has(step.id) && step.id !== at ? (
                      <Check size={14} strokeWidth={3} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {step.label}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="cs-later" onClick={() => void later()}>
            Set up later
          </button>
        </aside>

        <section className="cs-main" key={at}>
          {at === "hello" ? (
            <>
              <h3>chalk, on your whole screen</h3>
              <p className="cs-lede">
                Hold ⌘⌥ anywhere on your Mac and ask about what’s in front of you. chalk answers out
                loud and points at the real button, field or line.
              </p>
              <ul className="cs-points">
                <li>
                  <b>It only looks and listens while you hold the keys.</b> The rest of the time it’s
                  out of your way.
                </li>
                <li>
                  <b>It asks before it does anything.</b> chalk can offer to click or type for you,
                  but only goes ahead when you say so — and never sends, pays or deletes.
                </li>
                <li>
                  <b>It’s invisible to screenshots and screen sharing,</b> so it never shows up in a
                  call or a recording.
                </li>
              </ul>
              <div className="cs-actions">
                <Btn variant="primary" onClick={next}>
                  Let’s go
                </Btn>
              </div>
              {onWatch ? (
                <button type="button" className="cs-watch" onClick={() => onWatch("setup")}>
                  Watch how it goes first
                </button>
              ) : null}
            </>
          ) : at === "allow" ? (
            <>
              <h3>Let chalk see, point and hear</h3>
              <p className="cs-lede">
                macOS asks you to switch each of these on. Press Show me and chalk opens System
                Settings on the right page and walks you through it on your screen — after the first
                switch, it points at each one for you.
              </p>
              <div className="cs-perms">
                {permission("screen", "Screen Recording", "So chalk can see what you're asking about.")}
                {permission(
                  "accessibility",
                  "Accessibility",
                  "So chalk can find the exact button and point at it.",
                )}
                {perms?.keys === false
                  ? permission(
                      "keys",
                      "Input Monitoring",
                      "This Mac also asks for it before chalk can notice ⌘⌥.",
                    )
                  : null}
                {permission(
                  "microphone",
                  "Microphone",
                  "So you can just ask out loud. Without it, holding the keys opens a box to type in.",
                  true,
                )}
              </div>
              {host ? null : (
                <p className="cs-note">
                  These are for chalk for Mac. In a browser, Spatial works on chalk’s own boards.
                </p>
              )}
              <div className="cs-actions">
                {canTry ? (
                  <Btn variant="primary" onClick={next}>
                    Next
                  </Btn>
                ) : (
                  <>
                    <Btn variant="ghost" onClick={skip}>
                      Skip for now
                    </Btn>
                    <span className="cs-note">
                      Screen Recording and Accessibility are needed to try it.
                    </span>
                  </>
                )}
              </div>
            </>
          ) : at === "voice" ? (
            <>
              <h3>Teach chalk your voice</h3>
              <p className="cs-lede">
                Read a few short sentences out loud. chalk learns how you say things — and the words
                you use — so it hears you right from then on. Optional, and about a minute.
              </p>
              <p className="cs-note">
                Hold the <b>Hold to read</b> button below, or the space bar, while you read each one
                — not ⌘⌥, which asks chalk a question.
              </p>
              <label className="cs-words">
                <span>Words chalk should know</span>
                <input
                  className="cc-input"
                  value={words}
                  placeholder="Your name, your course, apps you use — Ayo, CS1101, Figma"
                  onChange={(event) => setWords(event.target.value)}
                  onBlur={() =>
                    update({
                      vocabulary: [
                        ...new Set(
                          words
                            .split(/[,\n]/)
                            .map((word) => word.trim())
                            .filter(Boolean),
                        ),
                      ].slice(0, 60),
                    })
                  }
                />
              </label>
              {perms && !perms.microphone ? (
                <p className="cs-note">
                  This needs the microphone. Turn it on in the step before, or skip this — you can do
                  it later in Settings › What chalk knows.
                </p>
              ) : (
                <div className="cs-hear">
                  <VoiceCheck profile={profile} update={update} />
                </div>
              )}
              <div className="cs-actions">
                <Btn
                  variant="primary"
                  onClick={() => {
                    setVoiceDone(true);
                    next();
                  }}
                >
                  Next
                </Btn>
                <Btn variant="ghost" onClick={skip}>
                  Skip
                </Btn>
              </div>
            </>
          ) : at === "ask" ? (
            <>
              <h3>Ask your first question</h3>
              <Keys how="hold" />
              <p className="cs-lede">
                Hold <b>⌘</b> and <b>⌥</b> together, say <q>What can I do on this page?</q>, then let
                go. chalk answers and points at what it means.
              </p>
              <Waiting
                done={passed.ask}
                waitText="Waiting for your question…"
                doneText="That's Spatial. Ask about anything, in any app."
              />
              <p className="cs-note">
                Keep the two keys on their own — pressing another key with them cancels, so chalk
                never gets in the way of your shortcuts.
              </p>
              <div className="cs-actions">
                {passed.ask ? (
                  <Btn variant="primary" onClick={next}>
                    Next
                  </Btn>
                ) : (
                  <Btn variant="ghost" onClick={skip}>
                    Skip
                  </Btn>
                )}
              </div>
            </>
          ) : at === "notch" ? (
            <>
              <h3>Open the notch</h3>
              <Keys how="tap" />
              <p className="cs-lede">
                Now just <b>tap</b> ⌘⌥ — a quick press, like a click. The notch at the top of your
                screen opens with what you’re learning and what chalk is working on. Tap again to
                close it.
              </p>
              <Waiting
                done={passed.notch}
                waitText="Waiting for a tap…"
                doneText="That's the notch. It's where chalk keeps what you're doing."
              />
              <div className="cs-actions">
                {passed.notch ? (
                  <Btn variant="primary" onClick={next}>
                    Next
                  </Btn>
                ) : (
                  <Btn variant="ghost" onClick={skip}>
                    Skip
                  </Btn>
                )}
              </div>
            </>
          ) : at === "walk" ? (
            <>
              <h3>Let chalk walk you through it</h3>
              <Keys how="hold" />
              <p className="cs-lede">
                Open Finder, hold ⌘⌥ and ask <q>How do I make a new folder?</q> chalk points at each
                step on your screen. Do it, and chalk sees it and moves on.
              </p>
              <Waiting
                done={passed.walk}
                waitText="Waiting for a walkthrough…"
                doneText="Nice. Any app, any task — ask how, and chalk shows you."
              />
              <p className="cs-note">
                If chalk offers to do a step for you, tap ⌘⌥, click it, or say yes. Nothing happens
                until you do.
              </p>
              <div className="cs-actions">
                {passed.walk ? (
                  <Btn variant="primary" onClick={next}>
                    Next
                  </Btn>
                ) : (
                  <Btn variant="ghost" onClick={skip}>
                    Skip
                  </Btn>
                )}
              </div>
            </>
          ) : (
            <>
              <h3>You’re set</h3>
              <p className="cs-lede">Three moves are all there is:</p>
              <div className="cs-moves">
                <div>
                  <Keys how="hold" />
                  <b>Hold</b>
                  <span>Ask about anything on screen.</span>
                </div>
                <div>
                  <Keys how="tap" />
                  <b>Tap</b>
                  <span>Open or close the notch, or say yes to an offer.</span>
                </div>
                <div>
                  <Keys how="double" />
                  <b>Double tap</b>
                  <span>Put everything away.</span>
                </div>
              </div>
              <p className="cs-note">
                chalk’s voice, the notch’s look and whether it scrolls for you are in Settings ›
                Spatial. You can run this again from there.
              </p>
              <div className="cs-actions">
                <Btn variant="primary" onClick={() => void finish()}>
                  Start learning
                </Btn>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
