import "server-only";

/*
 * Writing a board.
 *
 * chalk is asked a question and answers with a board: a few sections, each a
 * handful of blocks, with a line said at each one and arrows between the ideas.
 * That is what this asks Claude for — as structured output, so what comes back
 * is already the board's own event shape (lib/board/events.ts) rather than
 * prose to be parsed.
 *
 * The board model is append-only, so the order here is the order it was drawn
 * in, and the narration is what the walkthrough replays.
 */

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";


import type { BoardEvent } from "@/lib/board/events";
import { DrawnBoard, toEvents } from "@/lib/board/written";
import type { Profile } from "@/lib/profile";

/* ---- how it is asked -------------------------------------------------- */

const SYSTEM = `You are chalk. Someone has asked you about something and you are drawing it on a board while you talk them through it.

A board is not an article. It is what a good teacher leaves on a whiteboard: a handful of ideas, placed so the shape of the thing is visible, with arrows for how they connect.

How to build one:
- Two to four sections. Each is one move in the explanation — the problem, the idea, why it matters, what it costs.
- Two to four blocks per section. A block holds one idea. If a block needs two paragraphs, it is two blocks.
- Lead with the thing that makes the rest make sense. Never open with a definition or a history.
- Connect blocks that actually follow from each other, and label the arrow with the relationship ("so", "but", "in steps") — not with a restatement.
- Put a block in column 1 when it sits beside the main line rather than after it: a formula, a worked example, a caveat.

How to write:
- Short sentences. Concrete nouns. No hedging, no throat-clearing, no "it is important to note".
- The reader is capable and does not know this yet. Never condescend, never pad.
- An example beats an adjective. A number beats an example.
- "say" is spoken, not written: what you would say as your hand moves to that block. One or two sentences, the reason or the point — not a reading of the block they can see.

Kinds:
- text: prose. term: a definition, with the term in the title. steps: an ordered procedure, in items.
- bullets: a short list, in items. formula: the maths in body, plainly written (x², √d, Σ) — never LaTeX.
- code: a short snippet in body. quote: something worth quoting. table: skip it unless the data is genuinely tabular.
- example / warning / insight: an aside that earns its own block — a worked case, a trap, the thing to take away.`;

/** How the person likes things explained, as a line for the prompt. */
function asksFor(profile: Profile | undefined) {
  if (!profile) return "";

  const asks: string[] = [];

  if (profile.depth === "quick") asks.push("Keep it to one section — the idea, nothing more.");
  if (profile.depth === "deep")
    asks.push("Go deep: four to six sections, including the mechanism and the edge cases.");

  if (profile.modality === "example-first")
    asks.push("Lead with a worked example, then the general rule.");
  if (profile.modality === "formal")
    asks.push("Be precise: definitions and assumptions rather than analogies.");

  if (profile.age && profile.age < 16)
    asks.push("They are under 16 — use everyday comparisons.");

  const role = profile.role?.trim();
  if (role) asks.push(`What they do: ${role}.`);

  const about = profile.about?.trim();
  if (about) asks.push(`In their words: ${about}`);

  const known = Object.entries(profile.level ?? {});
  if (known.length)
    asks.push(
      `What they already know: ${known.map(([subject, level]) => `${subject} (${level})`).join(", ")}.`,
    );

  if (profile.language && profile.language !== "en")
    asks.push(`Write the board in this language: ${profile.language}.`);

  return asks.length ? `\n\nAbout the person asking:\n${asks.map((one) => `- ${one}`).join("\n")}` : "";
}

export type WriteResult =
  | { ok: true; events: BoardEvent[] }
  | { ok: false; why: string; status: number };

/** Whether there is anything to call the API with. */
export const canWrite = () =>
  !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

/** Ask chalk for a board about `topic`. */
export async function writeBoard(topic: string, profile?: Profile): Promise<WriteResult> {
  if (!canWrite())
    return {
      ok: false,
      why: "chalk has no API key, so it can't draw this one yet.",
      status: 503,
    };

  try {
    const response = await anthropic().beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      /* Thinking is always on here; effort is the control, and this model's
       * default is medium — a board is worth the step up. */
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: betaZodOutputFormat(DrawnBoard),
      },
      /* A refused request otherwise just stops; this re-runs it on another
       * model inside the same call, routed by refusal category. */
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Draw me a board about this:\n\n${topic}${asksFor(profile)}`,
        },
      ],
    });

    if (response.stop_reason === "refusal")
      return {
        ok: false,
        why: "chalk wouldn't draw that one. Try asking it another way.",
        status: 422,
      };

    /* A board cut off mid-section would render as a half-finished thought. */
    if (response.stop_reason === "max_tokens")
      return {
        ok: false,
        why: "That got too big to draw in one go. Try asking for one part of it.",
        status: 422,
      };

    const drawn = response.parsed_output;
    if (!drawn?.sections?.length)
      return { ok: false, why: "chalk didn't manage a board for that.", status: 502 };

    return { ok: true, events: toEvents(drawn) };
  } catch (problem) {
    if (problem instanceof Anthropic.AuthenticationError)
      return { ok: false, why: "chalk's API key isn't working.", status: 503 };
    if (problem instanceof Anthropic.RateLimitError)
      return { ok: false, why: "chalk is busy right now — try again in a moment.", status: 429 };
    if (problem instanceof Anthropic.APIConnectionError)
      return { ok: false, why: "chalk couldn't be reached.", status: 503 };
    if (problem instanceof Anthropic.APIError)
      return { ok: false, why: `chalk couldn't draw that (${problem.status}).`, status: 502 };

    return { ok: false, why: "Something went wrong drawing that.", status: 500 };
  }
}
