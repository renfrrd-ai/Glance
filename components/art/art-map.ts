import { C } from "./palette";
import type { DrawingId } from "./drawings";

/*
 * Which drawing stands for which part of the app. Several sections share one
 * drawing — Boards and the Board settings are the same whiteboard — so the
 * section ids are mapped onto drawing ids rather than duplicating paths.
 */
const DRAWING_FOR: Record<string, DrawingId> = {
  home: "learn",
  boards: "board",
  agents: "step",
  recordings: "voice",
  teach: "note",
  appearance: "pen",
  materials: "note",
  pages: "pen",
};

export const drawingFor = (id: string): DrawingId => DRAWING_FOR[id] ?? (id as DrawingId);

export type ArtColors = {
  /** The tile's background. */
  tile: string;
  /** The same drawing's colour in the rail, lifted to read on a dark sidebar. */
  rail: string;
  /** The hatching inside the drawing. */
  hatch: string;
  /** The hero band behind the tiles. */
  bg: string;
  /** The arcs drawn across that band. */
  arcs: string;
  /** What the outlined shapes are filled with, when not cream. */
  paper?: string;
};

/** Every section's colours, in the order they appear in the control center. */
export const ART: Record<string, ArtColors> = {
  you: { tile: C.peri, rail: "#A9ABEE", hatch: C.vermilion, bg: C.cream, arcs: C.green },
  memory: { tile: C.pink, rail: "#F290BA", hatch: C.peri, bg: C.peri, arcs: C.marigold },
  learn: { tile: C.marigold, rail: C.marigold, hatch: C.vermilion, bg: C.cream, arcs: C.vermilion },
  plan: { tile: C.pink, rail: "#F290BA", hatch: C.marigold, bg: C.sky, arcs: C.peri },
  privacy: { tile: C.charcoal, rail: "#BDBDC6", hatch: C.teal, bg: C.teal, arcs: C.navy },
  spatial: { tile: C.vermilion, rail: "#F26B4C", hatch: C.marigold, bg: C.sky, arcs: C.green },
  board: { tile: C.green, rail: "#3FBE6E", hatch: C.marigold, bg: C.marigold, arcs: C.vermilion },
  cursor: { tile: C.teal, rail: "#5ACDBE", hatch: C.peri, bg: C.peri, arcs: C.navy },
  prompter: {
    tile: C.cream,
    rail: "#EFE4C8",
    hatch: C.peri,
    bg: C.marigold,
    arcs: C.green,
    paper: "#FFFFFF",
  },
  library: { tile: C.navy, rail: "#8EB0EC", hatch: C.teal, bg: C.green, arcs: C.sky },
  meetings: { tile: C.marigold, rail: C.marigold, hatch: C.vermilion, bg: C.teal, arcs: C.cream },
  apps: { tile: C.sky, rail: C.sky, hatch: C.vermilion, bg: C.pink, arcs: C.navy, paper: "#FFFFFF" },
  voice: { tile: C.vermilion, rail: "#F26B4C", hatch: C.marigold, bg: C.green, arcs: C.sky },
  screen: { tile: C.sky, rail: C.sky, hatch: C.peri, bg: C.sky, arcs: C.green },
  pen: { tile: C.marigold, rail: C.marigold, hatch: C.vermilion, bg: C.cream, arcs: C.vermilion },
  home: { tile: C.marigold, rail: C.marigold, hatch: C.vermilion, bg: C.cream, arcs: C.vermilion },
  boards: { tile: C.green, rail: "#3FBE6E", hatch: C.marigold, bg: C.marigold, arcs: C.vermilion },
  agents: { tile: C.peri, rail: "#A9ABEE", hatch: C.marigold, bg: C.sky, arcs: C.peri },
  recordings: { tile: C.vermilion, rail: "#F26B4C", hatch: C.marigold, bg: C.green, arcs: C.sky },
  teach: { tile: C.teal, rail: "#5ACDBE", hatch: C.peri, bg: C.peri, arcs: C.navy },
  materials: { tile: C.teal, rail: "#5ACDBE", hatch: C.marigold, bg: C.teal, arcs: C.marigold },
  pages: { tile: C.pink, rail: "#F290BA", hatch: C.marigold, bg: C.marigold, arcs: C.pink },
  appearance: {
    tile: C.sky,
    rail: C.sky,
    hatch: C.pink,
    bg: C.pink,
    arcs: C.navy,
    paper: "#FFFFFF",
  },
};
