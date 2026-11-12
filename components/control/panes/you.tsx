"use client";

/*
 * You: the profile, and the one-off import that fills it in from the chats
 * someone already has elsewhere.
 *
 * The import is deliberately a review step. chalk reads the export, proposes
 * what it thinks it learned, and nothing is kept until it is ticked — the chats
 * themselves are never stored.
 */

import { useRef, useState } from "react";
import { X } from "lucide-react";

import { Person } from "@/components/art/section-art";
import { LEVEL_WORDS, teaches, type Level, type Profile } from "@/lib/profile";
import { shell } from "@/lib/prefs";

import { Pane } from "../pane";
import { Btn, Card, Check, Field, Row, Section, Switch, Tag } from "../primitives";

type Update = (patch: Partial<Profile>) => void;

/** What chalk proposes to add, read out of an export. */
type Proposal = {
  name?: string;
  role?: string;
  about?: string;
  subjects: { subject: string; level: Level }[];
  memories?: string[];
  vocabulary: string[];
};

type Read = {
  source: "claude" | "chatgpt" | string;
  conversations: number;
  messages: number;
  proposal: Proposal;
};

type ImportState =
  | { at: "idle" }
  | { at: "reading"; file: string }
  | { at: "failed"; why: string }
  | { at: "review"; read: Read }
  | { at: "added"; n: number };

/*
 * Open a page and, on the Mac, have chalk walk the person through it rather
 * than leaving them to find a buried setting on their own.
 */
const openAndWalk = (url: string, ask?: string) => {
  const host = shell() as (ReturnType<typeof shell> & { openURL?: (url: string) => void }) | null;
  if (ask && host?.askScreen) host.askScreen(ask);
  else if (host?.openURL) host.openURL(url);
  else window.open(url, "_blank");
};

/** Warn when ticking this would replace something already written. */
const replaces = (mine: string | undefined, proposed: string) => {
  const kept = mine?.trim();
  if (kept && kept !== proposed.trim())
    return `Ticking this replaces yours: “${kept.length > 80 ? `${kept.slice(0, 80)}…` : kept}”`;
};

const withWarning = (proposed: string, mine: string | undefined) => {
  const warning = replaces(mine, proposed);
  return warning ? (
    <>
      {proposed}
      <br />
      {warning}
    </>
  ) : (
    proposed
  );
};

function ImportProfile({ profile, update }: { profile: Profile; update: Update }) {
  const picker = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ at: "idle" });
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [words, setWords] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const read = async (file: File) => {
    setState({ at: "reading", file: file.name });

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/profile/import", {
        method: "POST",
        headers: { "x-chalk-app": "1" },
        body,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.proposal) {
        setState({ at: "failed", why: data?.message ?? "Couldn't read that file." });
        return;
      }

      const proposal: Proposal = data.proposal;
      /* Tick what would not overwrite anything already there. */
      setTicked({
        name: !!(proposal.name && !profile.name?.trim()),
        role: !!(proposal.role && !profile.role?.trim()),
        about: !!(proposal.about && !profile.about?.trim()),
        ...Object.fromEntries(proposal.subjects.map((one) => [`s:${one.subject}`, true])),
        ...Object.fromEntries((proposal.memories ?? []).map((_, i) => [`m:${i}`, true])),
      });
      setWords(proposal.vocabulary);
      setState({ at: "review", read: data });
    } catch {
      setState({ at: "failed", why: "Couldn't reach chalk to read it." });
    }
  };

  const toggle = (key: string) => setTicked((all) => ({ ...all, [key]: !all[key] }));

  const keep = (proposal: Proposal) => {
    const level = { ...profile.level };
    let added = 0;

    for (const one of proposal.subjects)
      if (ticked[`s:${one.subject}`] && !level[one.subject]) {
        level[one.subject] = one.level;
        added++;
      }

    const patch: Partial<Profile> = {
      level,
      vocabulary: Array.from(new Set([...(profile.vocabulary ?? []), ...words])).slice(0, 200),
    };
    if (ticked.name && proposal.name) {
      patch.name = proposal.name;
      added++;
    }
    if (ticked.role && proposal.role) {
      patch.role = proposal.role;
      added++;
    }
    if (ticked.about && proposal.about) {
      patch.about = proposal.about;
      added++;
    }
    update(patch);

    const memories = (proposal.memories ?? []).filter((_, i) => ticked[`m:${i}`]);
    if (memories.length) {
      added += memories.length;
      fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
        body: JSON.stringify({ texts: memories }),
      })
        .then(() => window.dispatchEvent(new Event("chalk:memory")))
        .catch(() => {});
    }

    setState({ at: "added", n: added + words.length });
  };

  const sourceName =
    state.at === "review"
      ? state.read.source === "claude"
        ? "Claude"
        : state.read.source === "chatgpt"
          ? "ChatGPT"
          : "your export"
      : "";

  return (
    <Section
      title="Import from ChatGPT or Claude"
      desc="So chalk starts out knowing you: what you study and build, your level in each subject, and the names and slang you use — explained your way, and heard right."
    >
      <div
        onDragOver={(event) => {
          if (state.at === "reading") return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file && state.at !== "reading") void read(file);
        }}
        style={{
          borderRadius: 16,
          outline: dragging ? "2px dashed var(--accent, #2f9e6e)" : "2px dashed transparent",
          outlineOffset: 4,
          transition: "outline-color 120ms ease",
        }}
      >
        <Card>
          {state.at === "review" ? (
            <>
              <Row
                title={`From ${sourceName}`}
                help={`${state.read.conversations} conversations, ${state.read.messages} of your messages. Untick anything that's wrong — only what's ticked is kept.`}
              />

              {state.read.proposal.name ? (
                <Row
                  title={`Name: ${state.read.proposal.name}`}
                  help={replaces(profile.name, state.read.proposal.name)}
                  on={ticked.name}
                  onClick={() => toggle("name")}
                  side={<Check on={!!ticked.name} />}
                />
              ) : null}

              {state.read.proposal.role ? (
                <Row
                  title="What you do"
                  help={withWarning(state.read.proposal.role, profile.role)}
                  on={ticked.role}
                  onClick={() => toggle("role")}
                  side={<Check on={!!ticked.role} />}
                />
              ) : null}

              {state.read.proposal.about ? (
                <Row
                  title="In your own words"
                  help={withWarning(state.read.proposal.about, profile.about)}
                  on={ticked.about}
                  onClick={() => toggle("about")}
                  side={<Check on={!!ticked.about} />}
                />
              ) : null}

              {state.read.proposal.subjects.map((one) => (
                <Row
                  key={one.subject}
                  title={one.subject[0].toUpperCase() + one.subject.slice(1)}
                  help={
                    profile.level[one.subject] ? "Already set — yours is kept" : LEVEL_WORDS[one.level]
                  }
                  on={ticked[`s:${one.subject}`]}
                  onClick={() => toggle(`s:${one.subject}`)}
                  side={<Check on={!!ticked[`s:${one.subject}`]} />}
                />
              ))}

              {(state.read.proposal.memories ?? []).map((memory, i) => (
                <Row
                  key={`m${i}`}
                  title={memory}
                  help={i === 0 ? "To remember" : undefined}
                  on={ticked[`m:${i}`]}
                  onClick={() => toggle(`m:${i}`)}
                  side={<Check on={!!ticked[`m:${i}`]} />}
                />
              ))}

              {words.length ? (
                <Field
                  label="Words chalk should know"
                  help="So it hears them right — tap one to drop it"
                  stack
                  group
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {words.map((word) => (
                      <button
                        type="button"
                        className="cc-btn"
                        data-variant="ghost"
                        data-size="sm"
                        onClick={() => setWords((all) => all.filter((one) => one !== word))}
                        key={word}
                      >
                        {word} <X size={12} />
                      </button>
                    ))}
                  </div>
                </Field>
              ) : null}

              <Row
                title=""
                side={
                  <>
                    <Btn variant="ghost" onClick={() => setState({ at: "idle" })}>
                      Cancel
                    </Btn>
                    <Btn variant="primary" onClick={() => keep(state.read.proposal)}>
                      Add to my profile
                    </Btn>
                  </>
                }
              />
            </>
          ) : (
            <>
              <Row
                title="1. Get your chats as a file"
                help="Press Open ChatGPT or Open Claude and chalk walks you through it on the page — where to click, one step at a time. A .zip of your chats then arrives by email in a few minutes."
                side={
                  <>
                    <Btn
                      onClick={() =>
                        openAndWalk(
                          "https://chatgpt.com/#settings/DataControls",
                          "walk me through exporting my ChatGPT data, one click at a time: open settings from my profile, then Data controls, then Export data, then confirm — point at each thing to click",
                        )
                      }
                    >
                      Open ChatGPT
                    </Btn>
                    <Btn
                      onClick={() =>
                        openAndWalk(
                          "https://claude.ai/settings/data-privacy-controls",
                          "walk me through exporting my Claude data, one click at a time: open settings from my profile, then Privacy, then Export data — point at each thing to click",
                        )
                      }
                    >
                      Open Claude
                    </Btn>
                  </>
                }
              />

              <Row
                title="2. Import it here"
                help={
                  state.at === "reading"
                    ? `Reading ${state.file} — about half a minute…`
                    : state.at === "failed"
                      ? state.why
                      : state.at === "added"
                        ? `Added ${state.n} thing${state.n === 1 ? "" : "s"} to your profile. You can bring the other one too.`
                        : dragging
                          ? "Let go to read it."
                          : "Drop the .zip on this card, or press Import and pick it. You'll see what chalk learned and choose what to keep — only that is saved, never the chats."
                }
                side={
                  <>
                    {state.at === "failed" ? (
                      <Tag tone="warn">Didn&apos;t work</Tag>
                    ) : state.at === "added" ? (
                      <Tag tone="ok">Added</Tag>
                    ) : null}
                    <Btn
                      variant="primary"
                      disabled={state.at === "reading"}
                      onClick={() => picker.current?.click()}
                    >
                      {state.at === "reading" ? "Reading…" : "Import…"}
                    </Btn>
                  </>
                }
              />

              <input
                ref={picker}
                type="file"
                accept=".zip,.json,application/zip,application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void read(file);
                }}
              />
            </>
          )}
        </Card>
      </div>
    </Section>
  );
}

export function YouPane({ profile, update }: { profile: Profile; update: Update }) {
  const about = profile.about ?? "";

  return (
    <Pane
      title="You"
      lede="What chalk knows about you, so it explains things your way. Everything here is optional."
    >
      <Section
        title="Profile"
        note="Used with each question, board, lesson and course, so the examples are yours and pitched at your age and level. Never shown to anyone else."
      >
        <Card>
          <Row
            lead={<Person name={profile.name} size={40} />}
            title={profile.name?.trim() || "You"}
            help={profile.role?.trim() || "Add your name and what you do below."}
          />

          <Field label="Name" help="What chalk calls you">
            <input
              className="cc-input"
              value={profile.name ?? ""}
              maxLength={60}
              placeholder="Your name"
              onChange={(event) => update({ name: event.target.value })}
            />
          </Field>

          <Field label="What you do">
            <input
              className="cc-input"
              value={profile.role ?? ""}
              maxLength={120}
              placeholder="Student, designer, founder…"
              onChange={(event) => update({ role: event.target.value })}
            />
          </Field>

          <Row
            title="You teach"
            help="Teach — units, lesson plans, worksheets and hand-outs — comes first in the app. Off, the app is for learning."
            side={
              <Switch
                on={teaches(profile)}
                label="You teach"
                onChange={(on) => update({ teaches: on })}
              />
            }
          />

          <Field label="Age" help="Under 16 gets everyday comparisons">
            <input
              className="cc-input"
              inputMode="numeric"
              value={profile.age ?? ""}
              placeholder="—"
              onChange={(event) => {
                const age = Number(event.target.value.replace(/\D/g, "").slice(0, 3));
                update({ age: age > 0 ? age : undefined });
              }}
            />
          </Field>

          <Field label="In your own words" aside={`${about.length}/600`} stack>
            <textarea
              className="cc-area"
              value={about}
              maxLength={600}
              rows={4}
              placeholder="What you're working on and how you like to learn — “2nd-year CS at LASU, revising algorithms. Worked examples help me most.”"
              onChange={(event) => update({ about: event.target.value })}
            />
          </Field>
        </Card>
      </Section>

      <ImportProfile profile={profile} update={update} />
    </Pane>
  );
}
