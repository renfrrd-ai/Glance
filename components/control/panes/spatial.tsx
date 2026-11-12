"use client";

/*
 * Spatial has three faces, because "Spatial" means three different things
 * depending on where you are:
 *
 *   in a browser          → what the Mac app is, and how to get it
 *   on a plan without it  → what it does, and what it costs to add
 *   in the app, with it   → the actual settings
 *
 * <SpatialPane> picks between them from the account, and each one is its own
 * component below.
 */

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { Bloom } from "@/components/art/bloom";
import { SectionTile } from "@/components/art/section-art";
import { HowtoGallery } from "@/components/howto/gallery";
import * as A from "@/lib/plans";
import { PERSONALITIES, helloSample, isPersonality } from "@/lib/personalities";
import { DEFAULT_SPATIAL, shell, usePref } from "@/lib/prefs";

import { Pane } from "../pane";
import { onAMac, openInApp } from "../shell-extras";
import { Btn, Card, Check, Kbds, Row, Section, Seg, Switch } from "../primitives";

/* What the Mac app adds to `shell()` for Spatial. */
type SpatialShell = {
  personality?: () => Promise<unknown>;
  setPersonality?: (id: string) => void;
  onPersonality?: (listener: (id: unknown) => void) => () => void;
  quiet?: () => Promise<unknown>;
  setQuiet?: (quiet: boolean) => void;
  onQuiet?: (listener: (quiet: boolean) => void) => () => void;
  visible?: () => Promise<{ visible: boolean; forced: boolean } | null>;
  setVisible?: (visible: boolean) => void;
  openURL?: (url: string) => void;
};

type AccountState = {
  plan: string;
  previewing?: boolean;
  account?: {
    app?: { has?: boolean; opens?: number } | null;
    billing?: boolean;
    onSale?: string[];
    source?: string;
    student?: unknown;
  } | null;
} | null;

const NOTCH: Record<string, string> = {
  frosted:
    "Frosted glass: what's behind shows through softly, and the words stay easy to read.",
  liquid: "Liquid Glass: lighter and clearer, so more of what's behind shows through.",
  black: "Black, like the notch itself growing.",
};

const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
    body: JSON.stringify(body ?? {}),
  })
    .then(async (response) => ({ ok: response.ok, data: await response.json().catch(() => ({})) }))
    .catch(() => ({ ok: false, data: { message: "chalk couldn't be reached." } as Record<string, unknown> }));

/* ---- speed ------------------------------------------------------------- */

const STAGES = [
  { key: "hear", label: "Hearing you", color: "#7C83E8" },
  { key: "screen", label: "Reading the screen", color: "#E8A23B" },
  { key: "think", label: "Thinking", color: "#E8613B" },
  { key: "voice", label: "Starting to speak", color: "#3FBE6E" },
] as const;

type Timing = {
  at: string | number;
  question?: string;
  /** Where the answer ended: at a word, or at a timeout. */
  end: "word" | "timeout" | string;
  /** A canned line, answered without a round trip. */
  instant?: boolean;
  ms: Record<string, number | undefined> & { total?: number };
};

const secs = (ms: number | undefined) => (typeof ms === "number" ? `${(ms / 1000).toFixed(1)}s` : "—");

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

function Speed() {
  const [rows, setRows] = useState<Timing[] | null>(null);

  useEffect(() => {
    const load = () =>
      void fetch("/api/timings?n=20", { headers: { "x-chalk-app": "1" } })
        .then((response) => response.json())
        .then((data) => setRows(data.rows))
        .catch(() => setRows([]));

    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  /* Only the answers that actually reached a word are comparable. */
  const spoken = (rows ?? []).filter(
    (row) => row.end === "word" && typeof row.ms.total === "number",
  );
  const typical = median(spoken.map((row) => row.ms.total as number));
  const widest = Math.max(4000, ...spoken.map((row) => row.ms.total ?? 0));

  return (
    <Section
      title="Speed"
      meta={typical !== null ? `typically ${secs(typical)} to the first word` : undefined}
      desc="From letting go of ⌘⌥ to chalk's first word, for your last questions — and where the time went."
    >
      <Card>
        {rows && !rows.length ? (
          <Row
            title="No questions timed yet"
            help="Hold ⌘⌥ and ask chalk something; each one shows up here."
          />
        ) : null}

        {rows?.length ? (
          <Row
            title={
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12 }}>
                {STAGES.map((stage) => {
                  const at = median(
                    spoken
                      .map((row) => row.ms[stage.key])
                      .filter((ms): ms is number => typeof ms === "number"),
                  );
                  return (
                    <span key={stage.key}>
                      <i
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: stage.color,
                          marginRight: 6,
                        }}
                      />
                      {stage.label} {secs(at ?? undefined)}
                    </span>
                  );
                })}
              </div>
            }
          />
        ) : null}

        {rows?.map((row) => (
          <Row
            key={String(row.at)}
            compact
            title={row.question || "(no words)"}
            help={
              <div
                style={{
                  display: "flex",
                  height: 8,
                  borderRadius: 4,
                  overflow: "hidden",
                  marginTop: 6,
                  width: `${Math.min(100, ((row.ms.total ?? 0) / widest) * 100)}%`,
                  minWidth: 24,
                }}
              >
                {STAGES.map((stage) =>
                  row.ms[stage.key] ? (
                    <i
                      key={stage.key}
                      title={`${stage.label} ${secs(row.ms[stage.key])}`}
                      style={{ flex: `${row.ms[stage.key]} 0 0`, background: stage.color }}
                    />
                  ) : null,
                )}
              </div>
            }
            side={
              <>
                {row.instant ? <span className="cc-row-help">Instant line</span> : null}
                {row.end === "timeout" ? (
                  <span className="cc-row-help">Timed out</span>
                ) : (
                  <span className="cc-row-help">{secs(row.ms.total)}</span>
                )}
              </>
            }
          />
        ))}
      </Card>
    </Section>
  );
}

/* ---- adding Spatial to a plan ----------------------------------------- */

function AddSpatial({ account }: { account: NonNullable<AccountState> }) {
  const [every, setEvery] = useState<"month" | "year">("year");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const naira = A.isPlan(account.plan) && A.isNaira(account.plan);
  const id = naira ? "ng_spatial" : "board_spatial";
  const plan = A.PLANS[id];
  const student = !naira && !!account.account?.student;

  const price = (period: "month" | "year") =>
    (student ? A.studentPrice("board_spatial", period) : null) ??
    (period === "month" ? (plan.price?.month as number) : (plan.price?.year as number));

  const buyable = !!(
    account.account?.billing &&
    account.account.onSale?.includes(id) &&
    account.account.source !== "admin"
  );

  const buy = async () => {
    setBusy(true);
    setSaid(null);
    const result = await post("/api/billing/checkout", {
      plan: id,
      interval: naira ? "month" : every,
    });
    setBusy(false);

    if (!result.ok) {
      setSaid(String(result.data.message ?? "That didn't work."));
      return;
    }
    if (typeof result.data.url === "string") {
      setSaid("Checkout is open — finish there, and Spatial switches on here.");
      const host = shell() as (SpatialShell & object) | null;
      if (host?.openURL) host.openURL(result.data.url);
      else window.location.href = result.data.url;
      return;
    }
    setSaid(
      result.data.pending
        ? String(result.data.message)
        : `Switched to ${plan.name}. It may take a moment to show.`,
    );
  };

  const seePlans = () => {
    window.location.hash = "plan";
  };

  return (
    <Section
      title={`Add Spatial: ${plan.name}`}
      desc={
        naira
          ? "Paid in naira, every month."
          : student
            ? "Your student price, plus tax."
            : `${A.STUDENT_LINE}. Prices plus tax.`
      }
    >
      <Card pad>
        {naira ? null : (
          <Seg
            value={every}
            onChange={setEvery}
            options={[
              { value: "year", label: `$${Math.round(price("year") / 12)}/month, billed yearly` },
              { value: "month", label: `$${price("month")}/month` },
            ]}
          />
        )}

        <div style={{ display: "flex", gap: 10, marginTop: naira ? 0 : 14, flexWrap: "wrap" }}>
          {buyable ? (
            <Btn variant="primary" disabled={busy} onClick={() => void buy()}>
              {naira
                ? `Switch to ${plan.name} · ${A.naira(plan.naira as number)}/month`
                : `Switch to ${plan.name} · $${price(every)}/${every === "year" ? "year" : "month"}`}
            </Btn>
          ) : (
            <Btn variant="primary" onClick={seePlans}>
              See plans
            </Btn>
          )}
          {buyable ? (
            <Btn variant="ghost" onClick={seePlans}>
              Compare plans
            </Btn>
          ) : null}
        </div>

        {said ? (
          <p className="cc-note" role="status" style={{ margin: "10px 0 0" }}>
            {said}
          </p>
        ) : null}
      </Card>
    </Section>
  );
}

/* ---- in a browser: get the app ---------------------------------------- */

const WHY = [
  {
    tile: "cursor",
    bg: "#22344E",
    title: "It points at the real thing",
    line: "Ask how to do something, and chalk finds the real button by its name and rings it — in any app.",
  },
  {
    tile: "spatial",
    bg: "#B6DFE6",
    dark: true,
    title: "It walks you through it",
    line: "Step by step, scrolling to the next step itself. It offers to press things; nothing happens until you say yes.",
  },
  {
    tile: "pen",
    bg: "#148F48",
    title: "Circle it and say “this”",
    line: "Or ask about a whole PDF, Word file or web page. chalk reads every page, and yours doesn’t move.",
  },
  {
    tile: "board",
    bg: "#F8A81B",
    dark: true,
    title: "It works it out on your screen",
    line: "Maths, physics and chemistry: the figure and the working, drawn beside your question — and your answers checked.",
  },
  {
    tile: "voice",
    bg: "#F6F0E2",
    dark: true,
    title: "It answers out loud",
    line: "Hold ⌘⌥ and ask the way you’d ask someone sitting beside you. Let go, and chalk looks.",
  },
  {
    tile: "privacy",
    bg: "#46B4A6",
    dark: true,
    title: "Invisible when you share",
    line: "chalk never shows up in screenshots, recordings or a call, so what it shows you stays yours.",
  },
];

/* macOS makes an unsigned first launch awkward, so the steps are spelled out. */
const FIRST_RUN = [
  {
    title: "Drag chalk into Applications",
    line: "Open chalk.dmg from your Downloads, then drag chalk onto the Applications folder.",
  },
  {
    title: "Open it — and press Done",
    line: "Double-click chalk in Applications. macOS says it couldn’t check it: that’s expected for now. Press Done.",
  },
  {
    title: "Open Anyway, in System Settings",
    line: "Open System Settings › Privacy & Security, scroll down to Security, press Open Anyway beside chalk, and enter your Mac’s password.",
  },
  {
    title: "chalk takes it from there",
    line: "It shows you, on your screen, which switches to turn on — then asks your first question with you.",
  },
];

function GetTheApp({ account }: { account: AccountState }) {
  const app = account?.account?.app ?? null;
  const mac = onAMac();
  const hasSpatial =
    !account || !A.isPlan(account.plan) || A.notInPlan(account.plan, "questions") === null;
  const installed = !!app?.has;

  return (
    <Pane
      title="chalk for Mac"
      lede="Spatial lives in the Mac app. Hold ⌘⌥, ask about anything on your screen, and chalk answers out loud and points at the real thing — in any app."
    >
      <div className="cc-getmac">
        <div className="cc-getmac-text">
          <span className="cc-getmac-eyebrow">Spatial</span>
          <h2>{installed ? "It’s on your Mac" : "Your screen, explained right where it is"}</h2>
          <p>
            {installed
              ? "Open chalk and hold ⌘⌥ to ask about whatever is in front of you. Everything you make here is there too."
              : "No more screenshots pasted into a chat. Hold two keys, ask, and chalk shows you on your own screen."}
          </p>
          <div className="cc-getmac-row">
            {installed && app?.opens && mac ? (
              <button type="button" className="cc-getmac-btn" onClick={() => openInApp("spatial")}>
                Open chalk
              </button>
            ) : (
              <a className="cc-getmac-btn" href="/api/download/mac">
                {installed ? "Download it again" : "Download now"}
              </a>
            )}
            <span className="cc-getmac-meta">
              {mac
                ? "macOS 14 or later · Apple silicon"
                : "For Macs with Apple silicon — open this page on your Mac to download it."}
            </span>
          </div>
        </div>
        <SectionTile id="spatial" size={132} />
      </div>

      <Section title="See it" desc="Forty seconds of Spatial on a real screen.">
        <HowtoGallery slugs={["spatial"]} only="mac" />
      </Section>

      <Section title="Why get the app" desc="What a browser tab can’t do.">
        <div className="cc-why">
          {WHY.map((card) => (
            <div
              className="cc-why-card"
              data-dark={card.dark || undefined}
              style={{ background: card.bg }}
              key={card.title}
            >
              <SectionTile id={card.tile} size={56} />
              <b>{card.title}</b>
              <span>{card.line}</span>
            </div>
          ))}
        </div>
      </Section>

      {installed ? null : (
        <Section
          title="Opening it the first time"
          desc="macOS asks you to say it’s fine, once. It takes a minute."
        >
          <Card>
            {FIRST_RUN.map((step, i) => (
              <Row
                key={step.title}
                lead={<span className="cc-step-n">{i + 1}</span>}
                title={step.title}
                help={step.line}
              />
            ))}
          </Card>
        </Section>
      )}

      {hasSpatial || !account ? null : <AddSpatial account={account} />}
    </Pane>
  );
}

/* ---- on a plan without Spatial ---------------------------------------- */

function SpatialNotIncluded({ account }: { account: NonNullable<AccountState> }) {
  const plan =
    A.PLANS[A.isPlan(account.plan) && A.isNaira(account.plan) ? "ng_spatial" : "board_spatial"];
  /* "Everything in Board" is about the other plan, not about Spatial. */
  const does = plan.includes.filter((line) => !/^Everything in /.test(line));

  return (
    <Pane
      title="Spatial"
      lede={`Ask about anything on your screen — chalk answers out loud and points at the real thing. Spatial is in ${plan.name}${account.previewing ? " (you're previewing a plan without it)" : ""}.`}
    >
      <Section title="See it" desc="Forty seconds of Spatial on a real screen.">
        <HowtoGallery slugs={["spatial"]} only="mac" />
      </Section>

      <Section title="What Spatial does" desc="In chalk for Mac, in any app.">
        <Card>
          {does.map((line, i) => (
            <Row key={line} lead={<Bloom id={["warm", "coach", "calm"][i % 3]} size={34} />} title={line} />
          ))}
        </Card>
      </Section>

      <AddSpatial account={account} />
    </Pane>
  );
}

/* ---- the settings ------------------------------------------------------ */

function SpatialSettings() {
  const host = shell() as (ReturnType<typeof shell> & SpatialShell) | null;

  const [personality, setPersonality] = useState("warm");
  const [quiet, setQuiet] = useState(false);
  const [recordings, setRecordings] = useState({ visible: false, forced: false });
  const [spatial, saveSpatial] = usePref("spatial", DEFAULT_SPATIAL);
  const [playing, setPlaying] = useState<string | null>(null);

  const sound = useRef<HTMLAudioElement | null>(null);
  const samples = useRef<Record<string, HTMLAudioElement>>({});

  /* The hellos are tiny and the point is that they play instantly. */
  useEffect(() => {
    for (const id of Object.keys(PERSONALITIES)) {
      const src = helloSample(id);
      if (!src || samples.current[id]) continue;
      const audio = new Audio(src);
      audio.preload = "auto";
      samples.current[id] = audio;
    }
  }, []);

  useEffect(() => {
    if (!host) return;

    host.personality?.().then((id) => {
      if (isPersonality(id)) setPersonality(id);
    });
    host.quiet?.().then((on) => {
      if (typeof on === "boolean") setQuiet(on);
    });
    host.visible?.().then((state) => {
      if (state) setRecordings(state);
    });

    const stopPersonality = host.onPersonality?.((id) => {
      if (isPersonality(id)) setPersonality(id);
    });
    const stopQuiet = host.onQuiet?.((on) => setQuiet(on));

    return () => {
      stopPersonality?.();
      stopQuiet?.();
    };
  }, [host]);

  /* Every playback gets a ticket, so a sample that finishes after another has
   * started cannot clear the wrong row. */
  const ticket = useRef(0);
  useEffect(
    () => () => {
      ticket.current++;
      sound.current?.pause();
    },
    [],
  );

  const settings = { ...DEFAULT_SPATIAL, ...spatial };

  const hear = async (id: string) => {
    const mine = ++ticket.current;
    sound.current?.pause();

    if (playing === id) {
      setPlaying(null);
      return;
    }

    const one = PERSONALITIES[id];
    setPlaying(id);
    const done = () => {
      if (ticket.current === mine) setPlaying(null);
    };

    const sample = samples.current[id];
    if (sample) {
      sample.currentTime = 0;
      sound.current = sample;
      sample.onended = done;
      try {
        await sample.play();
        return;
      } catch {
        if (ticket.current !== mine) return;
        /* autoplay refused it — speak it instead */
      }
    }

    try {
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-chalk-app": "1" },
        body: JSON.stringify({
          text: one.hello,
          voice: one.voice,
          instructions: one.tone,
          filler: true,
        }),
      });
      if (!response.ok) {
        done();
        return;
      }
      const audio = await response.blob();
      if (ticket.current !== mine) return;
      const spoken = new Audio(URL.createObjectURL(audio));
      sound.current = spoken;
      spoken.onended = done;
      await spoken.play();
    } catch {
      done();
    }
  };

  return (
    <Pane
      title="Spatial"
      lede="chalk on your screen — hold ⌘⌥ anywhere and ask. Changes apply straight away."
      actions={
        <Btn
          size="sm"
          onClick={() => {
            void post("/api/spatial/setup", { again: true }).finally(() =>
              window.dispatchEvent(new Event("chalk:setup-open")),
            );
          }}
        >
          Set up again
        </Btn>
      }
    >
      <Section
        title="Personality"
        meta={PERSONALITIES[personality].name}
        desc="Changes the voice and the wording — never what chalk points at, or what it will do for you."
      >
        <Card>
          {Object.values(PERSONALITIES).map((one) => (
            <Row
              key={one.id}
              lead={<Bloom id={one.id} size={38} spin={playing === one.id} />}
              title={one.name}
              help={one.blurb}
              on={personality === one.id}
              onClick={() => {
                setPersonality(one.id);
                host?.setPersonality?.(one.id);
              }}
              side={
                <>
                  {/* Hearing one is not choosing it. */}
                  <span onClick={(event) => event.stopPropagation()}>
                    <Btn
                      variant="ghost"
                      size="sm"
                      icon={playing === one.id ? Pause : Play}
                      onClick={() => void hear(one.id)}
                    >
                      {playing === one.id ? "Stop" : "Hear"}
                    </Btn>
                  </span>
                  <Check on={personality === one.id} />
                </>
              }
            />
          ))}
        </Card>
      </Section>

      <Section title="The notch">
        <Card>
          <Row
            title="Panel"
            help={`${NOTCH[settings.notch]} Hover its bottom-left corner to minimize it, bottom-right to close.`}
            side={
              <Seg
                value={settings.notch}
                options={[
                  { value: "black", label: "Black" },
                  { value: "frosted", label: "Frosted" },
                  { value: "liquid", label: "Liquid Glass" },
                ]}
                onChange={(notch) => saveSpatial({ ...settings, notch })}
              />
            }
          />
        </Card>
      </Section>

      <Section title="While it helps">
        <Card>
          <Row
            title="Drawing"
            help={
              settings.drawLook === "hand"
                ? "When chalk draws to explain — a triangle, a graph, the working — it draws like a hand at a board."
                : "When chalk draws to explain — a triangle, a graph, the working — it draws clean, ruler-straight lines."
            }
            side={
              <Seg
                value={settings.drawLook}
                options={[
                  { value: "clean", label: "Clean" },
                  { value: "hand", label: "Hand-drawn" },
                ]}
                onChange={(drawLook) => saveSpatial({ ...settings, drawLook })}
              />
            }
          />

          <Row
            title="Show drawings"
            help="On the screen beside what it explains, or on a board of its own. You can switch in the notch while it draws."
            side={
              <Seg
                value={settings.boardMode}
                options={[
                  { value: "screen", label: "On screen" },
                  { value: "sheet", label: "Board" },
                ]}
                onChange={(boardMode) => saveSpatial({ ...settings, boardMode })}
              />
            }
          />

          <Row
            title="Explaining pace"
            help={
              settings.pace === "slower"
                ? "chalk talks a little slower, and answers stay up longer to read."
                : settings.pace === "faster"
                  ? "chalk talks a little faster, and answers put themselves away sooner."
                  : "How fast chalk talks, and how long an answer stays up. Also in the notch’s settings."
            }
            side={
              <Seg
                value={settings.pace}
                options={[
                  { value: "slower", label: "Slower" },
                  { value: "normal", label: "Normal" },
                  { value: "faster", label: "Faster" },
                ]}
                onChange={(pace) => saveSpatial({ ...settings, pace })}
              />
            }
          />

          <Row
            title="Speak answers"
            help={
              quiet
                ? "Quiet — answers appear in the notch only."
                : "chalk says its answers out loud. Or say “be quiet”."
            }
            side={
              <Switch
                on={!quiet}
                label="Speak answers"
                disabled={!host}
                onChange={(on) => {
                  setQuiet(!on);
                  host?.setQuiet?.(!on);
                }}
              />
            }
          />

          <Row
            title="Offer to do the step"
            help="After an answer, chalk can offer to type, press, copy or open the next thing. Nothing happens until you tap ⌘⌥ or click Do it."
            side={
              <Switch
                on={settings.offers}
                label="Offer to do the step"
                onChange={(offers) => saveSpatial({ ...settings, offers })}
              />
            }
          />

          <Row
            title="Watch me do each step"
            help="In a walkthrough, chalk watches the spot it pointed at and moves on once you've done it — no tap needed. A video or a scrolling window elsewhere doesn't count."
            side={
              <Switch
                on={settings.watch}
                label="Watch me do each step"
                onChange={(watch) => saveSpatial({ ...settings, watch })}
              />
            }
          />

          <Row
            title="Auto walk"
            help="When a walkthrough goes further down the page or document you're on, chalk scrolls there by itself and points at the next part. It only ever scrolls — anything that clicks, types or opens still waits for you."
            side={
              <Switch
                on={settings.autoWalk}
                label="Auto walk"
                onChange={(autoWalk) => saveSpatial({ ...settings, autoWalk })}
              />
            }
          />

          <Row
            title="Show in screen recordings"
            help={
              recordings.forced
                ? "On for this session."
                : "Off, so what chalk shows never ends up in what you record."
            }
            side={
              <Switch
                on={recordings.visible}
                label="Show in screen recordings"
                disabled={!host || recordings.forced}
                onChange={(visible) => {
                  setRecordings({ ...recordings, visible });
                  host?.setVisible?.(visible);
                }}
              />
            }
          />
        </Card>
      </Section>

      <Speed />

      <Section title="Shortcuts">
        <Card>
          <Row
            title="Ask"
            help="Hold, say what you need, let go."
            side={
              <>
                <Kbds keys={["⌘", "⌥"]} />
                <span className="cc-section-meta">hold</span>
              </>
            }
          />
          <Row
            title="Confirm"
            help="Paste what chalk staged, say you did a step, or accept an offer."
            side={
              <>
                <Kbds keys={["⌘", "⌥"]} />
                <span className="cc-section-meta">tap</span>
              </>
            }
          />
          <Row
            title="Circle something"
            help="Hold, then draw a loop around what you mean."
            side={
              <>
                <Kbds keys={["⌘", "⌥"]} />
                <span className="cc-section-meta">hold + draw</span>
              </>
            }
          />
        </Card>
      </Section>
    </Pane>
  );
}

export function SpatialPane() {
  /* undefined while the account is still unknown: rendering the wrong face for
   * a moment would be worse than rendering nothing. */
  const [account, setAccount] = useState<AccountState | undefined>(undefined);

  useEffect(() => {
    const load = () =>
      void fetch("/api/account", { headers: { "x-chalk-app": "1" } })
        .then((response) => (response.ok ? response.json() : null))
        .then(setAccount)
        .catch(() => setAccount(null));

    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  if (account === undefined) return null;
  if (!shell()) return <GetTheApp account={account} />;
  if (account && A.isPlan(account.plan) && A.notInPlan(account.plan, "questions") !== null)
    return <SpatialNotIncluded account={account} />;
  return <SpatialSettings />;
}
