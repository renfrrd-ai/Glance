"use client";

import { X } from "lucide-react";

import { HowtoGallery } from "@/components/howto/gallery";
import { shell } from "@/lib/prefs";

/** The how-to films, over the control center. */
export function HowTo({ start, onClose }: { start?: string; onClose: () => void }) {
  return (
    <div
      className="cc-typeask cc-howto-wrap"
      role="dialog"
      aria-modal="true"
      aria-label="How-to videos"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cc-howto">
        <div className="cc-howto-head">
          <span className="cc-howto-title">How-to videos</span>
          <button type="button" className="cc-howto-x" onClick={onClose} aria-label="Close" autoFocus>
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>
        {/* In a browser, the films about the Mac app would only frustrate. */}
        <HowtoGallery start={start} only={shell() ? undefined : "web"} autoPlay={!!start} />
      </div>
    </div>
  );
}
