# glance

The chalk control center, as source.

This is a Next.js app rebuilt from a production capture of `www.trychalk.tech/control` —
the signed-in shell that holds the whole product: a rail on the left, each app area in
an iframe beside it, and the settings panes that live in the shell itself.

```
npm install
npm run dev     # http://localhost:3000/control
npm run build
npm run test       # the board model, camera, routing and board writing
npm run typecheck
```

To have chalk write boards itself rather than hand back a stand-in, set a key:

```
export ANTHROPIC_API_KEY=sk-ant-...
```

## What's here

| Path | What it is |
| --- | --- |
| [app/control/page.tsx](app/control/page.tsx) | The shell: the control center |
| [components/control/control-center.tsx](components/control/control-center.tsx) | The rail, hash routing, framed apps, keyboard, full screen |
| [components/control/panes/](components/control/panes/) | The ten settings panes |
| [components/control/primitives.tsx](components/control/primitives.tsx) | Section / Card / Row / Field / Switch / Seg / Tag / Btn |
| [components/board/](components/board/) | The board: surface, camera, connectors, cursor, walkthrough, pen |
| [lib/board/](lib/board/) | The board's event model, camera maths, stroke outlining, edge routing |
| [lib/server/write-board.ts](lib/server/write-board.ts) | Asking Claude for a board; [written.ts](lib/board/written.ts) turns the answer into events |
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

### How a board works

A board is **an append-only list of events**, not a document: open a section,
say a line, add a block, connect two blocks. `project()` in
[lib/board/events.ts](lib/board/events.ts) folds that into what to draw, and
every other view — the walkthrough's stops, the pen marks, what chalk is looking
at — is another fold over the same list. That is why replaying a board, resuming
one and drawing on one are all the same operation: append, and project again.

- **The camera lives outside React.** Panning writes a transform straight onto
  the world element each frame ([components/board/surface.tsx](components/board/surface.tsx));
  re-rendering a board of any size on every pointer move drops frames. React owns
  what is on the board, the camera owns where it is seen from.
- **Heights are measured, not declared.** chalk places a block before it knows
  how tall it will be, so blocks are laid out at a guess, measured, and stacked.
  A block's declared `h` is a floor only — feeding a *measured* height back in as
  a minimum is a ratchet, and a block that renders short can then never shrink.
- **Edges go round things.** [lib/board/routing.ts](lib/board/routing.ts) draws
  the obvious line, checks it against every other block, and tries a handful of
  detours before giving up. Edges arrive on a block's rule line — 28px below its
  top — which is why a block's heading underline has to sit exactly there.
- **Lines are outlines, not strokes.** Every mark is a filled outline from
  perfect-freehand with a seeded wobble, so it tapers like a real stroke and
  wobbles the same way on every render.

### Writing a board

[lib/server/write-board.ts](lib/server/write-board.ts) asks Claude Opus 5.5 for a board as
**structured output**, so what comes back is already close to the board's event shape rather
than prose to parse. Notes on the call:

- The shape asked for is **flatter than the events** — a list of sections, each holding
  blocks. The events are a union, and asking a model to choose a variant per item invites
  near-misses; [lib/board/written.ts](lib/board/written.ts) does the conversion and owns the
  ordering rules (narrate before draw, connections only between blocks that exist).
- **Refusal fallbacks are on** (`fallbacks: "default"`): a declined request re-runs on another
  model inside the same call instead of just stopping.
- `max_tokens` is checked as well as `refusal` — a board truncated mid-section would render
  as a half-finished thought, so it is reported rather than saved.
- The **profile travels with the ask**, because it lives on the client (the Mac app's store,
  or this browser). It only steers how the board is written, so a missing one costs nothing.

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
cursor, the how-to player, the Spatial setup wizard, and the board engine — camera,
surface, connectors, walkthrough, pen and notes, and the board's event model.

Built here, not recovered, because the capture did not contain it:

- **What a block looks like** ([components/board/block.tsx](components/board/block.tsx),
  [styles/board-theme.css](styles/board-theme.css)). The production bundle for `/control`
  never loaded the block renderers, so this is a fresh design against the constraints the
  recovered CSS imposes — chiefly the 28px rule line.
- **Home, Boards and New** — real pages over the board store, in the app's light theme
  ([components/app/](components/app/)).

Standing in, and marked as such where it shows:

- **`app/api/*`** — thin handlers over an in-memory development store
  ([lib/server/store.ts](lib/server/store.ts), [lib/server/boards.ts](lib/server/boards.ts)).
  Boards, memory, reports, the setup wizard and plan previewing really work; billing,
  speech, transcription, profile import and MCP answer `501` rather than pretend. The store
  lives in memory, so it resets when the server does.
- **Writing a board without a key.** With `ANTHROPIC_API_KEY` set, Home → `/api/boards` →
  Claude → a real board. Without one, the route hands back [a stand-in](lib/server/sample-board.ts)
  and the board says so on itself, rather than passing it off.
- **The other framed areas** (`/recordings`, `/learn/pages`, `/learn/materials`, `/teach`,
  `/agents`) are still placeholder pages. They have to answer with something, or the rail
  frames a broken page instead of an obvious gap.
- **Assets referenced but not in the capture** — `/howto/index.json` and its films,
  `/voices/*.mp3`. Both degrade honestly: the gallery says the videos are on their way, and
  a personality sample is spoken fresh when its recording is missing.

The stylesheets under [styles/](styles/) are the compiled CSS from the build, reformatted —
functionally identical to what shipped, but not the original authored source.

[styles/howto.css](styles/howto.css) is in the tree but not used yet: it styles the
standalone how-to page, which has not been rebuilt.
