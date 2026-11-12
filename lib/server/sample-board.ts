/*
 * A board to look at while the thing that writes boards is being built.
 *
 * This is what chalk's output looks like as events: it opens a section, says
 * what it is about to draw, draws it, connects what it drew, and moves on. The
 * walkthrough in components/board/board-view.tsx is driven entirely by the
 * `narrate` lines below — nothing else marks a stop.
 */

import type { BoardEvent } from "@/lib/board/events";

export function sampleBoard(topic = "How a transformer reads a sentence"): BoardEvent[] {
  return [
    { t: "title", text: topic },

    /* ---- what the problem is ------------------------------------------- */
    { t: "section_open", id: "s1", title: "The problem with reading in order" },

    { t: "narrate", text: "Start with why reading a sentence left to right isn't enough." },
    {
      t: "block_add",
      sectionId: "s1",
      block: {
        id: "b1",
        kind: "text",
        x: 40,
        y: 0,
        w: 400,
        props: {
          title: "Order isn't meaning",
          body: "“The trophy didn't fit in the suitcase because it was too big.” What does “it” point at? Nothing about word order answers that — you have to weigh every other word in the sentence against it.",
        },
      },
    },

    { t: "narrate", text: "A model that reads strictly in order has to carry everything in one state." },
    {
      t: "block_add",
      sectionId: "s1",
      block: {
        id: "b2",
        kind: "warning",
        x: 40,
        y: 200,
        w: 400,
        props: {
          title: "One state, carried forward",
          body: "Read one word at a time and everything you have understood so far has to fit in a single running summary. The further back a word is, the more of it has been squeezed out.",
        },
      },
    },

    { t: "connect", sectionId: "s1", connection: { from: "b1", to: "b2", label: "so" } },

    /* ---- the idea ------------------------------------------------------- */
    {
      t: "section_open",
      id: "s2",
      title: "Attention: look at everything, weigh what matters",
      buildsOn: [{ id: "s1", label: "instead" }],
    },

    { t: "narrate", text: "Attention drops the ordering problem: every word gets to look at every other word at once." },
    {
      t: "block_add",
      sectionId: "s2",
      block: {
        id: "b3",
        kind: "term",
        x: 40,
        y: 0,
        w: 420,
        props: {
          title: "Attention",
          term: "Each word asks every other word a question",
          body: "For every word, the model works out how much each other word matters to it, and builds that word's new meaning as a weighted blend of all of them.",
        },
      },
    },

    { t: "narrate", text: "Three vectors do the work: a query, a key and a value." },
    {
      t: "block_add",
      sectionId: "s2",
      block: {
        id: "b4",
        kind: "steps",
        x: 40,
        y: 190,
        w: 420,
        props: {
          title: "How one word is updated",
          steps: [
            "Each word produces a query (what am I looking for?), a key (what do I offer?) and a value (what do I contribute?).",
            "Compare this word's query against every key: that score is how much attention it pays.",
            "Soften the scores into weights that add to one.",
            "Blend the values by those weights. That blend is the word's new meaning.",
          ],
        },
      },
    },

    { t: "narrate", text: "Written out, the whole thing is one line of maths." },
    {
      t: "block_add",
      sectionId: "s2",
      block: {
        id: "b5",
        kind: "formula",
        x: 500,
        y: 0,
        w: 360,
        props: {
          title: "All of it at once",
          latex: "Attention(Q, K, V) = softmax( QKᵀ / √d ) V",
          note: "The √d only keeps the scores from growing with the size of the vectors — without it, softmax saturates and the weights go all-or-nothing.",
        },
      },
    },

    { t: "connect", sectionId: "s2", connection: { from: "b3", to: "b4", label: "in steps" } },
    { t: "connect", sectionId: "s2", connection: { from: "b4", to: "b5", label: "as maths" } },

    /* ---- what it buys you ----------------------------------------------- */
    {
      t: "section_open",
      id: "s3",
      title: "Why this turned out to matter",
      buildsOn: [{ id: "s2" }],
    },

    { t: "narrate", text: "Two things fall out of it, and the second one is why transformers won." },
    {
      t: "block_add",
      sectionId: "s3",
      block: {
        id: "b6",
        kind: "insight",
        x: 40,
        y: 0,
        w: 420,
        props: {
          title: "Distance stops mattering",
          body: "A word ten back and a word two back are the same distance away: one comparison. Nothing has to survive being carried forward.",
        },
      },
    },

    {
      t: "block_add",
      sectionId: "s3",
      block: {
        id: "b7",
        kind: "insight",
        x: 40,
        y: 180,
        w: 420,
        props: {
          title: "Every word at once, not one at a time",
          body: "Reading in order is a chain — each step waits for the one before it. Attention is one big multiplication, which a GPU does in parallel. That is what made training on the whole internet practical.",
        },
      },
    },

    { t: "narrate", text: "And the catch, which is the whole reason context windows have a size." },
    {
      t: "block_add",
      sectionId: "s3",
      block: {
        id: "b8",
        kind: "warning",
        x: 500,
        y: 90,
        w: 360,
        props: {
          title: "It costs the square",
          body: "Every word compares against every word, so doubling the length quadruples the work. Everything clever about long context is an answer to this one line.",
        },
      },
    },

    { t: "connect", sectionId: "s3", connection: { from: "b6", to: "b7" } },
    { t: "connect", sectionId: "s3", connection: { from: "b7", to: "b8", label: "but" } },
  ];
}
