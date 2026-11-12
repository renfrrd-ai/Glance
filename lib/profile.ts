/*
 * What chalk knows about the person using it. The profile is kept in the Mac
 * app's own store when there is one, and in localStorage otherwise — see
 * lib/prefs.ts. It is small on purpose: enough to pitch an explanation at the
 * right level, and to hear unusual words right.
 */

export type Level = "beginner" | "intermediate" | "advanced";
export type Depth = "quick" | "standard" | "deep";
export type Modality = "diagram-first" | "example-first" | "formal";

export type Hear = { heard: string; meant: string };

export type Profile = {
  /** What chalk calls you. */
  name?: string;
  age?: number;
  /** What you do, in a few words. Read to guess whether you teach. */
  role?: string;
  /** Set only when you say so, which overrides the guess from `role`. */
  teaches?: boolean;
  /** What you're working on and how you like to learn, in your own words. */
  about?: string;
  /** Per subject: how much you already know. Keyed by the subject, lowercased. */
  level: Record<string, Level>;
  /** How much detail a board goes into. */
  depth: Depth;
  /** What an explanation leads with. */
  modality: Modality;
  /** The language boards are written in. */
  language: string;
  /** Things to remember, in your words. */
  memory?: string[];
  /** Words chalk should know, so it hears them right. */
  vocabulary?: string[];
  /** Fixes learned from reading aloud: what chalk heard, and what you meant. */
  hears?: Hear[];
};

export const DEFAULT_PROFILE: Profile = {
  level: {},
  depth: "standard",
  modality: "diagram-first",
  language: "en",
};

export const DEPTHS: { value: Depth; label: string; hint: string }[] = [
  { value: "quick", label: "Quick", hint: "one section — the idea, nothing more" },
  { value: "standard", label: "Standard", hint: "two or three sections" },
  { value: "deep", label: "Deep", hint: "four to six — mechanism, example, edge cases" },
];

export const MODALITIES: { value: Modality; label: string; hint: string }[] = [
  { value: "diagram-first", label: "Show me the shape", hint: "structure first, prose after" },
  {
    value: "example-first",
    label: "Show me a case",
    hint: "a worked example, then the general rule",
  },
  { value: "formal", label: "Be precise", hint: "definitions and assumptions, not analogies" },
];

export const LEVELS: { value: Level; label: string }[] = [
  { value: "beginner", label: "New to it" },
  { value: "intermediate", label: "Know some" },
  { value: "advanced", label: "Know it well" },
];

/** How a level reads in a sentence. */
export const LEVEL_WORDS: Record<Level, string> = {
  beginner: "new to it",
  intermediate: "know some",
  advanced: "know it well",
};

export const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["pt", "Português"],
  ["de", "Deutsch"],
  ["ar", "العربية"],
  ["hi", "हिन्दी"],
  ["yo", "Yorùbá"],
  ["ha", "Hausa"],
  ["ig", "Igbo"],
  ["sw", "Kiswahili"],
  ["zh", "中文"],
];

/*
 * Whether this person teaches, guessed from what they say they do. The second
 * pattern strips the phrases that would otherwise read as teaching — someone
 * "teaching myself Rust" is a learner, and a "principal engineer" is not a
 * school principal — before the first one looks for a real teaching word.
 */
const TEACHES =
  /\b(teach(?:er|ers|es|ing)?|lecturer|lecturing|tutor(?:ing)?|professor|prof|educator|instructor|faculty|headteacher|head of (?:year|department)|TA|teaching assistant|school ?(?:leader|principal)|principal)\b/i;

const NOT_TEACHING =
  /\bteach(?:ing)? (?:myself|me)\b|\bfaculty of\b|\bprincipal (?:engineer|software|product|program|project|data|design|designer|scientist|consultant|architect|analyst|developer|researcher|investigator|manager|pm|associate|writer|strategist|ux|ui)\b/gi;

export function teaches(profile: Profile): boolean {
  if (typeof profile.teaches === "boolean") return profile.teaches;
  const role = (profile.role?.trim() ?? "").replace(NOT_TEACHING, " ");
  return TEACHES.test(role);
}
