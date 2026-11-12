"use client";

/*
 * What one block looks like.
 *
 * NOTE: unlike the rest of components/board, this file is not recovered from
 * the capture — the production bundle for /control never loaded the block
 * renderers, so this is a fresh design against the same constraints:
 *
 *   - a block's heading underline must sit 28px below its top, because that is
 *     where connectors arrive (RULE_OFFSET in lib/board/routing.ts);
 *   - the width is given, the height is whatever the content comes to, and is
 *     measured afterwards (useMeasuredHeights);
 *   - zoomed far out, only the heading is drawn (styles/board-theme.css).
 *
 * A block's `kind` chooses the body; anything unrecognised falls back to prose,
 * so a board written by a newer chalk than this one still renders.
 */

import { useMemo } from "react";

import type { Block } from "@/lib/board/events";
import { strokePath } from "@/lib/board/strokes";

/** The drawn underline beneath a heading. */
function Rule({ width, seed }: { width: number; seed: string }) {
  const d = useMemo(
    () =>
      strokePath(
        [
          { x: 2, y: 4 },
          { x: Math.max(24, width - 4), y: 4 },
        ],
        { seed, size: 2.6 },
      ),
    [width, seed],
  );

  return (
    <svg className="ck-card-rule" viewBox={`0 0 ${Math.max(24, width)} 7`} aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

type Props = Record<string, unknown>;

const text = (props: Props, key: string) =>
  typeof props[key] === "string" ? (props[key] as string) : undefined;

const list = (props: Props, key: string) =>
  Array.isArray(props[key]) ? (props[key] as unknown[]).filter((one) => typeof one === "string") as string[] : undefined;

/** The label in the corner, for the kinds where it earns its place. */
const KIND_LABEL: Record<string, string> = {
  example: "example",
  warning: "watch out",
  insight: "the point",
  question: "question",
  formula: "formula",
  code: "code",
  table: "table",
};

function Body({ kind, props }: { kind: string; props: Props }) {
  const body = text(props, "body") ?? text(props, "text");
  const items = list(props, "items") ?? list(props, "steps") ?? list(props, "bullets");

  switch (kind) {
    case "term":
    case "definition":
      return (
        <>
          {text(props, "term") ? <div className="ck-term">{text(props, "term")}</div> : null}
          {body ? <p>{body}</p> : null}
        </>
      );

    case "steps":
      return (
        <div className="ck-steps">
          {(items ?? []).map((step, i) => (
            <div className="ck-step" key={i}>
              <span>{step}</span>
            </div>
          ))}
        </div>
      );

    case "bullets":
    case "list":
      return (
        <ul className="ck-card-bullets">
          {(items ?? []).map((item, i) => (
            <li key={i}>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case "formula":
    case "equation":
      return (
        <>
          <div className="ck-formula">{text(props, "latex") ?? body}</div>
          {text(props, "note") ? <p>{text(props, "note")}</p> : null}
        </>
      );

    case "code":
      return <pre className="ck-code">{body ?? ""}</pre>;

    case "quote":
      return <blockquote className="ck-quote">{body}</blockquote>;

    case "table": {
      const rows = Array.isArray(props.rows) ? (props.rows as string[][]) : [];
      const head = list(props, "head") ?? list(props, "columns");
      return (
        <table className="ck-table">
          {head ? (
            <thead>
              <tr>
                {head.map((cell, i) => (
                  <th key={i}>{cell}</th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    default:
      return (
        <>
          {body ? <p>{body}</p> : null}
          {items?.length ? (
            <ul className="ck-card-bullets">
              {items.map((item, i) => (
                <li key={i}>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      );
  }
}

export function BlockCard({ block }: { block: Block }) {
  const props = block.props ?? {};
  const title = text(props, "title") ?? text(props, "term") ?? "";
  const label = KIND_LABEL[block.kind];

  return (
    <div className="ck-card" data-kind={block.kind}>
      <div className="ck-card-head">
        <span>{title}</span>
        {label ? <span className="ck-card-kind">{label}</span> : null}
      </div>
      <Rule width={block.w} seed={block.id} />
      <div className="ck-card-body">
        <Body kind={block.kind} props={props} />
      </div>
    </div>
  );
}
