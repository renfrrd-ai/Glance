/*
 * Everything the rail can show, in the order it shows it.
 *
 * An "app" section is a real page of the app, shown in an iframe inside the
 * control center. A "settings" section is a pane that lives here. Both kinds
 * share one id space, because the rail, the hash in the address bar and the
 * phone tab bar all address them the same way.
 *
 * `find` is what the settings search matches on — the words someone might type
 * looking for that pane, including the ones we do not use ourselves.
 */

export type AppSection = {
  id: string;
  label: string;
  /** The page to frame, or null for a section that has no page of its own. */
  path: string | null;
  find: string;
};

export const APPS: AppSection[] = [
  {
    id: "home",
    label: "Home",
    path: "/learn",
    find: "learn course class lesson start ask flashcards quiz",
  },
  { id: "boards", label: "Boards", path: "/boards", find: "board whiteboard draw explain" },
  {
    id: "pages",
    label: "Pages",
    path: "/learn/pages",
    find: "pages notes write writing type document doc essay grammar grammarly spelling rewrite",
  },
  {
    id: "agents",
    label: "Autopilot",
    path: "/agents",
    find: "autopilot agent task slides research report do more schedule",
  },
  {
    id: "recordings",
    label: "Recordings",
    path: "/recordings",
    find: "record class lecture transcript listen translate",
  },
  {
    id: "materials",
    label: "Materials",
    path: "/learn/materials",
    find: "materials files uploads pdf slides notes past papers canvas zip",
  },
  {
    id: "teach",
    label: "Teach",
    path: "/teach",
    find: "teacher lesson plan class students school canvas",
  },
  { id: "library", label: "Library", path: null, find: "boards courses pages history saved" },
];

export const APP_PATHS = new Map(
  APPS.flatMap((section) => (section.path ? [[section.id, section.path] as const] : [])),
);

export type SettingsGroup = {
  label: string;
  items: { id: string; label: string; find: string }[];
};

export const SETTINGS: SettingsGroup[] = [
  {
    label: "Settings",
    items: [
      {
        id: "you",
        label: "You",
        find: "name profile about age role teach teacher educator lecturer import chatgpt claude export",
      },
      {
        id: "memory",
        label: "What chalk knows",
        find: "memory memories remember context words vocabulary hears history forget",
      },
      { id: "learn", label: "How you learn", find: "style examples diagrams subjects level know" },
      { id: "plan", label: "Plan & usage", find: "free pro billing limits usage account weekly trial" },
      {
        id: "privacy",
        label: "Privacy",
        find: "permissions screen recording microphone accessibility data share shared links stop sharing",
      },
    ],
  },
  {
    label: "chalk",
    items: [
      {
        id: "spatial",
        label: "Spatial",
        find: "screen voice personality speak quiet shortcuts hotkey offers do it watch recordings notch panel black frosted liquid glass auto walk scroll speed fast slow latency timings",
      },
      {
        id: "board",
        label: "Board",
        find: "whiteboard detail sections language narration voice speak mute walkthrough",
      },
      { id: "cursor", label: "Cursor", find: "colour color size pointer buddy" },
    ],
  },
  {
    label: "Your stuff",
    items: [{ id: "apps", label: "Apps", find: "mcp connect github files folder canvas" }],
  },
];

export const SETTINGS_IDS = SETTINGS.flatMap((group) => group.items.map((item) => item.id));
export const ALL_IDS = [...APPS.map((section) => section.id), ...SETTINGS_IDS];

export const SECTION_NAMES: Record<string, string> = Object.fromEntries([
  ...APPS.map((section) => [section.id, section.label] as const),
  ...SETTINGS.flatMap((group) => group.items.map((item) => [item.id, item.label] as const)),
]);

/* Hash aliases kept working after a pane was renamed. */
export const HASH_ALIASES: Record<string, string> = { chalk: "spatial" };

export const isApp = (id: string) => APPS.some((section) => section.id === id);

/* Below this, the rail becomes a bottom tab bar. */
export const PHONE = "(max-width: 700px)";
