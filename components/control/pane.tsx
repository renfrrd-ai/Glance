"use client";

/*
 * The frame every settings pane sits in: the hero band with this section's
 * tile among its neighbours, the title and lede, and whatever the pane puts in
 * the top right. `--accent` is set from the section's rail colour, which the
 * stylesheet uses for focus rings, switches and links inside the pane.
 */

import type { ReactNode } from "react";

import { ART } from "@/components/art/art-map";
import { SectionHero } from "@/components/art/section-art";

import { usePane } from "./pane-context";

export function Pane({
  title,
  lede,
  wide,
  actions,
  children,
}: {
  title: ReactNode;
  lede?: ReactNode;
  /** A pane that wants the full width and a shorter hero — Library, Plan. */
  wide?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { art, order, go, names } = usePane();

  return (
    <div
      className="cc-page"
      data-wide={wide ? "true" : "false"}
      style={{ "--accent": ART[art].rail } as React.CSSProperties}
    >
      <SectionHero id={art} around={order} compact={wide} onGo={go} names={names} />
      <header className="cc-head">
        <div className="cc-head-text">
          <h1 className="cc-title">{title}</h1>
          {lede ? <p className="cc-lede">{lede}</p> : null}
        </div>
        {actions ? <div className="cc-head-actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
