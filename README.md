# glance

The chalk control center, as source.

This is a Next.js app rebuilt from a production capture of `www.trychalk.tech/control` —
the signed-in shell that holds the whole product: a rail on the left, each app area in
an iframe beside it, and the settings panes that live in the shell itself.

```
npm install
npm run dev     # http://localhost:3000/control
npm run build
npm run typecheck
```

## What's here

| Path | What it is |
| --- | --- |
| [app/control/page.tsx](app/control/page.tsx) | The one page: the control center |
| [components/control/control-center.tsx](components/control/control-center.tsx) | The shell — rail, hash routing, framed apps, keyboard, full screen |
| [components/control/panes/](components/control/panes/) | The ten settings panes |
| [components/control/primitives.tsx](components/control/primitives.tsx) | Section / Card / Row / Field / Switch / Seg / Tag / Btn |
| [components/art/](components/art/) | The hand-drawn icon system: 50 doodles, tiles, hero arcs, the logo, the face |
| [components/howto/gallery.tsx](components/howto/gallery.tsx) | The how-to films: silent picture plus a separate audio track |
| [lib/](lib/) | Plans and credits, the profile, settings storage, mishearings, personalities |
| [styles/control-center.css](styles/control-center.css) | The component stylesheet (3.5k lines) |
| [app/api/](app/api/) | Thin route handlers over a development store |

### How the shell works

The rail switches between two kinds of thing. An **app section** (Home, Boards, Pages,
Recordings, Materials, Teach) is a real page of the site, kept in an iframe so its state
survives switching away and back; a **settings pane** is React, rendered into `<main>`.
Both share one id space, because the rail, the hash in the address bar and the phone tab
bar all address them the same way. The registry is [components/control/sections.ts](components/control/sections.ts).

Three things in there are worth knowing before changing them:

- **Back inside a frame.** An iframe's history is not ours to read, and its own back
  button would walk the whole control center back. So each frame's path is sampled every
  400ms and kept as a stack, and `⌘[` pops that.
- **Warming.** Once the section you are on has loaded and the machine is idle, the next
  unopened section is loaded behind it, so switching to it is instant.
- **Stale builds.** `/api/version` is polled; when the build id changes, the *next*
  navigation reloads instead of fetching chunks that are gone.

### Settings storage

A setting lives in `localStorage` on the web and in the Mac app's own store when there is
one — the app reads the same settings, so a second copy here would just disagree with it.
[lib/prefs.ts](lib/prefs.ts) hides that: `usePref` reads from the shell when there is one,
writes back through it, and mirrors the handful of keys the board renderer reads directly.
Its third return value says whether the real value has arrived yet; writing before that
would overwrite the setting with a default.

## State of the rebuild

Recovered in full from the capture, and faithful to it: the control center shell, the ten
panes and their copy, the primitives, the whole icon system and its 50 drawings, the plans
and credits model, settings storage, the mishearing learner, the six personalities, the
cursor, the how-to player, and the Spatial setup wizard.

Standing in, and marked as such where it shows:

- **`app/api/*`** — thin handlers over an in-memory development store
  ([lib/server/store.ts](lib/server/store.ts)). Memory, reports, the setup wizard and plan
  previewing really work; billing, speech, transcription, profile import and MCP answer
  `501` rather than pretend. Replace them one at a time — the handlers are deliberately thin.
- **The framed app areas** (`/learn`, `/boards`, `/recordings`, …) — each is a placeholder
  page, because the capture only contained the shell. They have to answer with something,
  or the rail frames a broken page instead of an obvious gap.
- **Assets referenced but not in the capture** — `/howto/index.json` and its films,
  `/voices/*.mp3`. Both degrade honestly: the gallery says the videos are on their way, and
  a personality sample is spoken fresh when its recording is missing.

The stylesheets under [styles/](styles/) are the compiled CSS from the build, reformatted —
functionally identical to what shipped, but not the original authored source.

[styles/board.css](styles/board.css) and [styles/howto.css](styles/howto.css) are included
and unused so far: the first styles the board canvas, the second the how-to page.
