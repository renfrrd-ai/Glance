"use client";

/*
 * The words chalk should hear right, read straight from where the profile
 * lives rather than through React.
 *
 * Recording needs these at the moment a chunk is cut, which can be long after
 * any component read the profile — so this goes to the source: the Mac app's
 * store when there is one, this browser's otherwise.
 */

import { shell } from "./prefs";
import type { Hear, Profile } from "./profile";

const PROFILE_KEY = "chalk.profile.v1";

export type ProfileWords = { vocabulary: string[]; hears: Hear[] };

/** Only the parts worth sending, and the name counted as a word to know. */
function wordsOf(profile: Partial<Profile> | null): ProfileWords {
  const vocabulary = Array.isArray(profile?.vocabulary)
    ? profile.vocabulary.filter((word): word is string => typeof word === "string")
    : [];

  const name = typeof profile?.name === "string" ? profile.name.trim().slice(0, 60) : "";

  return {
    vocabulary: [
      ...(name && !vocabulary.some((word) => word.toLowerCase() === name.toLowerCase())
        ? [name]
        : []),
      ...vocabulary,
    ].slice(0, 120),
    hears: Array.isArray(profile?.hears)
      ? profile.hears
          .filter(
            (one): one is Hear =>
              !!one && typeof one.heard === "string" && typeof one.meant === "string",
          )
          .slice(0, 100)
      : [],
  };
}

export async function readProfileWords(): Promise<ProfileWords> {
  try {
    const host = shell();
    if (host?.pref) {
      const stored = await host.pref("profile");
      if (stored) return wordsOf(stored as Partial<Profile>);
    }
  } catch {
    /* fall through to this browser's copy */
  }

  try {
    return wordsOf(JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null"));
  } catch {
    return { vocabulary: [], hears: [] };
  }
}

/** The whole profile, for anything that needs more than the words. */
export async function readProfile(): Promise<Partial<Profile> | null> {
  try {
    const host = shell();
    if (host?.pref) {
      const stored = await host.pref("profile");
      if (stored && typeof stored === "object") return stored as Partial<Profile>;
    }
  } catch {
    /* fall through */
  }

  try {
    const stored = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
    return stored && typeof stored === "object" ? stored : null;
  } catch {
    return null;
  }
}
