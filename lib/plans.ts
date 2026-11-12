/*
 * What each plan costs, what it includes, and how a week's work is counted.
 *
 * Everything is measured in credits. CREDITS says what one of a thing costs, a
 * plan's `allowance` is the comfortable shape of a week in that plan, and
 * `credits` is the real ceiling — the allowance is what the pane shows, the
 * credits are what runs out.
 */

export type UnitKey =
  | "questions"
  | "classes"
  | "boards"
  | "recording"
  | "agents"
  | "speaking"
  | "writing";

export const UNITS: Record<UnitKey, { label: string; short: string; help: string }> = {
  questions: {
    label: "Questions on screen",
    short: "questions",
    help: "Hold ⌘⌥ and ask. A walkthrough counts as one question.",
  },
  classes: {
    label: "Classes",
    short: "classes",
    help: "Counted when chalk builds a class, a one-off lesson, flashcards or a quiz — not when you open it.",
  },
  boards: {
    label: "Boards",
    short: "boards",
    help: "Boards chalk draws for you, from a topic or a picture.",
  },
  recording: {
    label: "Recording",
    short: "minutes",
    help: "Minutes chalk listens to a class and writes it up.",
  },
  agents: {
    label: "Agent tasks",
    short: "tasks",
    help: "One run of an agent, on a schedule or when you ask.",
  },
  speaking: {
    label: "Speaking practice",
    short: "spoken checks",
    help: "Each time chalk listens to you say a phrase or answer, and checks it.",
  },
  writing: {
    label: "Writing & conversation practice",
    short: "practice checks",
    help: "Each time chalk marks a piece of your writing, or answers you in a practice conversation. Checking the same words again is free.",
  },
};

/** What one of each thing costs, in credits. */
export const CREDITS: Record<UnitKey, number> = {
  questions: 3,
  classes: 10,
  boards: 10,
  recording: 1,
  agents: 10,
  speaking: 1,
  writing: 1,
};

export const STUDIO = "Studio";
export const STUDIO_OPEN = false;
export const TEACH_OPEN = false;
export const TRIAL_DAYS = 7;
export const TRIAL_OVER =
  "Your free week is over. Choose a plan to keep going — everything you made stays.";

/** The plans shown on the pane, in order. */
export const ON_SALE = ["board", "board_spatial", "unlimited"] as const;
export const NAIRA_PLANS = ["ng_lite", "ng_board", "ng_max", "ng_spatial"] as const;

const RECORDING_LINE = "Listen in class: transcripts, notes, translations";
const BOARD_INCLUDES = [
  "Boards on any topic, drawn and walked through with you",
  "Courses from any topic or from your own files",
  "Flashcards, quizzes, notes, cheat sheets, and speaking and writing practice",
  RECORDING_LINE,
];
const BOARD_INCLUDES_NO_RECORDING = BOARD_INCLUDES.filter((line) => line !== RECORDING_LINE);
const SPATIAL_INCLUDES = [
  "Everything in Board",
  "Hold ⌘⌥ and ask about anything on your screen",
  "chalk points at the real control and walks you through it",
  "Reads whole documents, without scrolling them",
];

export type Allowance = Partial<Record<UnitKey, number>>;

export type Plan = {
  id: string;
  name: string;
  blurb: string;
  /** How often the allowance comes back. */
  period?: "trial" | "week";
  price?: { month: number; year: number; student?: number };
  /** Naira plans are priced per month, in naira. */
  naira?: number;
  /** null means no meters at all. */
  allowance: Allowance | null;
  credits: number | null;
  /** Where a plan stops being worth running at a loss. */
  tripwireUsd?: number;
  includes: string[];
};

export const PLANS: Record<string, Plan> = {
  trial: {
    id: "trial",
    name: "Free trial",
    blurb: "A week to try everything. It ends after seven days, or sooner if its credits are used.",
    period: "trial",
    allowance: { questions: 15, classes: 3, boards: 1, recording: 30, speaking: 20, writing: 20 },
    credits: 160,
    tripwireUsd: 1.35,
    includes: ["A taste of everything chalk does", "Nothing you make is ever taken away"],
  },
  board: {
    id: "board",
    name: "Board",
    blurb: "Learn anything. Get through a semester.",
    price: { month: 10, year: 96 },
    period: "week",
    allowance: { classes: 8, boards: 3, recording: 110, speaking: 40, writing: 40 },
    credits: 300,
    tripwireUsd: 2.1,
    includes: BOARD_INCLUDES,
  },
  board_spatial: {
    id: "board_spatial",
    name: "Board + Spatial",
    blurb: "Everything in Board, plus ask about anything on your Mac screen.",
    price: { month: 25, year: 240, student: 18 },
    period: "week",
    allowance: {
      questions: 100,
      classes: 8,
      boards: 3,
      recording: 110,
      speaking: 40,
      writing: 40,
    },
    credits: 600,
    tripwireUsd: 5.55,
    includes: SPATIAL_INCLUDES,
  },
  everything: {
    id: "everything",
    name: STUDIO,
    blurb: "Board and Spatial, with more of everything each week.",
    price: { month: 40, year: 384, student: 30 },
    period: "week",
    allowance: {
      questions: 100,
      classes: 12,
      boards: 5,
      recording: 210,
      speaking: 40,
      writing: 40,
    },
    credits: 950,
    tripwireUsd: 8.7,
    includes: [
      "Everything in Board + Spatial",
      "More credits every week",
      "Tell Claude: hand a page's changes to your Claude Code",
    ],
  },
  unlimited: {
    id: "unlimited",
    name: "Unlimited",
    blurb: "Everything, with no meters to watch. One fair-use ceiling, far above a normal week.",
    price: { month: 100, year: 960 },
    period: "week",
    allowance: null,
    credits: null,
    tripwireUsd: 10,
    includes: [
      "Everything in Board + Spatial",
      "Boards, classes, questions and recordings, without counting",
    ],
  },
  ng_lite: {
    id: "ng_lite",
    name: "Board Lite",
    blurb: "Board for a lighter week: three boards, a few classes and some practice.",
    naira: 5_000,
    period: "week",
    allowance: { classes: 3, boards: 3, speaking: 20, writing: 20 },
    credits: 100,
    tripwireUsd: 0.7,
    includes: BOARD_INCLUDES_NO_RECORDING,
  },
  ng_board: {
    id: "ng_board",
    name: "Board",
    blurb: "Board for a steady week of study: boards, courses and practice.",
    naira: 10_000,
    period: "week",
    allowance: { classes: 6, boards: 6, speaking: 40, writing: 40 },
    credits: 200,
    tripwireUsd: 1.4,
    includes: BOARD_INCLUDES_NO_RECORDING,
  },
  ng_max: {
    id: "ng_max",
    name: "Board Max",
    blurb: "All of Board, class recording included.",
    naira: 15_000,
    period: "week",
    allowance: { classes: 9, boards: 9, recording: 80, speaking: 20, writing: 20 },
    credits: 300,
    tripwireUsd: 2.1,
    includes: BOARD_INCLUDES,
  },
  ng_spatial: {
    id: "ng_spatial",
    name: "Board + Spatial",
    blurb: "Everything in Board, plus ask about anything on your Mac screen.",
    naira: 25_000,
    period: "week",
    allowance: { questions: 80, classes: 5, boards: 9, recording: 50, speaking: 10, writing: 10 },
    credits: 450,
    tripwireUsd: 3.9,
    includes: SPATIAL_INCLUDES,
  },
  founder: {
    id: "founder",
    name: "Founder",
    blurb: "Your own Mac: everything, no limits. Preview a plan below to meet its limits.",
    period: "week",
    allowance: null,
    credits: null,
    includes: ["Everything", "No limits"],
  },
};

export const STUDENT_LINE = `Students and educators get ${PLANS.board_spatial.name} for $${PLANS.board_spatial.price?.student} a month`;

export const isPlan = (id: unknown): id is string => typeof id === "string" && id in PLANS;
export const isNaira = (id: string) => (NAIRA_PLANS as readonly string[]).includes(id);

export const credits = (n: number) =>
  `${Math.round(n).toLocaleString()} credit${Math.round(n) === 1 ? "" : "s"}`;
export const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-US")}`;

/* Features that are not on sale yet sit behind the founder plan. */
export const hasAutopilot = (plan: string) => plan === "founder";
export const hasTeach = (plan: string) => plan === "founder";
export const hasTellClaude = (plan: string) => plan === "founder";

/** A year costs three quarters of the monthly student price, rounded. */
export function studentPrice(plan: string, every: "month" | "year") {
  const price = PLANS[plan].price;
  if (!price?.student) return null;
  return every === "month" ? price.student : Math.round(price.year * 0.75);
}

/**
 * Why a thing isn't available on this plan, in a sentence that names the plan
 * that does include it — or null when it is available here.
 */
export function notInPlan(plan: string, unit: UnitKey): string | null {
  const here = PLANS[plan];
  if (here.allowance === null || here.allowance[unit] !== undefined) return null;

  const list = isNaira(plan) ? NAIRA_PLANS : ON_SALE;
  const better = (list as readonly string[]).find((id) => PLANS[id].allowance?.[unit] !== undefined);

  if (unit === "questions")
    return `Spatial isn't part of the ${here.name} plan.${better ? ` ${PLANS[better].name} includes it.` : ""}`;
  if (unit === "recording")
    return `Recording a class isn't part of the ${here.name} plan.${better ? ` ${PLANS[better].name} includes it — Settings › Plan & usage.` : ""}`;

  const tail = better ? ` ${PLANS[better].name} includes them — Settings › Plan & usage.` : "";
  return `${UNITS[unit].label} aren't part of the ${here.name} plan.${tail}`;
}
