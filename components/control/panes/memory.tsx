"use client";

/*
 * What chalk knows: the memories it carries from one day to the next, the words
 * it should hear right, and the tasks it has already walked you through.
 *
 * Memory is built from what you ask — every few questions — so the first visit
 * usually finds it still reading your history. `build=1` on the first load asks
 * the server to do that now rather than on the next question.
 */

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

import { LEVEL_WORDS, type Profile } from "@/lib/profile";
import { shell } from "@/lib/prefs";
import { when } from "@/lib/when";

import { Pane } from "../pane";
import { Btn, Card, Row, Section, Switch, Tag } from "../primitives";
import { VoiceCheck } from "../voice-check";

type Update = (patch: Partial<Profile>) => void;

type Fact = {
  id: string;
  text: string;
  /** What kind of thing it is: a project, a deadline, a preference, a struggle. */
  kind: string;
  seen: string | number;
};

type Asked = { at: string | number; question?: string; summary?: string; boardId?: string };

type MemoryState = {
  facts?: Fact[];
  /** Remembering is switched off. */
  off?: boolean;
  history?: Asked[];
};

const call = (method: string, body?: unknown, query = ""): Promise<MemoryState> =>
  fetch(`/api/memory${query}`, {
    method,
    headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then((response) => response.json());

/** The tasks chalk has taught, and how much it will say next time. */
type Skill = { id: string; goal: string; app: string; times: number };

const skillsCall = (method: string, query = ""): Promise<{ skills?: Skill[] }> =>
  fetch(`/api/skills${query}`, { method, headers: { "x-chalk-app": "1" } }).then((response) =>
    response.json(),
  );

function Skills() {
  const [skills, setSkills] = useState<Skill[] | null>(null);

  useEffect(() => {
    skillsCall("GET")
      .then((data) => setSkills(data.skills ?? []))
      .catch(() => setSkills([]));
  }, []);

  const forget = (query: string) =>
    void skillsCall("DELETE", query)
      .then((data) => setSkills(data.skills ?? []))
      .catch(() => {});

  if (!skills?.length) return null;

  return (
    <Section
      title="Tasks chalk has walked you through"
      meta={`${skills.length}`}
      desc="Each time you finish one, chalk says a little less the next time — say “walk me through it” to get every step again."
    >
      <Card>
        {skills.map((skill) => (
          <Row
            key={skill.id}
            title={skill.goal}
            help={`${skill.app} · done ${skill.times === 1 ? "once" : `${skill.times} times`} · ${
              skill.times >= 2
                ? "next time chalk lets you do it, and checks"
                : "next time chalk gives the goal and the first step"
            }`}
            side={
              <Btn
                variant="ghost"
                size="sm"
                icon={X}
                label={`Forget: ${skill.goal}`}
                onClick={() => forget(`?id=${encodeURIComponent(skill.id)}`)}
              />
            }
          />
        ))}
        <Row
          title=""
          side={
            <Btn
              variant="ghost"
              onClick={() => {
                if (window.confirm("Forget every task chalk has walked you through?")) forget("");
              }}
            >
              Forget all
            </Btn>
          }
        />
      </Card>
    </Section>
  );
}

/** Words chalk should hear as you say them. */
function Words({ profile, update }: { profile: Profile; update: Update }) {
  const [adding, setAdding] = useState("");
  const words = profile.vocabulary ?? [];

  const add = () => {
    const word = adding.trim().slice(0, 40);
    if (word && !words.includes(word)) update({ vocabulary: [...words, word].slice(0, 200) });
    setAdding("");
  };

  return (
    <Section
      title="Words chalk should know"
      meta={words.length ? `${words.length}` : undefined}
      desc="Names, products, course codes, slang — so chalk hears them as you say them instead of as something that sounds alike."
    >
      <Card>
        {words.length ? (
          <Row
            title={
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {words.map((word) => (
                  <button
                    type="button"
                    className="cc-btn"
                    data-variant="ghost"
                    data-size="sm"
                    aria-label={`Remove ${word}`}
                    onClick={() => update({ vocabulary: words.filter((one) => one !== word) })}
                    key={word}
                  >
                    {word} <X size={12} />
                  </button>
                ))}
              </div>
            }
          />
        ) : null}

        <Row
          title={
            <input
              className="cc-input"
              value={adding}
              placeholder="Add a word — LASU, Figma, CS2050…"
              aria-label="Add a word chalk should know"
              onChange={(event) => setAdding(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) add();
              }}
            />
          }
          side={
            <Btn disabled={!adding.trim()} onClick={add}>
              Add
            </Btn>
          }
        />
      </Card>
    </Section>
  );
}

export function MemoryPane({
  profile,
  update,
  go,
}: {
  profile: Profile;
  update: Update;
  go: (id: string) => void;
}) {
  const [state, setState] = useState<MemoryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [telling, setTelling] = useState("");

  const load = useCallback((build = false) => {
    call("GET", undefined, `?history=20${build ? "&build=1" : ""}`)
      .then(setState)
      .catch(() => setState({ facts: [], off: false }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(true);
    /* Something learned elsewhere — an import, or a board — shows up here. */
    const again = () => load(false);
    window.addEventListener("chalk:memory", again);
    window.addEventListener("focus", again);
    return () => {
      window.removeEventListener("chalk:memory", again);
      window.removeEventListener("focus", again);
    };
  }, [load]);

  const patch = (pending: Promise<MemoryState>) =>
    void pending
      .then((data) => setState((now) => ({ ...now, ...data })))
      .catch(() => {});

  const remember = () => {
    const text = telling.trim();
    if (!text) return;
    setTelling("");
    call("POST", { text })
      .then((data) => setState((now) => ({ ...now, ...data })))
      /* Put it back in the box rather than losing what they typed. */
      .catch(() => setTelling((now) => now || text));
  };

  const facts = state?.facts ?? [];
  const subjects = Object.entries(profile.level);
  const who = [profile.name?.trim(), profile.role?.trim()].filter(Boolean).join(" — ");

  return (
    <Pane
      title="What chalk knows"
      lede="Everything chalk knows about you and uses to help — all of it stays on this Mac, and you can change or forget any of it."
    >
      <Section title="How chalk uses this">
        <Card>
          <Row
            title="Your profile and subjects"
            help="Sent with every question and every board, so explanations start at your level in that subject and use examples from your world."
          />
          <Row
            title="Memories"
            help="What chalk carries from one day to the next — your projects, deadlines, how you like things explained, what trips you up. Used to make answers yours; never read back to you."
          />
          <Row
            title="Words and learned fixes"
            help="Your names, products, course codes and slang, so chalk hears them as you say them — in questions and in meetings."
          />
        </Card>
      </Section>

      <Section
        title="About you"
        meta={
          <button
            type="button"
            className="cc-btn"
            data-variant="ghost"
            data-size="sm"
            onClick={() => go("you")}
          >
            Edit
          </button>
        }
      >
        <Card>
          <Row
            title={who || "Not set yet"}
            help={
              profile.about?.trim() ||
              "Add what you do and what you're working on in You — or import it from ChatGPT or Claude."
            }
          />
          {subjects.length ? (
            <Row
              title="What you already know"
              help={subjects
                .map(
                  ([subject, level]) =>
                    `${subject[0].toUpperCase()}${subject.slice(1)}: ${LEVEL_WORDS[level] ?? level}`,
                )
                .join(" · ")}
              side={
                <Btn variant="ghost" size="sm" onClick={() => go("learn")}>
                  Edit
                </Btn>
              }
            />
          ) : null}
        </Card>
      </Section>

      <Section
        title="Memories"
        meta={facts.length ? `${facts.length}` : undefined}
        desc="Learned from your questions every few asks, from what you import, and from what you tell it here."
      >
        <Card>
          <Row
            title="Remember things from our conversations"
            help={
              state?.off
                ? "Off — nothing new is learned and nothing is sent with your questions."
                : "On"
            }
            side={
              <Switch
                on={!state?.off}
                label="Remember things"
                onChange={(on) => patch(call("POST", { off: !on }))}
              />
            }
          />

          {loading && !facts.length ? (
            <Row
              title="Reading what you've asked so far…"
              help="Building your memory from your history — a few seconds."
            />
          ) : null}

          {facts.map((fact) => (
            <Row
              key={fact.id}
              title={fact.text}
              help={`${fact.kind === "struggle" ? "trips you up" : fact.kind} · ${new Date(fact.seen).toLocaleDateString()}`}
              side={
                <>
                  {fact.kind === "struggle" && shell()?.askScreen ? (
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        shell()?.askScreen?.(
                          `quiz me on ${fact.text
                            .replace(/^They (?:keep getting|get|are) stuck on /i, "")
                            .replace(/[.!]+$/, "")
                            .slice(0, 75)}`,
                        )
                      }
                    >
                      Quiz me on this
                    </Btn>
                  ) : null}
                  <Btn
                    variant="ghost"
                    size="sm"
                    icon={X}
                    label={`Forget: ${fact.text}`}
                    onClick={() =>
                      patch(call("DELETE", undefined, `?id=${encodeURIComponent(fact.id)}`))
                    }
                  />
                </>
              }
            />
          ))}

          {loading || !state || facts.length ? null : (
            <Row
              title="Nothing yet"
              help="Ask chalk a few things, import from ChatGPT or Claude, or tell it something below."
            />
          )}

          <Row
            title={
              <input
                className="cc-input"
                value={telling}
                placeholder="Tell chalk something to remember — “My CS2050 exam is on November 3”"
                aria-label="Tell chalk something to remember"
                onChange={(event) => setTelling(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) remember();
                }}
              />
            }
            side={
              <Btn disabled={!telling.trim()} onClick={remember}>
                Remember
              </Btn>
            }
          />

          {facts.length ? (
            <Row
              title=""
              side={
                <Btn
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm("Forget everything chalk remembers?"))
                      patch(call("DELETE"));
                  }}
                >
                  Forget everything
                </Btn>
              }
            />
          ) : null}
        </Card>
      </Section>

      <Skills />
      <Words profile={profile} update={update} />
      <VoiceCheck profile={profile} update={update} />

      {state?.history?.length ? (
        <Section title="Recently asked" desc="What memory is learned from. The full list is in Library.">
          <Card>
            {state.history.map((asked) => (
              <Row
                key={String(asked.at)}
                compact
                title={asked.question || "(no words)"}
                help={asked.summary}
                side={
                  <>
                    {asked.boardId ? <Tag tone="neutral">Board</Tag> : null}
                    <span className="cc-row-help">{when(asked.at)}</span>
                  </>
                }
              />
            ))}
          </Card>
        </Section>
      ) : null}
    </Pane>
  );
}
