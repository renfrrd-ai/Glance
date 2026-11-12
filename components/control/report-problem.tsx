"use client";

/*
 * Report a problem. The page you were on goes along with the message, so a
 * report does not have to begin with where you were.
 */

import { useEffect, useState } from "react";

import { Btn } from "./primitives";

const TOPICS = [
  { id: "broken", label: "Something's broken" },
  { id: "billing", label: "Billing or my plan" },
  { id: "account", label: "Signing in" },
  { id: "idea", label: "An idea" },
  { id: "other", label: "Something else" },
];

const STATUS: Record<string, string> = {
  open: "Sent",
  looking: "We're looking",
  resolved: "Resolved",
};

type Report = {
  id: string;
  status: string;
  at: string | number;
  message: string;
  /** What chalk wrote back. */
  note?: string;
};

export function ReportProblem({ page, onClose }: { page: string; onClose: () => void }) {
  const [topic, setTopic] = useState("broken");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [mine, setMine] = useState<Report[]>([]);

  const loadMine = () =>
    void fetch("/api/support", { headers: { "x-chalk-app": "1" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setMine(data?.reports ?? []))
      .catch(() => {});

  useEffect(loadMine, []);

  const send = async () => {
    if (message.trim().length < 3) {
      setProblem("Say what happened, in a few words.");
      return;
    }
    setSending(true);
    setProblem(null);

    const result = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
      body: JSON.stringify({ topic, message, page }),
    })
      .then(async (response) => ({ ok: response.ok, data: await response.json().catch(() => ({})) }))
      .catch(() => ({
        ok: false,
        data: { message: "chalk didn't answer — try again in a moment." },
      }));

    setSending(false);
    if (!result.ok) {
      setProblem(result.data?.message ?? "chalk didn't answer — try again in a moment.");
      return;
    }
    setSent(true);
    setMessage("");
    loadMine();
  };

  const prompt =
    topic === "idea"
      ? "What would make chalk better for you?"
      : "What happened, and what did you expect?";

  return (
    <div
      className="cc-typeask"
      role="dialog"
      aria-modal="true"
      aria-label="Report a problem"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="cc-typeask-card cc-report"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="cc-typeask-title">{sent ? "Thanks — it’s with us" : "Tell us what’s wrong"}</div>

        {sent ? null : (
          <>
            <div className="cc-chips" role="group" aria-label="What it's about">
              {TOPICS.map((one) => (
                <button
                  type="button"
                  className="cc-chip"
                  data-on={topic === one.id}
                  aria-pressed={topic === one.id}
                  onClick={() => setTopic(one.id)}
                  key={one.id}
                >
                  {one.label}
                </button>
              ))}
            </div>

            <textarea
              className="cc-input cc-report-text"
              autoFocus
              rows={4}
              maxLength={2000}
              value={message}
              placeholder={prompt}
              aria-label="What happened"
              onChange={(event) => setMessage(event.target.value)}
            />
          </>
        )}

        {problem ? (
          <p className="cc-typeask-note" style={{ color: "var(--bad)" }}>
            {problem}
          </p>
        ) : null}

        <div className="cc-typeask-row">
          <span style={{ flex: 1 }} />
          {sent ? (
            <>
              <Btn variant="ghost" onClick={() => setSent(false)}>
                Send another
              </Btn>
              <Btn variant="primary" onClick={onClose}>
                Done
              </Btn>
            </>
          ) : (
            <>
              <Btn variant="ghost" onClick={onClose}>
                Cancel
              </Btn>
              <button
                type="submit"
                className="cc-btn"
                data-variant="primary"
                data-size="md"
                aria-disabled={sending || message.trim().length < 3}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </>
          )}
        </div>

        {mine.length ? (
          <div className="cc-report-mine">
            <div className="cc-report-mine-title">Your reports</div>
            {mine.slice(0, 5).map((report) => (
              <div className="cc-report-item" key={report.id}>
                <div className="cc-report-item-head">
                  <span className="cc-report-status" data-status={report.status}>
                    {STATUS[report.status] ?? report.status}
                  </span>
                  <span className="cc-report-when">
                    {new Date(report.at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="cc-report-msg">{report.message}</div>
                {report.note ? (
                  <div className="cc-report-note">
                    <b>chalk:</b> {report.note}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </form>
    </div>
  );
}
