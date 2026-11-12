"use client";

/*
 * How you learn: what chalk leads with, and what you already know.
 *
 * The level is per subject rather than one overall setting, because one setting
 * would always be wrong about something — someone can know music production
 * well and be new to statistics.
 */

import { useState } from "react";
import { X } from "lucide-react";

import { LEVELS, MODALITIES, type Level, type Profile } from "@/lib/profile";

import { Pane } from "../pane";
import { Btn, Card, Choice, Row, Section } from "../primitives";

export function LearnPane({
  profile,
  update,
}: {
  profile: Profile;
  update: (patch: Partial<Profile>) => void;
}) {
  const [adding, setAdding] = useState("");
  const subjects = Object.entries(profile.level);

  const setLevel = (subject: string, level: Level | null) => {
    const key = subject.trim().toLowerCase();
    if (!key) return;
    const level_ = { ...profile.level };
    if (level === null) delete level_[key];
    else level_[key] = level;
    update({ level: level_ });
  };

  const add = () => {
    const subject = adding.trim();
    if (!subject) return;
    if (!profile.level[subject.toLowerCase()]) setLevel(subject, "beginner");
    setAdding("");
  };

  return (
    <Pane
      title="How you learn"
      lede="How chalk explains things to you — on your screen and on a board."
    >
      <Section title="Style" desc="What chalk leads with when it explains something new.">
        <Choice
          value={profile.modality}
          options={MODALITIES.map((one) => ({
            value: one.value,
            label: one.label,
            hint: one.hint,
          }))}
          onChange={(modality) => update({ modality })}
        />
      </Section>

      <Section
        title="What you already know"
        meta={subjects.length ? `${subjects.length} subject${subjects.length === 1 ? "" : "s"}` : undefined}
        desc="Per subject — you can know music production well and be new to statistics."
      >
        <Card>
          {subjects.map(([subject, level]) => (
            <Row
              key={subject}
              title={subject[0].toUpperCase() + subject.slice(1)}
              side={
                <>
                  <select
                    className="cc-select"
                    style={{ width: 160 }}
                    value={level}
                    onChange={(event) => setLevel(subject, event.target.value as Level)}
                    aria-label={`Your level at ${subject}`}
                  >
                    {LEVELS.map((one) => (
                      <option value={one.value} key={one.value}>
                        {one.label}
                      </option>
                    ))}
                  </select>
                  <Btn
                    variant="ghost"
                    size="sm"
                    icon={X}
                    label={`Remove ${subject}`}
                    onClick={() => setLevel(subject, null)}
                  />
                </>
              }
            />
          ))}

          <Row
            title={
              <input
                className="cc-input"
                value={adding}
                placeholder="Add a subject — calculus, Figma, guitar…"
                aria-label="Add a subject"
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
    </Pane>
  );
}
