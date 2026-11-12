/** A time as a few words: "just now", "2h ago", "Tue", "3 Nov". */
export function when(at: string | number | Date | undefined | null) {
  if (!at) return "";
  const then = new Date(at);
  const ms = Date.now() - then.getTime();
  if (!Number.isFinite(ms)) return "";

  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  /* Within the week, the day's name places it better than a count. */
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: "short" });

  return then.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(then.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

/** The heading a list groups this day's items under. */
export function dayGroup(at: string | number | Date) {
  const then = new Date(at);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const days = Math.floor((midnight.getTime() - then.getTime()) / 86_400_000);
  if (days < 0) return "Today";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Earlier this week";
  if (days < 30) return "Earlier this month";

  return then.toLocaleDateString(undefined, {
    month: "long",
    ...(then.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}
