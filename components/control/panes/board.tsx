"use client";

/*
 * Board: how a board is built, and how it is walked through.
 *
 * Detail is a profile setting (it travels with the person), while narration is
 * a device setting (it depends on where you are and who can hear you) — which
 * is why the two come from different places.
 */

import { DEPTHS, LANGUAGES, type Profile } from "@/lib/profile";
import { DEFAULT_BOARD, usePref } from "@/lib/prefs";

import { Pane } from "../pane";
import { Card, Choice, Row, Section, Switch } from "../primitives";

export function BoardPane({
  profile,
  update,
}: {
  profile: Profile;
  update: (patch: Partial<Profile>) => void;
}) {
  const [board, saveBoard] = usePref("board", DEFAULT_BOARD);

  return (
    <Pane
      title="Board"
      lede="How chalk builds a board from a topic, and how it walks you through one."
    >
      <Section title="Detail" desc="How many sections a board gets — not how wordy each one is.">
        <Choice
          value={profile.depth}
          options={DEPTHS.map((one) => ({ value: one.value, label: one.label, hint: one.hint }))}
          onChange={(depth) => update({ depth })}
        />
      </Section>

      <Section title="Walkthrough">
        <Card>
          <Row
            title="Speak the walkthrough"
            help={
              board.narrate
                ? "chalk reads each part aloud as the cursor shows it. The words stay on the board too."
                : "Silent — the cursor walks the board and the words stay on screen."
            }
            side={
              <Switch
                on={board.narrate}
                label="Speak the walkthrough"
                onChange={(narrate) => saveBoard({ ...board, narrate })}
              />
            }
          />

          <Row
            title="Language"
            help="Boards are written in it. Answers on your screen stay in English for now."
            side={
              <select
                className="cc-select"
                style={{ width: 180 }}
                value={profile.language}
                onChange={(event) => update({ language: event.target.value })}
                aria-label="Board language"
              >
                {LANGUAGES.map(([code, name]) => (
                  <option value={code} key={code}>
                    {name}
                  </option>
                ))}
              </select>
            }
          />
        </Card>
      </Section>
    </Pane>
  );
}
