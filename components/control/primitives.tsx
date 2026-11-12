"use client";

/*
 * The pieces every settings pane is built from.
 *
 * A pane is a stack of <Section>s. A section holds <Card>s, a card holds
 * <Row>s, and a row can open a <Sub> underneath itself. Nothing here styles
 * itself inline: the look lives in styles/control-center.css, keyed off the
 * cc-* class names and the data-* attributes these set.
 */

import type { ReactNode } from "react";
import { Check as CheckIcon } from "lucide-react";

import { SectionIcon } from "@/components/art/section-art";

export function Section({
  title,
  meta,
  desc,
  children,
  note,
}: {
  title: ReactNode;
  /** A count or status, set small beside the title. */
  meta?: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
  /** The fine print under the section. */
  note?: ReactNode;
}) {
  return (
    <section className="cc-section">
      <div className="cc-section-head">
        <h2 className="cc-section-title">{title}</h2>
        {meta ? <span className="cc-section-meta">{meta}</span> : null}
      </div>
      {desc ? <p className="cc-section-desc">{desc}</p> : null}
      <div className="cc-section-body">{children}</div>
      {note ? <p className="cc-note">{note}</p> : null}
    </section>
  );
}

export function Card({ children, pad }: { children?: ReactNode; pad?: boolean }) {
  return (
    <div className="cc-card" data-pad={pad ? "true" : "false"}>
      {children}
    </div>
  );
}

export function Row({
  lead,
  icon,
  title,
  badge,
  help,
  mono,
  side,
  onClick,
  on,
  compact,
  children,
}: {
  /** Anything to set at the start of the row, in place of `icon`. */
  lead?: ReactNode;
  /** A section id, drawn as its doodle. */
  icon?: string;
  title: ReactNode;
  badge?: ReactNode;
  help?: ReactNode;
  /** Help text that is a path, an address or a key — set in the mono face. */
  mono?: boolean;
  side?: ReactNode;
  onClick?: () => void;
  /** Whether this row is the chosen one. */
  on?: boolean;
  compact?: boolean;
  /** What opens underneath the row. */
  children?: ReactNode;
}) {
  return (
    <>
      <div
        className="cc-row"
        data-click={onClick ? "true" : "false"}
        data-compact={compact ? "true" : "false"}
        data-on={on ? "true" : "false"}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-pressed={onClick ? !!on : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
      >
        {lead ?? (icon ? <SectionIcon id={icon} size={22} /> : null)}
        <div className="cc-row-text">
          <div className="cc-row-title">
            <span>{title}</span>
            {badge}
          </div>
          {help ? (
            <div className="cc-row-help" data-mono={mono ? "true" : "false"}>
              {help}
            </div>
          ) : null}
        </div>
        {side ? <div className="cc-row-side">{side}</div> : null}
      </div>
      {children}
    </>
  );
}

/** The drawer a row opens: indented, and tied to the row above it. */
export function Sub({ children, flush }: { children?: ReactNode; flush?: boolean }) {
  return (
    <div className="cc-sub" data-flush={flush ? "true" : "false"}>
      {children}
    </div>
  );
}

export type Tone = "neutral" | "ok" | "warn" | "bad";

export function Tag({ tone = "neutral", children }: { tone?: Tone; children?: ReactNode }) {
  return (
    <span className="cc-tag" data-tone={tone}>
      <span className="cc-dot" />
      {children}
    </span>
  );
}

export function Btn({
  variant = "secondary",
  size = "md",
  icon: Icon,
  disabled,
  onClick,
  children,
  label,
  type = "button",
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Shown, but refuses the click — the row still explains why. */
  disabled?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  label?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className="cc-btn"
      data-variant={variant}
      data-size={size}
      aria-disabled={disabled}
      aria-label={label}
      onClick={() => {
        if (!disabled) onClick?.();
      }}
    >
      {Icon ? <Icon size={size === "sm" ? 14 : 15} strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

export function Switch({
  on,
  label,
  onChange,
  disabled,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-disabled={disabled}
      className="cc-switch"
      onClick={() => {
        if (!disabled) onChange(!on);
      }}
    />
  );
}

export function Check({ on }: { on: boolean }) {
  return (
    <span className="cc-check" data-on={on ? "true" : "false"} aria-hidden>
      <CheckIcon size={13} strokeWidth={3.2} />
    </span>
  );
}

export type Option<T> = { value: T; label: string; hint?: string };

/** One of several, as a list of rows — for choices that need a sentence each. */
export function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <Card>
      {options.map((option) => (
        <Row
          key={option.value}
          title={option.label}
          help={option.hint}
          on={value === option.value}
          onClick={() => onChange(option.value)}
          side={<Check on={value === option.value} />}
        />
      ))}
    </Card>
  );
}

/** One of a few, as a segmented control — for choices that fit in a word. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  const here = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div
      className="cc-seg"
      role="radiogroup"
      onKeyDown={(event) => {
        const step =
          event.key === "ArrowRight" || event.key === "ArrowDown"
            ? 1
            : event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? -1
              : 0;
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : step
                ? (here + step + options.length) % options.length
                : -1;
        if (next < 0 || !options[next]) return;
        event.preventDefault();
        onChange(options[next].value);
        (event.currentTarget.children[next] as HTMLElement | undefined)?.focus();
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-on={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          title={option.hint}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A labelled control. `stack` puts the control under the label instead of
 * beside it; `group` makes it a <div role=group> for controls that are not one
 * focusable thing, which a <label> would mis-target.
 */
export function Field({
  label,
  help,
  aside,
  stack,
  group,
  children,
}: {
  label: string;
  help?: ReactNode;
  aside?: ReactNode;
  stack?: boolean;
  group?: boolean;
  children?: ReactNode;
}) {
  const inner = (
    <>
      <span className="cc-field-label">
        <span>
          {label}
          {help ? <span className="cc-field-help">{help}</span> : null}
        </span>
        {aside ? <span className="cc-field-aside">{aside}</span> : null}
      </span>
      {stack ? children : <span className="cc-field-control">{children}</span>}
    </>
  );

  return group ? (
    <div className="cc-field" data-stack={stack ? "true" : "false"} role="group" aria-label={label}>
      {inner}
    </div>
  ) : (
    <label className="cc-field" data-stack={stack ? "true" : "false"}>
      {inner}
    </label>
  );
}

export function Kbds({ keys }: { keys: string[] }) {
  return (
    <span className="cc-kbds">
      {keys.map((key) => (
        <kbd className="cc-kbd" key={key}>
          {key}
        </kbd>
      ))}
    </span>
  );
}

export function Note({ children }: { children?: ReactNode }) {
  return <p className="cc-note">{children}</p>;
}

/** A stronger aside than a note: something you may need to act on. */
export function Callout({ children }: { children?: ReactNode }) {
  return <div className="cc-callout">{children}</div>;
}

export function Empty({ children }: { children?: ReactNode }) {
  return <p className="cc-empty">{children}</p>;
}

export function Meter({
  used,
  of,
  wide,
  label,
}: {
  used: number;
  of: number;
  wide?: boolean;
  label?: string;
}) {
  const share = of > 0 ? Math.min(1, Math.max(0, used / of)) : 0;
  return (
    <span
      className={wide ? "cc-meter cc-meter-wide" : "cc-meter"}
      role="img"
      aria-label={label ?? `${Math.round(share * 100)}% used`}
    >
      <span className="cc-meter-used" style={{ width: `${share * 100}%` }} />
    </span>
  );
}
