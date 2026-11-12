/*
 * Learning how this person says their own words.
 *
 * Speech recognition is reliable on ordinary English and poor on everything
 * that matters to one person: their name, their course codes, the apps they
 * use. Rather than fight the recogniser, chalk reads a sentence it knows the
 * words of, lines up what came back against what was expected, and keeps the
 * differences as fixes it applies to everything heard afterwards.
 *
 * A fix is only worth keeping when the expected side holds a word this person
 * told us about — otherwise it is just the recogniser being wrong about
 * ordinary English, which is nobody's fault and nothing to remember.
 */

export type Hear = { heard: string; meant: string };

/* Words too common to be worth a fix on their own. */
const COMMON = new Set(
  "a an and are as at be but by can do for from go got had has have he her his how i if in is it its just like me my no not of on or our out she so some that the their them then there they this to too up us was we were what when where which who why will with would yeah yes you your yo bro okay ok well get want need one two".split(
    " ",
  ),
);

/** A word stripped to its letters and digits, for comparing. */
const bare = (word: string) =>
  word
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** Words, with punctuation trimmed off either end. */
const words = (text: string) =>
  text
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);

/** Rewrite what was heard using the fixes already learned, longest first. */
export function applyHears(text: string, hears: Hear[] | undefined) {
  if (!hears?.length || !text) return text;

  let fixed = text;
  for (const hear of [...hears].sort((a, b) => b.heard.length - a.heard.length)) {
    const parts = words(hear.heard).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!parts.length || !hear.meant.trim()) continue;
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${parts.join("[\\s,.-]+")}(?![\\p{L}\\p{N}])`,
      "giu",
    );
    fixed = fixed.replace(pattern, hear.meant);
  }
  return fixed;
}

/**
 * What to learn from one read-aloud: the pieces where `heard` differs from the
 * sentence that was `expected`, aligned by longest common subsequence so a
 * whole phrase can map onto a whole phrase.
 */
export function learnMishearings(expected: string, heard: string, vocabulary: string[]): Hear[] {
  const want = words(expected);
  const got = words(heard);
  const wantBare = want.map(bare);
  const gotBare = got.map(bare);

  /* lcs[i][j]: the longest match between want[i…] and got[j…]. */
  const lcs = Array.from({ length: want.length + 1 }, () => Array(got.length + 1).fill(0));
  for (let i = want.length - 1; i >= 0; i--)
    for (let j = got.length - 1; j >= 0; j--)
      lcs[i][j] =
        wantBare[i] === gotBare[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const known = new Set(vocabulary.map(bare).filter(Boolean));
  const learned: Hear[] = [];
  let i = 0;
  let j = 0;

  const take = (toI: number, toJ: number) => {
    const meant = want.slice(i, toI);
    const was = got.slice(j, toJ);

    if (!meant.length || !was.length) return;
    /* A long garble is a bad reading, not a mishearing of a word. */
    if (was.length > 5) return;
    /* The same words with different punctuation is not a difference. */
    if (meant.map(bare).join("") === was.map(bare).join("")) return;
    /* Only worth keeping when one of this person's own words is involved. */
    const mine = meant.filter(
      (word) =>
        known.has(bare(word)) ||
        [...known].some((one) => one.length > 3 && bare(word).includes(one)),
    );
    if (!mine.length) return;
    /* One ordinary or tiny word heard instead is noise. */
    if (was.length === 1 && (COMMON.has(bare(was[0])) || bare(was[0]).length < 4)) return;

    learned.push({ heard: was.join(" "), meant: meant.join(" ") });
  };

  while (i < want.length || j < got.length) {
    if (i < want.length && j < got.length && wantBare[i] === gotBare[j]) {
      i++;
      j++;
      continue;
    }

    /* Walk both sides forward to the next point where the match resumes. */
    let toI = i;
    let toJ = j;
    while (
      (toI < want.length || toJ < got.length) &&
      !(
        toI < want.length &&
        toJ < got.length &&
        wantBare[toI] === gotBare[toJ] &&
        lcs[toI][toJ] === lcs[i][j]
      )
    ) {
      if (toJ < got.length && (toI >= want.length || lcs[toI][toJ + 1] >= lcs[toI + 1][toJ])) toJ++;
      else toI++;
    }

    take(toI, toJ);
    i = toI;
    j = toJ;
  }

  return learned;
}

/** Add new fixes to the kept ones, newest winning, oldest dropped. */
export function mergeHears(kept: Hear[] | undefined, fresh: Hear[], keep = 100): Hear[] {
  const byHeard = new Map<string, Hear>();
  for (const hear of [...(kept ?? []), ...fresh]) byHeard.set(bare(hear.heard), hear);
  return [...byHeard.values()].slice(-keep);
}

/** Whether a reading was close enough to count as heard right. */
export function heardRight(expected: string, heard: string, vocabulary: string[]) {
  const want = words(expected).map(bare).filter(Boolean);
  const got = words(heard).map(bare).filter(Boolean);
  if (!want.length || !got.length) return false;

  const lcs = Array.from({ length: want.length + 1 }, () => Array(got.length + 1).fill(0));
  for (let i = want.length - 1; i >= 0; i--)
    for (let j = got.length - 1; j >= 0; j--)
      lcs[i][j] = want[i] === got[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const wantJoined = want.join("");
  const gotJoined = got.join("");
  /* Every one of this person's words that the sentence contained must be there. */
  const mine = vocabulary
    .map((word) => words(word).map(bare).join(""))
    .filter((word) => word && wantJoined.includes(word));

  return (
    lcs[0][0] / Math.max(want.length, got.length) >= 0.8 &&
    mine.every((word) => gotJoined.includes(word))
  );
}
