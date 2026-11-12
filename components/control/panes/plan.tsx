"use client";

/*
 * Plan & usage: what this account is on, what the week has cost, and the plans
 * it could be on instead.
 *
 * Two currencies live here. Cards outside Nigeria go through Stripe in dollars;
 * cards inside it go through Paystack in naira, which cannot do proration or
 * yearly billing — so a naira downgrade starts when the paid month ends, and
 * the copy says so rather than pretending the two work alike.
 *
 * Everything is counted in credits (see lib/plans.ts). The allowance shown per
 * plan is the shape of a comfortable week; the credits are the real ceiling.
 */

import { useCallback, useEffect, useState } from "react";
import { Check as CheckIcon } from "lucide-react";

import { Person, SectionIcon, SectionTile } from "@/components/art/section-art";
import * as A from "@/lib/plans";
import { shell } from "@/lib/prefs";

import { Pane } from "../pane";
import { Btn, Card, Row, Section, Tag } from "../primitives";

/* ---- what the server tells us ----------------------------------------- */

type Subscription = {
  status?: "active" | "past_due" | string;
  interval?: "month" | "year";
  renews?: string | null;
  ends?: string | null;
  /** The plan that takes over at the next renewal, for a naira downgrade. */
  next?: string;
};

type Account = {
  email: string;
  name?: string | null;
  source: "admin" | "stripe" | "paystack" | "promo" | "trial" | string;
  subscription?: Subscription | null;
  /** Until when, for a code or a lapsed naira plan. */
  until?: string | null;
  /** Whether a card can be charged at all here. */
  billing?: boolean;
  /** Whether a billing portal exists for this account. */
  manage?: boolean;
  admin?: boolean;
  /** The plans on sale to this account. */
  onSale: string[];
  student?: { email?: string; until: string } | null;
  studentAsked?: boolean;
  app?: { has?: boolean; opens?: number } | null;
};

type Meter = {
  unit: A.UnitKey;
  label: string;
  help: string;
  /** Credits one of them costs. */
  each: number;
  used: number;
  credits: number;
};

type Usage = {
  plan: string;
  period: "trial" | "week";
  previewing?: boolean;
  trialEnds?: string | null;
  resets?: string | null;
  credits: { used: number; of: number | null };
  meters: Meter[];
  account: Account | null;
  /** Whether this build has accounts at all — a personal Mac build has none. */
  accounts?: boolean;
};

/* ---- small helpers ----------------------------------------------------- */

const COUNTRY_COOKIE = "chalk-country";
const PRICES_KEY = "chalk-pay";

const country = () => {
  try {
    return new RegExp(`(?:^|; )${COUNTRY_COOKIE}=([^;]*)`).exec(document.cookie)?.[1] ?? null;
  } catch {
    return null;
  }
};

/* "*" is the flag we set ourselves to see naira pricing from anywhere. */
const inNaijaland = () => {
  const here = country();
  return here === "NG" || here === "*";
};

const date = (at: string | null | undefined) =>
  at ? new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
    body: JSON.stringify(body ?? {}),
  })
    .then(async (response) => ({ ok: response.ok, data: await response.json().catch(() => ({})) }))
    .catch(() => ({ ok: false, data: { message: "chalk couldn't be reached." } as Record<string, unknown> }));

/** Leave for a checkout or a portal — in the Mac app, in the real browser. */
function leaveFor(url: string) {
  const host = shell() as (ReturnType<typeof shell> & { openURL?: (url: string) => void }) | null;
  if (host?.openURL) host.openURL(url);
  else window.location.href = url;
}

const startingCurrency = (): "usd" | "ngn" => {
  if (!inNaijaland()) return "usd";
  try {
    const asked = new URLSearchParams(window.location.search).get("pay");
    if (asked === "ngn" || asked === "usd") {
      localStorage.setItem(PRICES_KEY, asked);
      return asked;
    }
    const kept = localStorage.getItem(PRICES_KEY);
    if (kept === "ngn" || kept === "usd") return kept;
  } catch {
    /* private window */
  }
  return country() === "NG" ? "ngn" : "usd";
};

/** The tile that stands for each plan. */
const PLAN_ART: Record<string, string> = {
  board: "board",
  board_spatial: "spatial",
  everything: "agents",
  unlimited: "plan",
  ng_lite: "board",
  ng_board: "board",
  ng_max: "board",
  ng_spatial: "spatial",
};

/** Fair use rather than no limits: unmetered, but not unpriced. */
const fairUse = (plan: string) =>
  A.PLANS[plan].allowance === null && A.PLANS[plan].tripwireUsd !== undefined;

/** "class" rather than "classes", when there is one of them. */
const unitWord = (unit: A.UnitKey, n: number) => {
  const word = A.UNITS[unit].short;
  if (n !== 1) return word;
  return word.endsWith("sses") ? word.slice(0, -2) : word.replace(/s$/, "");
};

const COSTS: Record<A.UnitKey, string> = {
  questions: "a question on screen",
  classes: "a class, deck or quiz",
  boards: "a board",
  recording: "a minute of recording",
  agents: "an agent task",
  speaking: "a spoken check",
  writing: "a writing or conversation check",
};

const PRICED_UNITS = (Object.keys(A.CREDITS) as A.UnitKey[]).filter((unit) =>
  A.ON_SALE.some((plan) => A.PLANS[plan].allowance?.[unit] !== undefined),
);

/** A plan's week as a sentence: the credits, and what they buy. */
function weekOf(plan: string) {
  const here = A.PLANS[plan];
  const allowance = here.allowance;
  if (!allowance || here.credits === null)
    return fairUse(plan) ? "no meters, fair use" : "No limits";

  const examples = (["boards", "classes", "questions", "recording"] as A.UnitKey[])
    .filter((unit) => allowance[unit] !== undefined)
    .map((unit) => {
      const many = Math.floor((here.credits as number) / A.CREDITS[unit]);
      return `${many.toLocaleString()} ${unitWord(unit, many)}`;
    });

  return `${A.credits(here.credits)} — enough for ${examples.join(", or ")}`;
}

/** How this account is paid for, in one line. */
function payingLine(account: Account, plan: string) {
  switch (account.source) {
    case "admin":
      return "Admin — no limits, every feature.";
    case "stripe": {
      const sub = account.subscription;
      if (sub?.status === "past_due")
        return "Your last payment didn't go through. Update your card to keep your plan.";
      return `Paid ${sub?.interval === "year" ? "yearly" : "monthly"}${sub?.renews ? ` — renews ${date(sub.renews)}` : ""}.`;
    }
    case "paystack": {
      const sub = account.subscription;
      if (sub?.status === "past_due")
        return "Your last payment didn't go through. Update your card to keep your plan.";
      if (sub?.next && sub.renews)
        return `Paid monthly in naira — ${A.PLANS[sub.next].name} from ${date(sub.renews)}.`;
      if (sub?.renews) return `Paid monthly in naira — renews ${date(sub.renews)}.`;
      return `Paid in naira until ${date(sub?.ends ?? account.until)}, then it ends. Choose your plan below to keep it.`;
    }
    case "promo":
      return `From a code — ${A.PLANS[plan].name} until ${date(account.until)}.`;
    default:
      return "The free trial. Pick a plan below when you're ready.";
  }
}

/* ---- student pricing --------------------------------------------------- */

function StudentPrice({ who, onDone }: { who: Account; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [school, setSchool] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const offer = ["board_spatial"]
    .filter((plan) => A.studentPrice(plan, "month") !== null)
    .map(
      (plan) =>
        `${A.PLANS[plan].name} for $${A.studentPrice(plan, "month")} a month, or $${A.studentPrice(plan, "year")} a year`,
    )
    .join("; ");

  const call = async (body: unknown, then: (data: Record<string, unknown>) => void) => {
    setBusy(true);
    setSaid(null);
    const result = await post("/api/student", body);
    setBusy(false);
    if (result.ok) then(result.data as Record<string, unknown>);
    else setSaid(String(result.data.message ?? "That didn't work."));
  };

  const sendCode = () => {
    if (!email.trim()) return;
    call({ do: "send", email }, () => {
      setSentTo(email.trim());
      setSaid(null);
    });
  };

  const confirm = () => {
    if (code.replace(/\D/g, "").length !== 6) return;
    call({ do: "confirm", code }, () => {
      setSaid("Done — your student price is on.");
      onDone();
    });
  };

  const request = () => {
    if (school.trim().length < 2) return;
    call({ do: "request", school, schoolEmail }, () => {
      setAsking(false);
      setSaid("Sent — we'll email you when it's checked.");
      onDone();
    });
  };

  if (who.student)
    return (
      <Section title="Student or educator" desc={`You have the student price: ${offer}.`}>
        <Card pad>
          <Row
            lead={<SectionTile id="learn" size={40} />}
            title="Student pricing is on"
            help={`${who.student.email ? `Through ${who.student.email}` : "Checked by chalk"}, until ${date(who.student.until)}. chalk asks again then.`}
          />
        </Card>
      </Section>
    );

  return (
    <Section title="Student or educator?" desc={`Prove it with your school email and get ${offer}.`}>
      <Card pad>
        {sentTo ? (
          <form
            style={{ display: "flex", gap: 10, alignItems: "center" }}
            onSubmit={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            <input
              className="cc-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6-digit code"
              aria-label="Code"
              style={{ flex: 1, letterSpacing: ".2em" }}
            />
            <Btn
              variant="primary"
              disabled={busy || code.replace(/\D/g, "").length !== 6}
              onClick={confirm}
            >
              Confirm
            </Btn>
            <Btn
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSentTo(null);
                setCode("");
                setSaid(null);
              }}
            >
              Back
            </Btn>
          </form>
        ) : (
          <form
            style={{ display: "flex", gap: 10, alignItems: "center" }}
            onSubmit={(event) => {
              event.preventDefault();
              sendCode();
            }}
          >
            <input
              className="cc-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@school.edu"
              aria-label="School email"
              style={{ flex: 1 }}
            />
            <Btn variant="primary" disabled={busy || !email.trim()} onClick={sendCode}>
              Send a code
            </Btn>
          </form>
        )}

        {sentTo && !said ? (
          <p className="cc-note" style={{ margin: "10px 0 0" }}>
            We sent a code to {sentTo}. It works for ten minutes.
          </p>
        ) : null}
        {said ? (
          <p className="cc-note" role="status" style={{ margin: "10px 0 0" }}>
            {said}
          </p>
        ) : null}
      </Card>

      <Card pad>
        {who.studentAsked ? (
          <p className="cc-note" style={{ margin: 0 }}>
            We have your request and will email you when it’s checked.
          </p>
        ) : asking ? (
          <form
            style={{ display: "grid", gap: 10 }}
            onSubmit={(event) => {
              event.preventDefault();
              request();
            }}
          >
            <input
              className="cc-input"
              value={school}
              onChange={(event) => setSchool(event.target.value)}
              placeholder="Your school, college or university"
              aria-label="School"
            />
            <input
              className="cc-input"
              type="email"
              value={schoolEmail}
              onChange={(event) => setSchoolEmail(event.target.value)}
              placeholder="Your school email, if you have one (optional)"
              aria-label="School email"
            />
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="primary" disabled={busy || school.trim().length < 2} onClick={request}>
                Send request
              </Btn>
              <Btn variant="ghost" disabled={busy} onClick={() => setAsking(false)}>
                Cancel
              </Btn>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <p className="cc-note" style={{ margin: 0, flex: 1 }}>
              No school email, or chalk doesn’t know your school? Ask, and we’ll check.
            </p>
            <Btn onClick={() => setAsking(true)}>Ask us</Btn>
          </div>
        )}
      </Card>
    </Section>
  );
}

/* ---- the pane ---------------------------------------------------------- */

export function PlanPane({ onChange }: { onChange?: (plan: string) => void }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeSaid, setCodeSaid] = useState<string | null>(null);
  const [every, setEvery] = useState<"month" | "year">("month");
  const [cancelling, setCancelling] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [leaveProblem, setLeaveProblem] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"usd" | "ngn">(startingCurrency);
  const [naija, setNaija] = useState(false);
  /* Fixed at mount, so "the trial ended" cannot flicker while reading. */
  const [openedAt] = useState(() => Date.now());

  useEffect(() => setNaija(inNaijaland()), []);

  const load = useCallback(async () => {
    setUnreachable(false);
    const data = await fetch("/api/account")
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);

    if (!data?.meters) {
      setUnreachable(true);
      return;
    }
    setUsage(data);
    onChange?.(data.plan);
    if (A.isNaira(data.plan)) setCurrency("ngn");
  }, [onChange]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  /* Coming back from a checkout tab is the moment the plan has changed. */
  useEffect(() => {
    const again = () => void load();
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [load]);

  const choose = async (plan: string) => {
    setBusy(true);
    setSaid(null);
    const result = await post("/api/billing/checkout", {
      plan,
      interval: A.isNaira(plan) ? "month" : every,
    });
    setBusy(false);

    if (!result.ok) {
      setSaid(String(result.data.message ?? "That didn't work."));
      return;
    }
    if (typeof result.data.url === "string") {
      setSaid("Checkout is open — finish there, and your plan changes here.");
      leaveFor(result.data.url);
      return;
    }
    if (result.data.pending) setSaid(String(result.data.message));
    else if (typeof result.data.from === "string")
      setSaid(
        plan === usage?.plan
          ? `${A.PLANS[plan].name} carries on from ${date(result.data.from)}.`
          : `${A.PLANS[plan].name} starts ${date(result.data.from)}, when the month you've paid for ends. Until then nothing changes.`,
      );
    else setSaid(`Switched to ${A.PLANS[plan].name}. It may take a moment to show.`);

    window.setTimeout(() => void load(), 1500);
  };

  const cancel = async () => {
    setBusy(true);
    setSaid(null);
    const result = await post("/api/billing/cancel");
    setBusy(false);
    setCancelling(false);
    if (result.ok) {
      setSaid(
        `Cancelled. Nothing more is charged, and your plan stays until ${date(
          typeof result.data.until === "string" ? result.data.until : null,
        )}.`,
      );
      void load();
    } else setSaid(String(result.data.message ?? "That didn't work."));
  };

  const portal = async () => {
    setBusy(true);
    setSaid(null);
    const result = await post("/api/billing/portal");
    setBusy(false);
    if (result.ok && typeof result.data.url === "string") leaveFor(result.data.url);
    else setSaid(String(result.data.message ?? "That didn't work."));
  };

  const redeem = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setCodeSaid(null);
    const result = await post("/api/billing/redeem", { code });
    setBusy(false);
    if (result.ok) {
      setCode("");
      setCodeSaid(`Done — you're on ${String(result.data.name)} until ${date(String(result.data.until))}.`);
      void load();
    } else setCodeSaid(String(result.data.message ?? "That code didn't work."));
  };

  const deleteAccount = async () => {
    setBusy(true);
    setLeaveProblem(null);
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
      body: JSON.stringify({ confirm: confirmEmail }),
    }).catch(() => null);
    setBusy(false);

    if (response?.ok) {
      window.location.href = "/";
      return;
    }
    const problem = response ? (await response.json().catch(() => ({}))).message : null;
    setLeaveProblem(
      problem ?? "chalk couldn't be reached, so nothing was deleted. Try again in a moment.",
    );
  };

  const signOut = async () => {
    await post("/api/auth/signout");
    window.location.href = "/signin";
  };

  /* Founders can wear a plan's limits for real, to feel what they are. */
  const preview = async (plan: string | null) => {
    setBusy(true);
    const data = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
      body: JSON.stringify({ preview: plan }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    if (data?.meters) {
      setUsage(data);
      onChange?.(data.plan);
    }
    setBusy(false);
  };

  if (!usage)
    return (
      <Pane
        title="Plan & usage"
        lede="Your plan, how much of it you've used, and when it comes back."
      >
        {unreachable ? (
          <Card>
            <Row
              title="Couldn't read your usage"
              help="chalk couldn't be reached. Nothing is lost — try again in a moment."
              side={
                <Btn size="sm" onClick={() => void load()}>
                  Try again
                </Btn>
              }
            />
          </Card>
        ) : (
          <p className="cc-note">Counting…</p>
        )}
      </Pane>
    );

  const plan = A.PLANS[usage.plan];
  const canPreview = usage.plan === "founder" || usage.previewing;
  const resets = usage.resets ? new Date(usage.resets) : null;
  const resetsOn = resets
    ? resets.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    : null;

  const used = usage.credits;
  const left = used.of === null ? null : Math.max(0, used.of - used.used);
  const trialOver =
    usage.period === "trial" && !!usage.trialEnds && Date.parse(usage.trialEnds) < openedAt;

  const standing =
    used.of === null
      ? fairUse(usage.plan)
        ? "No meters to watch. Fair use sits far above a normal week."
        : "No limits on your own Mac."
      : trialOver
        ? A.TRIAL_OVER
        : left === 0
          ? usage.period === "trial"
            ? "You've used the trial's credits. Pick a plan to keep going — everything you made stays."
            : `You've used this week's credits. They come back ${resetsOn}.`
          : used.used / used.of >= 0.75
            ? `Getting close — ${A.credits(left as number)} left.`
            : "On track. Plenty left.";

  const spent = usage.meters.filter((meter) => meter.used > 0);
  const account = usage.account;
  const onPaystack = account?.source === "paystack";
  const sub = account?.subscription ?? null;

  /* Naira pricing is offered to anyone in Nigeria, and to accounts already on it. */
  const canPayNaira =
    A.isNaira(usage.plan) || (naija && (!account || account.onSale.some(A.isNaira)));
  const showing = canPayNaira ? currency : "usd";
  const forSale = showing === "ngn" ? A.NAIRA_PLANS : A.ON_SALE;

  const pickCurrency = (next: "usd" | "ngn") => {
    setCurrency(next);
    try {
      localStorage.setItem(PRICES_KEY, next);
    } catch {
      /* private window */
    }
  };

  return (
    <Pane title="Plan & usage" lede="Your plan, how much of it you've used, and when it comes back.">
      <Section title="Your plan">
        <Card>
          <Row
            lead={<SectionTile id="plan" size={52} />}
            title={plan.name}
            badge={
              usage.previewing ? <Tag tone="warn">Previewing</Tag> : <Tag tone="neutral">Current</Tag>
            }
            help={plan.blurb}
            side={
              plan.naira ? (
                <Tag>{A.naira(plan.naira)}/month</Tag>
              ) : plan.price ? (
                <Tag>${plan.price.month}/month</Tag>
              ) : null
            }
          />
        </Card>

        {account ? (
          <>
            <div style={{ height: 12 }} />
            <Card>
              <Row
                lead={<Person name={account.name ?? account.email} size={40} />}
                title={account.name ?? account.email}
                help={`${account.name ? `${account.email} · ` : ""}${payingLine(account, usage.plan)}`}
                side={
                  <Btn size="sm" variant="ghost" onClick={() => void signOut()}>
                    Sign out
                  </Btn>
                }
              />

              {onPaystack && sub?.renews ? (
                <Row
                  title="Billing"
                  help={
                    cancelling
                      ? `Nothing more is charged, and ${plan.name} stays until ${date(sub.renews)}.`
                      : "Your card is on Paystack's own page. Cancelling keeps your plan to the end of the month you've paid for."
                  }
                  side={
                    <div style={{ display: "flex", gap: 8 }}>
                      {cancelling ? (
                        <Btn size="sm" variant="ghost" disabled={busy} onClick={() => setCancelling(false)}>
                          Keep it
                        </Btn>
                      ) : account.manage ? (
                        <Btn size="sm" disabled={busy} onClick={() => void portal()}>
                          Manage card
                        </Btn>
                      ) : null}
                      <Btn
                        size="sm"
                        variant={cancelling ? "primary" : "ghost"}
                        disabled={busy}
                        onClick={() => (cancelling ? void cancel() : setCancelling(true))}
                      >
                        {cancelling ? "Yes, cancel it" : "Cancel plan"}
                      </Btn>
                    </div>
                  }
                />
              ) : !onPaystack && account.manage ? (
                <Row
                  title="Billing"
                  help="Your card, your invoices, or cancelling — on Stripe's own page."
                  side={
                    <Btn size="sm" disabled={busy} onClick={() => void portal()}>
                      Manage billing
                    </Btn>
                  }
                />
              ) : null}

              {account.admin ? (
                <Row
                  title="Admin"
                  help="Everyone's accounts, payments, credits, promo codes and reports."
                  side={
                    <Btn
                      size="sm"
                      onClick={() => {
                        window.location.href = "/admin";
                      }}
                    >
                      Open admin
                    </Btn>
                  }
                />
              ) : (
                <Row
                  title="Delete account"
                  help="Your boards, courses, pages, recordings and everything chalk knows about you, gone for good."
                  side={
                    leaving ? null : (
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setLeaving(true);
                          setConfirmEmail("");
                          setLeaveProblem(null);
                        }}
                      >
                        Delete my account…
                      </Btn>
                    )
                  }
                />
              )}

              {leaving && !account.admin ? (
                <div className="cc-leave" role="group" aria-label="Delete my account">
                  <p className="cc-leave-what">
                    This deletes your account and everything in it: boards, courses, pages,
                    recordings, flashcards, uploaded files and what chalk knows about you. Your plan
                    stops and nothing more is charged. Links you shared stop working. It can’t be
                    undone. (A record of past payments is kept, as the law asks.)
                  </p>
                  <label className="cc-leave-label">
                    <span>
                      Type <b>{account.email}</b> to confirm
                    </span>
                    <input
                      className="cc-input"
                      type="email"
                      autoComplete="off"
                      value={confirmEmail}
                      onChange={(event) => setConfirmEmail(event.target.value)}
                      placeholder={account.email}
                      aria-label="Your email, to confirm"
                    />
                  </label>
                  {leaveProblem ? (
                    <p className="cc-leave-note" role="alert">
                      {leaveProblem}
                    </p>
                  ) : null}
                  <div className="cc-leave-row">
                    <Btn size="sm" variant="ghost" disabled={busy} onClick={() => setLeaving(false)}>
                      Keep my account
                    </Btn>
                    <button
                      type="button"
                      className="cc-leave-go"
                      disabled={
                        busy || confirmEmail.trim().toLowerCase() !== account.email.toLowerCase()
                      }
                      onClick={() => void deleteAccount()}
                    >
                      {busy ? "Deleting…" : "Delete everything"}
                    </button>
                  </div>
                </div>
              ) : null}
            </Card>
          </>
        ) : usage.accounts ? null : (
          <div className="cc-callout">
            <SectionIcon id="privacy" size={20} />
            <span>
              <b>No account needed on this Mac</b>
              Everything stays on this computer. The limits below are what each plan has.
            </span>
          </div>
        )}

        {said ? (
          <p className="cc-note" role="status" style={{ marginTop: 12 }}>
            {said}
          </p>
        ) : null}
      </Section>

      <Section
        title={usage.period === "trial" ? "Your trial" : "This week"}
        meta={
          plan.allowance === null
            ? fairUse(usage.plan)
              ? `Fair use · resets ${resetsOn}`
              : "No limits"
            : usage.period === "trial"
              ? usage.trialEnds
                ? `${trialOver ? "Ended" : "Ends"} ${date(usage.trialEnds)}, or when used`
                : "Stops when used"
              : `Resets ${resetsOn}`
        }
      >
        <Card pad>
          <div className="cc-credits">
            <div className="cc-credits-big">
              {left === null ? A.credits(used.used) : A.credits(left)}
              <span>{left === null ? " used" : " left"}</span>
            </div>
            <div className="cc-row-help">{standing}</div>
          </div>

          {used.of !== null ? (
            <div
              className="cc-meter cc-meter-wide"
              role="meter"
              aria-label="Credits used"
              aria-valuemin={0}
              aria-valuemax={used.of}
              aria-valuenow={used.used}
            >
              <span style={{ width: `${Math.min(100, (used.used / used.of) * 100)}%` }} />
            </div>
          ) : null}

          {used.of !== null ? (
            <div className="cc-meter-used" style={{ marginTop: 8 }}>
              {used.used.toLocaleString()} of {used.of.toLocaleString()} used
            </div>
          ) : null}
        </Card>

        <div style={{ height: 12 }} />

        <Card pad>
          <div className="cc-row-title" style={{ marginBottom: 12 }}>
            <span>Where they went</span>
          </div>
          {usage.meters.map((meter, i) => (
            <div className="cc-spent-row" key={meter.unit} style={{ marginTop: i ? 14 : 0 }}>
              <div>
                <div className="cc-row-title">
                  <span>{meter.label}</span>
                </div>
                <div className="cc-row-help">
                  {meter.help}{" "}
                  {meter.unit === "agents"
                    ? `Each uses what it needs, up to its own cap — about ${A.credits(meter.each)}.`
                    : `${A.credits(meter.each)} ${meter.unit === "recording" ? "a minute" : "each"}.`}
                </div>
              </div>
              <div className="cc-meter-used">
                {meter.used
                  ? `${meter.used.toLocaleString()} ${unitWord(meter.unit, meter.used)} · ${A.credits(meter.credits)}`
                  : "None yet"}
              </div>
            </div>
          ))}
          {spent.length ? null : (
            <p className="cc-note" style={{ marginTop: 14 }}>
              Nothing used {usage.period === "trial" ? "yet" : "this week"}.
            </p>
          )}
        </Card>

        <p className="cc-note">
          Counted from what chalk did on this computer. Every plan is a number of credits; out of
          credits, chalk says so and starts nothing new until they come back — nothing you made is
          ever touched.
        </p>
      </Section>

      <Section
        title="Plans"
        desc={
          showing === "ngn"
            ? "Paid in naira on your card, every month. Smaller plans cost less and hold fewer credits; credits reset every Monday. Moving up is charged the difference for the rest of the month, now; moving down starts when the month you've paid for ends. Reading, replaying, editing, exporting and flashcard reviews never cost credits."
            : `Credits reset every Monday, and yearly is 20% off. ${A.STUDENT_LINE}${A.STUDIO_OPEN ? `, and 25% off ${A.STUDIO}` : ""}, with the same credits. Unlimited has no meters, only fair use. Reading, replaying, editing, exporting and flashcard reviews never cost credits.`
        }
      >
        <div className="cc-chips" style={{ marginBottom: 14 }}>
          {canPayNaira
            ? (["usd", "ngn"] as const).map((one) => (
                <button
                  type="button"
                  className="cc-chip"
                  data-on={showing === one ? "true" : "false"}
                  onClick={() => pickCurrency(one)}
                  key={one}
                >
                  {one === "usd" ? "US dollars" : "Naira · Nigeria"}
                </button>
              ))
            : null}

          {account?.billing && showing === "usd" ? (
            <>
              {canPayNaira ? <span style={{ width: 10 }} aria-hidden /> : null}
              {(["month", "year"] as const).map((one) => (
                <button
                  type="button"
                  className="cc-chip"
                  data-on={every === one ? "true" : "false"}
                  onClick={() => setEvery(one)}
                  key={one}
                >
                  {one === "month" ? "Monthly" : "Yearly · 20% off"}
                </button>
              ))}
            </>
          ) : null}
        </div>

        <div className="cc-plans">
          {(forSale as readonly string[]).map((id) => {
            const one = A.PLANS[id];
            const paying = account?.source === "stripe" || account?.source === "paystack";
            /* "Manage" rather than "choose" for the plan already being paid for. */
            const current = id === usage.plan && paying && !(onPaystack && (!sub?.renews || sub.next));
            const startsOn = onPaystack && sub?.next === id && sub.renews ? sub.renews : null;
            const buyable = !!(
              account?.billing &&
              account.onSale.includes(id) &&
              account.source !== "admin"
            );

            return (
              <div className="cc-plan" data-current={id === usage.plan ? "true" : "false"} key={id}>
                <div className="cc-plan-head">
                  <SectionTile id={PLAN_ART[id] ?? "plan"} size={40} />
                  <div style={{ flex: 1 }}>
                    <div className="cc-plan-name">{one.name}</div>
                    <div className="cc-plan-blurb">
                      {one.naira
                        ? `${A.naira(one.naira)}/month`
                        : one.price
                          ? `$${one.price.month}/month · $${one.price.year}/year${one.price.student ? ` · students & educators $${one.price.student}` : ""}, plus tax`
                          : ""}
                    </div>
                  </div>
                  {id === usage.plan ? (
                    <Tag tone="neutral">{usage.previewing ? "Previewing" : "Current"}</Tag>
                  ) : null}
                </div>

                <div className="cc-plan-blurb" style={{ marginTop: 8 }}>
                  {one.blurb}
                </div>

                <ul>
                  {one.includes.map((line) => (
                    <li key={line}>
                      <CheckIcon size={15} strokeWidth={2.6} />
                      {line}
                    </li>
                  ))}
                  <li>
                    <CheckIcon size={15} strokeWidth={2.6} />
                    Each week: {weekOf(id)}
                  </li>
                </ul>

                {startsOn ? (
                  <div className="cc-plan-blurb" style={{ marginTop: 12 }}>
                    Starts {date(startsOn)}
                  </div>
                ) : current ? (
                  <div style={{ marginTop: 12 }}>
                    <Btn size="sm" disabled={busy} onClick={() => void portal()}>
                      {onPaystack ? "Manage card" : "Manage billing"}
                    </Btn>
                  </div>
                ) : buyable ? (
                  <div style={{ marginTop: 12 }}>
                    <Btn size="sm" variant="primary" disabled={busy} onClick={() => void choose(id)}>
                      {id === usage.plan && onPaystack
                        ? "Keep this plan"
                        : paying
                          ? "Switch to this"
                          : "Choose"}{" "}
                      ·{" "}
                      {one.naira
                        ? `${A.naira(one.naira)}/month`
                        : account?.student && A.studentPrice(id, every) !== null
                          ? `$${A.studentPrice(id, every)}/${every === "year" ? "year" : "month"} (student)`
                          : every === "year"
                            ? `$${one.price?.year}/year`
                            : `$${one.price?.month}/month`}
                    </Btn>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="cc-note">
          The free trial: {weekOf("trial")} — for {A.TRIAL_DAYS} days, or until it’s used.
        </p>
        <p className="cc-note">
          What things cost:{" "}
          {PRICED_UNITS.map((unit) => `${COSTS[unit]} ${A.credits(A.CREDITS[unit])}`).join(" · ")}.
        </p>
      </Section>

      {account && showing === "usd" && A.ON_SALE.some((id) => A.studentPrice(id, "month") !== null) ? (
        <StudentPrice who={account} onDone={() => void load()} />
      ) : null}

      {account ? (
        <Section
          title="Have a code?"
          desc="A code from chalk gives you a plan for a while, no card needed. Discount codes for a paid plan go in at checkout."
        >
          <Card pad>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                className="cc-input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="CHALK-XXXX-XXXX"
                aria-label="Code"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void redeem();
                }}
                style={{ flex: 1, letterSpacing: ".08em" }}
              />
              <Btn variant="primary" disabled={busy || !code.trim()} onClick={() => void redeem()}>
                Redeem
              </Btn>
            </div>
            {codeSaid ? (
              <p className="cc-note" role="status" style={{ margin: "10px 0 0" }}>
                {codeSaid}
              </p>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {canPreview && (!usage.accounts || account?.admin) ? (
        <Section
          title="Preview a plan"
          desc="On your own Mac chalk has no limits. Preview a plan to meet its limits for real — switch back any time."
        >
          <div className="cc-chips">
            {["founder", "trial", ...(forSale as readonly string[])].map((id) => (
              <button
                type="button"
                className="cc-chip"
                data-on={usage.plan === id ? "true" : "false"}
                disabled={busy}
                onClick={() => void preview(id === "founder" ? null : id)}
                key={id}
              >
                {id === "founder" ? "No limits" : A.PLANS[id].name}
              </button>
            ))}
          </div>
        </Section>
      ) : null}
    </Pane>
  );
}
