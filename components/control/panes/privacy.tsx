"use client";

/*
 * Privacy: what chalk is allowed to do on this Mac, what leaves it, and every
 * link that has been shared out of it.
 *
 * The microphone is the one permission a browser can grant by itself, so
 * "Allow" asks for it directly; the rest can only be switched on in System
 * Settings, and chalk can open the right page there.
 */

import { useEffect, useState } from "react";

import { shell, type Permissions } from "@/lib/prefs";

import { Pane } from "../pane";
import { PermissionDot } from "../shell-extras";
import { Btn, Card, Row, Section } from "../primitives";

const PERMISSIONS = [
  {
    key: "screen",
    name: "Screen Recording",
    why: "So chalk can see what you're asking about — only while you hold ⌘⌥.",
  },
  {
    key: "accessibility",
    name: "Accessibility",
    why: "So chalk can name the exact button it points at, and type or press when you say yes.",
  },
  {
    key: "microphone",
    name: "Microphone",
    why: "So chalk hears you while you hold ⌘⌥, checks your speaking practice, and records the classes you ask it to.",
  },
] as const;

/** What kind of thing a shared link points at. */
const SHARED_KINDS: Record<string, string> = {
  page: "Page",
  deck: "Slides",
  artifact: "Lesson",
  board: "Board",
  course: "Course",
  quiz: "Quiz",
  flashcards: "Flashcards",
  recording: "Recording",
  agent: "Agent",
};

type Share = { token: string; title: string; kind: string; createdAt: string | number };

function SharedLinks() {
  const [shares, setShares] = useState<Share[] | null>(null);

  const load = () =>
    fetch("/api/share", { headers: { "x-chalk-app": "1" } })
      .then((response) => response.json())
      .then((data) => setShares(data.shares ?? []))
      .catch(() => setShares([]));

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  const stop = async (share: Share) => {
    if (
      !window.confirm(
        `Stop sharing “${share.title}”? The link stops working for everyone who has it.`,
      )
    )
      return;
    await fetch(`/api/share/${share.token}`, {
      method: "DELETE",
      headers: { "x-chalk-app": "1" },
    }).catch(() => {});
    void load();
  };

  return (
    <Section
      title="Shared links"
      meta={shares ? `${shares.length} shared` : undefined}
      desc="View-only links to things you shared. Anyone with a link can open it until you stop sharing."
    >
      <Card>
        {shares === null ? (
          <Row title="Reading your links…" />
        ) : shares.length === 0 ? (
          <Row
            title="Nothing shared"
            help="Use Share on a lesson, course, page or board to make a view-only link."
          />
        ) : (
          shares.map((share) => (
            <Row
              key={share.token}
              title={share.title}
              help={`${SHARED_KINDS[share.kind] ?? share.kind} · shared ${new Date(
                share.createdAt,
              ).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
              side={
                <Btn size="sm" variant="ghost" onClick={() => void stop(share)}>
                  Stop sharing
                </Btn>
              }
            />
          ))
        )}
      </Card>
    </Section>
  );
}

export function PrivacyPane({
  perms,
  onRefresh,
}: {
  perms: Permissions | null;
  onRefresh: () => void;
}) {
  const host = shell();
  const allowed = perms
    ? PERMISSIONS.filter((one) => (perms as Record<string, boolean>)[one.key]).length
    : 0;

  const allow = async (key: string) => {
    /* The browser can ask for the microphone itself; granting it here is
     * enough, and avoids sending someone to System Settings for nothing. */
    if (key === "microphone" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        onRefresh();
        return;
      } catch {
        /* refused, or no device — fall through to System Settings */
      }
    }
    host?.openSettings?.(key);
  };

  return (
    <Pane title="Privacy" lede="What chalk can do on this Mac, and what leaves it.">
      <Section
        title="Permissions"
        meta={perms ? `${allowed} of ${PERMISSIONS.length} allowed` : undefined}
      >
        <Card>
          {host ? (
            PERMISSIONS.map((one) => {
              const ok = perms ? (perms as Record<string, boolean>)[one.key] : false;
              return (
                <Row
                  key={one.key}
                  lead={perms ? <PermissionDot on={ok} size={24} /> : undefined}
                  title={one.name}
                  help={one.why}
                  side={
                    perms && !ok ? (
                      <Btn size="sm" onClick={() => void allow(one.key)}>
                        {one.key === "microphone" ? "Allow" : "Open Settings"}
                      </Btn>
                    ) : perms ? (
                      <span className="cc-meta">Allowed</span>
                    ) : null
                  }
                />
              );
            })
          ) : (
            <div className="cc-empty">Open chalk for Mac to see these.</div>
          )}
        </Card>
      </Section>

      <Section title="What leaves this Mac">
        <Card>
          <Row
            title="When you ask"
            help="The screenshot, the names of what's on screen, what you said, and what you set under You and How you learn — sent to chalk’s AI to answer."
          />
          <Row
            title="Doing things for you"
            help="Typing, pressing, copying and opening links happen only after you tap ⌘⌥ or click Do it. chalk never offers to send, pay or delete."
          />
          <Row
            title="Class recordings"
            help="Only when you start one: your microphone goes, a few seconds at a time, to be transcribed. Silence is never sent, and the audio is never kept — only the words. macOS shows its recording light the whole time."
          />
          <Row
            title="Recordings"
            help="chalk is hidden from screen recordings and shares unless you turn that on under Spatial."
          />
          <Row
            title="Apps"
            help="Connections and their tokens stay on this Mac. chalk only reads from them."
          />
        </Card>
      </Section>

      <SharedLinks />
    </Pane>
  );
}
