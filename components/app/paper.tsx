"use client";

/*
 * The light side of the app.
 *
 * The control center is dark and dense; the app areas it frames are the
 * opposite — cream paper, room to breathe, the same hand-drawn furniture as
 * the board. These are the pieces those pages are built from, kept here so a
 * new area does not start by reinventing a page header.
 */

import type { ReactNode } from "react";

import { SectionTile } from "@/components/art/section-art";

export function Paper({
  title,
  lede,
  actions,
  children,
  art,
}: {
  title: string;
  lede?: string;
  actions?: ReactNode;
  children?: ReactNode;
  /** A section id, drawn as its tile beside the title. */
  art?: string;
}) {
  return (
    <main className="pa">
      <header className="pa-head">
        {art ? <SectionTile id={art} size={56} /> : null}
        <div className="pa-head-text">
          <h1>{title}</h1>
          {lede ? <p>{lede}</p> : null}
        </div>
        {actions ? <div className="pa-head-actions">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}

export function PaperCard({ children }: { children?: ReactNode }) {
  return <div className="pa-card">{children}</div>;
}

export function PaperRow({
  title,
  help,
  side,
  href,
  onClick,
  lead,
}: {
  title: ReactNode;
  help?: ReactNode;
  side?: ReactNode;
  href?: string;
  onClick?: () => void;
  lead?: ReactNode;
}) {
  const inner = (
    <>
      {lead}
      <span className="pa-row-text">
        <span className="pa-row-title">{title}</span>
        {help ? <span className="pa-row-help">{help}</span> : null}
      </span>
      {side ? <span className="pa-row-side">{side}</span> : null}
    </>
  );

  if (href)
    return (
      <a className="pa-row" href={href}>
        {inner}
      </a>
    );

  if (onClick)
    return (
      <button type="button" className="pa-row" onClick={onClick}>
        {inner}
      </button>
    );

  return <div className="pa-row">{inner}</div>;
}

export function PaperEmpty({ children }: { children?: ReactNode }) {
  return <p className="pa-empty">{children}</p>;
}
