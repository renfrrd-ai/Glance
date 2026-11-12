"use client";

/*
 * Puts the cursor's colour and size on the document, so every board and every
 * framed page draws the same buddy. It listens for both the in-page event and
 * the storage event, which is how another tab's change arrives.
 */

import { useEffect } from "react";

import { CURSOR_KEY, cursorVars, readCursor } from "@/lib/cursor";

export function CursorLook() {
  useEffect(() => {
    const paint = () => {
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem(CURSOR_KEY) ?? "null");
      } catch {
        /* private window */
      }
      const style = document.documentElement.style;
      for (const [name, value] of Object.entries(cursorVars(readCursor(stored))))
        style.setProperty(name, value);
    };

    paint();

    const onStorage = (event: StorageEvent) => {
      if (event.key === CURSOR_KEY) paint();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("chalk:cursor", paint);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("chalk:cursor", paint);
    };
  }, []);

  return null;
}
