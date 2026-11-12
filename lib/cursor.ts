/*
 * The cursor: the little nib-and-face buddy that points things out, on your
 * screen and on a board. Its colour and size are a setting because it is on
 * screen beside your own pointer all day.
 */

export const CURSOR_KEY = "chalk.cursor.v1";

export const CURSOR_COLORS = [
  { id: "jade", name: "Jade", hex: "#29A383" },
  { id: "blue", name: "Blue", hex: "#3C7CF0" },
  { id: "violet", name: "Violet", hex: "#7E5BEF" },
  { id: "pink", name: "Pink", hex: "#D9468F" },
  { id: "vermilion", name: "Vermilion", hex: "#E0482A" },
  { id: "graphite", name: "Graphite", hex: "#3A3B40" },
] as const;

export const CURSOR_SIZES = [
  { id: "small", name: "Small", scale: 0.85 },
  { id: "medium", name: "Medium", scale: 1 },
  { id: "large", name: "Large", scale: 1.3 },
] as const;

export type Cursor = {
  color: string;
  size: string;
  /** Ride beside the pointer even with nothing to show. */
  follow: boolean;
};

export const DEFAULT_CURSOR: Cursor = { color: "jade", size: "medium", follow: false };

export const cursorHex = (cursor: Cursor) =>
  CURSOR_COLORS.find((one) => one.id === cursor.color)?.hex ?? CURSOR_COLORS[0].hex;

export const cursorScale = (cursor: Cursor) =>
  CURSOR_SIZES.find((one) => one.id === cursor.size)?.scale ?? 1;

/** The custom properties the renderer and the board read the cursor from. */
export const cursorVars = (cursor: Cursor) => ({
  "--o-cursor": cursorHex(cursor),
  "--o-cursor-scale": String(cursorScale(cursor)),
});

/** A stored cursor, with anything unrecognised fallen back to the default. */
export function readCursor(stored: unknown): Cursor {
  const kept = (stored && typeof stored === "object" ? stored : {}) as Partial<Cursor>;
  return {
    color: CURSOR_COLORS.find((one) => one.id === kept.color)?.id ?? DEFAULT_CURSOR.color,
    size: CURSOR_SIZES.find((one) => one.id === kept.size)?.id ?? DEFAULT_CURSOR.size,
    follow: typeof kept.follow === "boolean" ? kept.follow : DEFAULT_CURSOR.follow,
  };
}
