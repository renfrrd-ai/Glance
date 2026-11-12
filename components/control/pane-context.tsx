"use client";

import { createContext, useContext } from "react";

/**
 * What a settings pane needs to know about the rail around it: which section it
 * is, the order of every section (so the hero can show its neighbours), their
 * names, and how to go somewhere else.
 */
export type PaneContext = {
  art: string;
  order: string[];
  names: Record<string, string>;
  go: (id: string) => void;
};

const Pane = createContext<PaneContext>({
  art: "you",
  order: [],
  names: {},
  go: () => {},
});

export const PaneProvider = Pane.Provider;

export const usePane = () => useContext(Pane);
