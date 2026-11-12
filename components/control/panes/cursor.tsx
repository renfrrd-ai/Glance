"use client";

/*
 * Cursor: the buddy that does the pointing.
 *
 * The preview at the top is a mock window rather than a swatch, because what
 * matters is how the nib and its label sit against something — and how big it
 * is next to real text.
 */

import { BuddyFace, NIB_FACE } from "@/components/art/buddy-face";
import {
  CURSOR_COLORS,
  CURSOR_SIZES,
  DEFAULT_CURSOR,
  cursorHex,
  cursorScale,
  readCursor,
  type Cursor,
} from "@/lib/cursor";
import { usePref } from "@/lib/prefs";

import { Pane } from "../pane";
import { Swatch } from "../shell-extras";
import { Card, Row, Section, Seg, Switch } from "../primitives";

export function CursorPane() {
  const [stored, save] = usePref("cursor", DEFAULT_CURSOR);
  const cursor = readCursor(stored);
  const hex = cursorHex(cursor);
  const set = (patch: Partial<Cursor>) => save({ ...cursor, ...patch });

  return (
    <Pane
      title="Cursor"
      lede="The buddy that points things out. Make it yours — on your screen and on your boards."
    >
      <div className="cc-stage" aria-label="Preview">
        <div className="cc-stage-win">
          <div className="cc-stage-dots">
            <i />
            <i />
            <i />
          </div>
          <div className="cc-stage-line" style={{ width: "78%" }} />
          <div className="cc-stage-line" style={{ width: "92%" }} />
          <div className="cc-stage-line" style={{ width: "60%" }} />
          <span className="cc-stage-btn">Share</span>
        </div>

        <div className="cc-stage-nib" style={{ left: "calc(50% - 112px)", top: 142 }}>
          <span className="cc-nib-body" style={{ transform: `scale(${cursorScale(cursor)})` }}>
            <svg width="21" height="25" viewBox="0 0 22 26" aria-hidden="true">
              <path
                d="M3 2 L3 19 Q3 20.5 4.4 19.6 L8 16.6 L11 23.4 Q11.6 24.8 12.9 24.2 L14.6 23.4 Q15.9 22.8 15.3 21.5 L12.2 15 L16.4 14.6 Q18 14.4 16.9 13.2 L4.9 1.4 Q3 -0.4 3 2 Z"
                fill={hex}
                stroke="#fff"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <BuddyFace layout={NIB_FACE} ink="#fff" width={21} expression="smile" />
          </span>
          {/* The label shifts with the nib, so a bigger cursor does not sit on it. */}
          <span
            className="cc-stage-tag"
            style={{ background: hex, marginLeft: Math.round(21 * (cursorScale(cursor) - 1)) }}
          >
            Click Share
          </span>
        </div>
      </div>

      <Section title="Colour" meta={CURSOR_COLORS.find((one) => one.id === cursor.color)?.name}>
        <Card pad>
          <div className="cc-swatches" role="radiogroup" aria-label="Cursor colour">
            {CURSOR_COLORS.map((one) => (
              <button
                type="button"
                className="cc-swatch-btn"
                role="radio"
                aria-checked={cursor.color === one.id}
                aria-label={one.name}
                title={one.name}
                onClick={() => set({ color: one.id })}
                key={one.id}
              >
                <Swatch hex={one.hex} on={cursor.color === one.id} />
              </button>
            ))}
          </div>
        </Card>
      </Section>

      <Section title="Behaviour">
        <Card>
          <Row
            title="Size"
            help="How big the buddy is when it points."
            side={
              <Seg
                value={cursor.size}
                options={CURSOR_SIZES.map((one) => ({ value: one.id, label: one.name }))}
                onChange={(size) => set({ size })}
              />
            }
          />
          <Row
            title="Stay beside my pointer"
            help={
              cursor.follow
                ? "When it has nothing to show you, it rides next to your pointer, small."
                : "It appears only when it is showing you something."
            }
            side={
              <Switch
                on={cursor.follow}
                label="Stay beside my pointer"
                onChange={(follow) => set({ follow })}
              />
            }
          />
        </Card>
      </Section>
    </Pane>
  );
}
