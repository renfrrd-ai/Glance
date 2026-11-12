/*
 * The development store.
 *
 * The real chalk keeps all of this per account (and, in the Mac app, on the
 * Mac itself). This module stands in for that so the control center is usable
 * while the server side is built out: it holds the same shapes the panes
 * expect, in memory, for as long as the dev server runs.
 *
 * Replace the exports here one at a time with real reads and writes; the route
 * handlers under app/api are deliberately thin so that is all it takes.
 */

import { CREDITS, PLANS, UNITS, type UnitKey } from "@/lib/plans";

export const BUILD = process.env.BUILD_ID ?? "dev";

/** Monday morning: when a week's credits come back. */
function nextMonday() {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
  return monday.toISOString();
}

type Meter = { unit: UnitKey; used: number };

type State = {
  plan: string;
  /** The plan being previewed, which replaces `plan` while it is set. */
  preview: string | null;
  usersView: boolean;
  period: "trial" | "week";
  trialEnds: string | null;
  meters: Meter[];
  memory: { id: string; text: string; kind: string; seen: string }[];
  memoryOff: boolean;
  skills: { id: string; goal: string; app: string; times: number }[];
  reports: { id: string; status: string; at: string; message: string; note?: string }[];
  setup: { asked?: string; opened?: string; walked?: string; done?: boolean; dismissed?: boolean };
  shares: { token: string; title: string; kind: string; createdAt: string }[];
  boards: { id: string; title: string; origin: string; sectionCount: number; createdAt: string }[];
  courses: {
    id: string;
    title: string;
    status: string;
    progress: { done: number; total: number };
    next: { id: string; label: string } | null;
  }[];
  timings: unknown[];
};

/* Next's dev server reloads modules, so the state hangs off globalThis to
 * survive a hot reload rather than resetting on every edit. */
const kept = globalThis as typeof globalThis & { __chalkDev?: State };

export const state: State =
  kept.__chalkDev ??
  (kept.__chalkDev = {
    plan: "founder",
    preview: null,
    usersView: false,
    period: "week",
    trialEnds: null,
    meters: [
      { unit: "questions", used: 0 },
      { unit: "classes", used: 0 },
      { unit: "boards", used: 0 },
      { unit: "recording", used: 0 },
      { unit: "agents", used: 0 },
      { unit: "speaking", used: 0 },
      { unit: "writing", used: 0 },
    ],
    memory: [],
    memoryOff: false,
    skills: [],
    reports: [],
    setup: {},
    shares: [],
    boards: [],
    courses: [],
    timings: [],
  });

/** The plan in force: the previewed one if there is one. */
export const activePlan = () => state.preview ?? state.plan;

/** What /api/account answers: the plan, the week so far, and the account. */
export function usage() {
  const plan = PLANS[activePlan()];
  const of = plan.credits;

  const meters = state.meters.map((meter) => ({
    unit: meter.unit,
    label: UNITS[meter.unit].label,
    help: UNITS[meter.unit].help,
    each: CREDITS[meter.unit],
    used: meter.used,
    credits: meter.used * CREDITS[meter.unit],
  }));

  const used = meters.reduce((total, meter) => total + meter.credits, 0);

  return {
    plan: activePlan(),
    features: state.plan,
    previewing: state.preview !== null,
    usersView: state.usersView,
    period: state.period,
    trialEnds: state.trialEnds,
    resets: nextMonday(),
    credits: { used, of },
    meters,
    /* No account in development: everything is local, which is also what a
     * personal Mac build looks like. */
    account: null,
    accounts: false,
  };
}
