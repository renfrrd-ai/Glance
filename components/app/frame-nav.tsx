"use client";

/*
 * Inside the control center's rail, this page is in an iframe. Without this,
 * the rail's back button would have to reload the frame to move it; with it,
 * the frame navigates in place and keeps its state.
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function FrameNav() {
  const router = useRouter();

  useEffect(() => {
    if (window.self === window.top) return;
    window.__chalkGo = (path: string) => router.replace(path, { scroll: false });
    return () => {
      delete window.__chalkGo;
    };
  }, [router]);

  return null;
}
