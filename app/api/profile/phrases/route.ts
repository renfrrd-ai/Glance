/*
 * Five sentences to read aloud, built out of this person's own words so the
 * reading exercises exactly what speech recognition tends to get wrong.
 */
const AROUND = [
  (word: string) => `I'm working on ${word} this week.`,
  (word: string) => `Can you open ${word} for me?`,
  (word: string) => `Remind me about ${word} tomorrow.`,
  (word: string) => `${word} is the part I keep getting stuck on.`,
  (word: string) => `Let's go through ${word} one more time.`,
];

const PLAIN = [
  "I'd like to go through this again tomorrow.",
  "Can you show me where that setting is?",
  "This is the part I keep getting stuck on.",
  "Let's take it one step at a time.",
  "I think I've got it now, thanks.",
];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const words: string[] = Array.isArray(body.words)
    ? body.words.filter((word: unknown) => typeof word === "string" && word.trim()).slice(0, 5)
    : [];

  const phrases = words.length
    ? words.map((word, i) => AROUND[i % AROUND.length](word.trim()))
    : PLAIN;

  return Response.json({ phrases: phrases.slice(0, 5) });
}
