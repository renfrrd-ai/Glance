import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  annotations,
  boardTitle,
  focusOf,
  narrationByBlock,
  project,
  questionsOf,
  type BoardEvent,
} from "@/lib/board/events";
import { boundsOf, fitTo, lerpCamera, panBy, zoomAt } from "@/lib/board/camera";
import { routeAround, routeBetween, RULE_OFFSET } from "@/lib/board/routing";
import { toEvents } from "@/lib/board/written";

/* ---- the event model --------------------------------------------------- */

test("project folds events into sections in the order they were opened", () => {
  const sections = project([
    { t: "section_open", id: "s2", title: "Second" },
    { t: "section_open", id: "s1", title: "First" },
    { t: "block_add", sectionId: "s1", block: { id: "b1", kind: "text", x: 0, y: 0, w: 400 } },
  ]);

  assert.deepEqual(
    sections.map((one) => one.id),
    ["s2", "s1"],
  );
  assert.equal(sections[1].blocks.length, 1);
});

test("re-opening a section carries on with it rather than starting again", () => {
  const sections = project([
    { t: "section_open", id: "s1", title: "First" },
    { t: "block_add", sectionId: "s1", block: { id: "b1", kind: "text", x: 0, y: 0, w: 400 } },
    { t: "section_open", id: "s1", title: "Renamed" },
    { t: "block_add", sectionId: "s1", block: { id: "b2", kind: "text", x: 0, y: 0, w: 400 } },
  ]);

  assert.equal(sections.length, 1);
  assert.equal(sections[0].title, "First");
  assert.equal(sections[0].blocks.length, 2);
});

test("a block is never added twice, and block_update merges props", () => {
  const block = { id: "b1", kind: "text", x: 0, y: 0, w: 400, props: { title: "One" } };
  const sections = project([
    { t: "section_open", id: "s1", title: "S" },
    { t: "block_add", sectionId: "s1", block },
    { t: "block_add", sectionId: "s1", block },
    { t: "block_update", blockId: "b1", props: { body: "Two" } },
  ]);

  assert.equal(sections[0].blocks.length, 1);
  assert.deepEqual(sections[0].blocks[0].props, { title: "One", body: "Two" });
});

test("buildsOn only keeps sections that already exist", () => {
  const sections = project([
    { t: "section_open", id: "s1", title: "First" },
    { t: "section_open", id: "s2", title: "Second", buildsOn: [{ id: "s1" }, { id: "nope" }] },
    { t: "section_open", id: "s3", title: "Third", buildsOn: [{ id: "s3" }] },
  ]);

  assert.deepEqual(sections[1].buildsOn, [{ id: "s1" }]);
  /* A section cannot build on itself. */
  assert.equal(sections[2].buildsOn, undefined);
});

test("narration said before a block belongs to that block", () => {
  const said = narrationByBlock([
    { t: "narrate", text: "Here comes the first one." },
    { t: "block_add", sectionId: "s1", block: { id: "b1", kind: "text", x: 0, y: 0, w: 400 } },
    { t: "narrate", text: "And this is about it." },
    { t: "narrate", text: "Now the next." },
    { t: "block_add", sectionId: "s1", block: { id: "b2", kind: "text", x: 0, y: 0, w: 400 } },
  ]);

  assert.equal(said.get("b1"), "Here comes the first one.");
  /* Once a block has its line, everything after it is held for the next one
   * and joined — chalk keeps talking while its hand moves. */
  assert.equal(said.get("b2"), "And this is about it. Now the next.");
});

test("a line with nothing waiting lands on the block just drawn", () => {
  const said = narrationByBlock([
    { t: "block_add", sectionId: "s1", block: { id: "b1", kind: "text", x: 0, y: 0, w: 400 } },
    { t: "narrate", text: "That one, there." },
  ]);

  assert.equal(said.get("b1"), "That one, there.");
});

test("narration that names its block wins over the guess", () => {
  const said = narrationByBlock([
    { t: "narrate", text: "Guessed." },
    { t: "block_add", sectionId: "s1", block: { id: "b1", kind: "text", x: 0, y: 0, w: 400 } },
    { t: "narrate", text: "Named.", blockId: "b1" },
  ]);

  assert.equal(said.get("b1"), "Named.");
});

test("erasing removes ink and notes, and blur clears the focus", () => {
  const events: BoardEvent[] = [
    { t: "ink", id: "i1", points: [{ x: 0, y: 0 }] },
    { t: "ink", id: "i2", points: [{ x: 1, y: 1 }] },
    { t: "note", id: "n1", x: 0, y: 0, body: "hi" },
    { t: "erase", id: "i1" },
    { t: "focus", id: "f1", blockIds: ["b1"] },
    { t: "blur" },
  ];

  const marks = annotations(events);
  assert.deepEqual(
    marks.ink.map((one) => one.id),
    ["i2"],
  );
  assert.equal(marks.notes.length, 1);
  assert.equal(focusOf(events), null);
});

test("the board's title is the last one it was given", () => {
  assert.equal(
    boardTitle([
      { t: "title", text: "First" },
      { t: "title", text: "  " },
      { t: "title", text: "Second" },
    ]),
    "Second",
  );
  assert.equal(boardTitle([]), null);
});

test("a question answered in a section that no longer exists loses the link", () => {
  const asked = questionsOf([
    { t: "section_open", id: "s1", title: "S" },
    { t: "asked", id: "q1", at: 1, question: "why?", drawnIn: "s1" },
    { t: "asked", id: "q2", at: 2, question: "how?", drawnIn: "gone" },
    { t: "asked", id: "q1", at: 3, question: "duplicate" },
  ]);

  assert.equal(asked.length, 2);
  assert.equal(asked[0].answeredIn, "s1");
  assert.equal(asked[1].answeredIn, undefined);
});

/* ---- the camera -------------------------------------------------------- */

test("zooming about a point keeps what is under it under it", () => {
  const at = { x: 300, y: 200 };
  const before = { x: 0, y: 0, z: 1 };
  const worldUnder = { x: at.x / before.z + before.x, y: at.y / before.z + before.y };

  const after = zoomAt(before, at, 2);
  const stillUnder = { x: at.x / after.z + after.x, y: at.y / after.z + after.y };

  assert.ok(Math.abs(stillUnder.x - worldUnder.x) < 1e-9);
  assert.ok(Math.abs(stillUnder.y - worldUnder.y) < 1e-9);
});

test("zoom is clamped, and a clamped zoom returns the same camera", () => {
  assert.equal(zoomAt({ x: 0, y: 0, z: 8 }, { x: 0, y: 0 }, 4).z, 8);
  assert.equal(zoomAt({ x: 0, y: 0, z: 0.05 }, { x: 0, y: 0 }, 0.1).z, 0.05);
});

test("panning moves the camera against the drag, scaled by the zoom", () => {
  assert.deepEqual(panBy({ x: 100, y: 100, z: 2 }, 20, 10), { x: 90, y: 95, z: 2 });
});

test("fitTo centres the rect in the viewport", () => {
  const rect = { x: 0, y: 0, w: 400, h: 200 };
  const viewport = { w: 1000, h: 800 };
  const camera = fitTo(rect, viewport, 50);

  const centreOnScreen = {
    x: (rect.x + rect.w / 2 - camera.x) * camera.z,
    y: (rect.y + rect.h / 2 - camera.y) * camera.z,
  };

  assert.ok(Math.abs(centreOnScreen.x - viewport.w / 2) < 1e-9);
  assert.ok(Math.abs(centreOnScreen.y - viewport.h / 2) < 1e-9);
});

test("fitTo survives a rect with no size", () => {
  const camera = fitTo({ x: 10, y: 10, w: 0, h: 0 }, { w: 800, h: 600 });
  assert.ok(Number.isFinite(camera.x) && Number.isFinite(camera.y) && camera.z > 0);
});

test("a flight ends where it was aimed, and holds the viewport centre throughout", () => {
  const from = { x: 0, y: 0, z: 1 };
  const to = { x: 900, y: 400, z: 0.4 };
  const viewport = { w: 1000, h: 800 };

  assert.deepEqual(lerpCamera(from, to, 1, viewport), to);
  assert.deepEqual(lerpCamera(from, to, 0, viewport), from);

  /* Half way: the centre should be between the two centres, not outside them. */
  const half = lerpCamera(from, to, 0.5, viewport);
  const centre = (camera: typeof from) => camera.x + viewport.w / 2 / camera.z;
  const [low, high] = [centre(from), centre(to)].sort((a, b) => a - b);
  assert.ok(centre(half) >= low - 1e-6 && centre(half) <= high + 1e-6);
});

test("boundsOf covers every rect", () => {
  assert.deepEqual(
    boundsOf([
      { x: 10, y: 20, w: 100, h: 50 },
      { x: -5, y: 0, w: 20, h: 10 },
    ]),
    { x: -5, y: 0, w: 115, h: 70 },
  );
  assert.deepEqual(boundsOf([]), { x: 0, y: 0, w: 0, h: 0 });
});

/* ---- connector routing ------------------------------------------------- */

const left = { x: 0, y: 0, w: 200, h: 100 };
const right = { x: 400, y: 0, w: 200, h: 100 };

test("a sideways route leaves and arrives on the rule line", () => {
  const route = routeBetween(left, right);
  assert.equal(route[0].y, RULE_OFFSET);
  assert.equal(route[route.length - 1].y, RULE_OFFSET);
  assert.equal(route[0].x, left.x + left.w);
  assert.equal(route[route.length - 1].x, right.x);
});

test("an unobstructed route is left alone", () => {
  assert.deepEqual(routeAround(left, right, []), routeBetween(left, right));
});

/** Whether a route passes through a rect, with the same slack as the router. */
const hits = (route: { x: number; y: number }[], rect: typeof left) => {
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    if (
      Math.max(a.x, b.x) > rect.x + 3 &&
      Math.min(a.x, b.x) < rect.x + rect.w - 3 &&
      Math.max(a.y, b.y) > rect.y + 3 &&
      Math.min(a.y, b.y) < rect.y + rect.h - 3
    )
      return true;
  }
  return false;
};

test("a block in the way is routed around", () => {
  const between = { x: 250, y: -20, w: 100, h: 140 };
  const direct = routeBetween(left, right);
  assert.ok(hits(direct, between), "the direct route should cross it");

  const around = routeAround(left, right, [between]);
  assert.ok(!hits(around, between), "the chosen route should not");
});

test("when every detour is blocked, the direct route is still returned", () => {
  /* Walled in on every side: there is nowhere to go, and a crossing line
   * beats no line at all. */
  const wall = [
    { x: 250, y: -400, w: 100, h: 1200 },
    { x: -400, y: -400, w: 1400, h: 60 },
    { x: -400, y: 160, w: 1400, h: 60 },
  ];
  assert.deepEqual(routeAround(left, right, wall), routeBetween(left, right));
});

/* ---- what chalk writes, turned into a board ---------------------------- */

const drawn = {
  title: "A board",
  sections: [
    {
      id: "s1",
      title: "First",
      buildsOn: "",
      buildsOnLabel: "",
      blocks: [
        { id: "b1", kind: "text" as const, title: "One", body: "Body one.", items: [], say: "Said one.", column: 0 },
        { id: "b2", kind: "steps" as const, title: "Two", body: "", items: ["a", "b"], say: "Said two.", column: 1 },
      ],
      connections: [{ from: "b1", to: "b2", label: "so" }],
    },
    {
      id: "s2",
      title: "Second",
      buildsOn: "s1",
      buildsOnLabel: "then",
      blocks: [
        { id: "b3", kind: "formula" as const, title: "Three", body: "a² + b²", items: [], say: "", column: 0 },
      ],
      connections: [
        { from: "b3", to: "ghost", label: "" },
        { from: "b3", to: "b3", label: "" },
      ],
    },
  ],
};

test("a written board becomes events in the order it was drawn", () => {
  const events = toEvents(drawn);
  assert.equal(events[0].t, "title");

  /* Said before drawn, which is what narrationByBlock reads. */
  const kinds = events.slice(1, 5).map((one) => one.t);
  assert.deepEqual(kinds, ["section_open", "narrate", "block_add", "narrate"]);

  const said = narrationByBlock(events);
  assert.equal(said.get("b1"), "Said one.");
  assert.equal(said.get("b2"), "Said two.");
  /* b3 says nothing, so it is not a stop on the walkthrough. */
  assert.equal(said.get("b3"), undefined);
});

test("a written board projects into the sections and blocks it described", () => {
  const sections = project(toEvents(drawn));

  assert.deepEqual(
    sections.map((one) => one.title),
    ["First", "Second"],
  );
  assert.deepEqual(sections[1].buildsOn, [{ id: "s1", label: "then" }]);

  /* The second column is placed to the right and narrower. */
  const [first, second] = sections[0].blocks;
  assert.ok(second.x > first.x);
  assert.ok(second.w < first.w);

  /* Each column stacks from its own top. */
  assert.equal(first.y, 0);
  assert.equal(second.y, 0);

  assert.deepEqual(sections[0].blocks[1].props?.items, ["a", "b"]);
  assert.equal(sections[1].blocks[0].props?.latex, "a² + b²");
});

test("connections to blocks that were never drawn are dropped", () => {
  const sections = project(toEvents(drawn));
  assert.equal(sections[0].connections.length, 1);
  /* Both the ghost and the self-link go. */
  assert.equal(sections[1].connections.length, 0);
});

test("a repeated block id is only drawn once", () => {
  const twice = {
    ...drawn,
    sections: [
      {
        ...drawn.sections[0],
        blocks: [...drawn.sections[0].blocks, { ...drawn.sections[0].blocks[0] }],
      },
      drawn.sections[1],
    ],
  };

  assert.equal(project(toEvents(twice))[0].blocks.length, 2);
});
