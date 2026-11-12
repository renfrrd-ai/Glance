"use client";

/*
 * Apps: the places your own work already lives, connected over MCP so chalk can
 * read from them and turn what is there into something to learn from.
 *
 * Read-only on purpose. chalk lists an app's resources, reads one when asked,
 * and never calls a tool that could change anything in your account — which is
 * also why a connection is only ever "checked", never "authorised".
 *
 * A connection lives on this device (in the Keychain on a Mac, in this browser
 * otherwise); only the probe and the reads go through the server.
 */

import { useEffect, useState } from "react";
import { FileText, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";

import { SectionTile } from "@/components/art/section-art";
import { appsCall, shell, usePref } from "@/lib/prefs";

import { Pane } from "../pane";
import { Btn, Card, Field, Row, Section, Sub, Tag } from "../primitives";

type Remote = { id: string; name: string; kind: "remote"; url: string; token?: string };
type Local = { id: string; name: string; kind: "local"; command: string; args: string[] };
export type Connection = Remote | Local;

type Resource = { uri: string; name: string };

/** What is on offer when adding one. */
const OFFERS: { label: string; hint: string; icon: string; make: () => Omit<Connection, "id"> }[] = [
  {
    label: "A folder on this Mac",
    hint: "Your files, from a folder you choose.",
    icon: "library",
    make: () => ({
      name: "My files",
      kind: "local",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"],
    }),
  },
  {
    label: "GitHub",
    hint: "Repositories, issues and code. Needs a personal access token.",
    icon: "pen",
    make: () => ({ name: "GitHub", kind: "remote", url: "https://api.githubcopilot.com/mcp/" }),
  },
  {
    label: "Any MCP server",
    hint: "Paste its address, and a token if it needs one.",
    icon: "apps",
    make: () => ({ name: "", kind: "remote", url: "" }),
  },
];

const iconFor = (connection: Connection) =>
  connection.kind === "local" ? "library" : /github/i.test(connection.url) ? "pen" : "apps";

const why = (problem: unknown) => (problem instanceof Error ? problem.message : String(problem));

function EditApp({
  connection,
  desktop,
  onSave,
  onCancel,
}: {
  connection: Connection;
  desktop: boolean;
  onSave: (connection: Connection) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(connection);
  const ready =
    draft.kind === "remote" ? /^https?:\/\//.test(draft.url) : !!draft.command.trim();

  return (
    <Card>
      <Field label="Name">
        <input
          className="cc-input"
          value={draft.name}
          placeholder="What to call it"
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </Field>

      <Field label="Where it runs" group>
        <div className="cc-seg">
          <button
            type="button"
            aria-pressed={draft.kind === "remote"}
            onClick={() => {
              if (draft.kind !== "remote")
                setDraft({ id: draft.id, name: draft.name, kind: "remote", url: "" });
            }}
          >
            On the internet
          </button>
          <button
            type="button"
            aria-pressed={draft.kind === "local"}
            onClick={() => {
              if (draft.kind !== "local")
                setDraft({ id: draft.id, name: draft.name, kind: "local", command: "", args: [] });
            }}
          >
            On this Mac
          </button>
        </div>
      </Field>

      {draft.kind === "remote" ? (
        <>
          <Field label="Server address">
            <input
              className="cc-input"
              value={draft.url}
              placeholder="https://…/mcp"
              onChange={(event) => setDraft({ ...draft, url: event.target.value.trim() })}
            />
          </Field>
          <Field label="Token" aside={desktop ? "Kept in your Keychain" : "Kept in this browser"}>
            <input
              className="cc-input"
              type="password"
              value={draft.token ?? ""}
              placeholder="Optional — sent as a bearer token"
              onChange={(event) =>
                setDraft({ ...draft, token: event.target.value.trim() || undefined })
              }
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Command">
            <input
              className="cc-input"
              value={draft.command}
              placeholder="npx"
              onChange={(event) => setDraft({ ...draft, command: event.target.value })}
            />
          </Field>
          <Field label="Arguments" aside="Runs on this Mac when chalk reads from it">
            <input
              className="cc-input"
              value={draft.args.join(" ")}
              placeholder="-y @modelcontextprotocol/server-filesystem ~/Documents"
              onChange={(event) =>
                setDraft({ ...draft, args: event.target.value.split(/\s+/).filter(Boolean) })
              }
            />
          </Field>
        </>
      )}

      <div className="cc-field" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn variant="ghost" icon={X} onClick={onCancel}>
          Cancel
        </Btn>
        <Btn
          variant="primary"
          disabled={!ready}
          onClick={() => {
            if (ready) onSave(draft);
          }}
        >
          Save and check
        </Btn>
      </div>
    </Card>
  );
}

export function AppsPane({
  onTeach,
  educator = false,
}: {
  onTeach: (title: string, text: string) => void;
  educator?: boolean;
}) {
  const desktop = !!shell();
  const [apps, saveApps] = usePref<Connection[]>("apps", []);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [checked, setChecked] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [browsing, setBrowsing] = useState<{ id: string; items: Resource[]; next?: string } | null>(
    null,
  );
  const [reading, setReading] = useState<{
    item: Resource;
    text: string;
    truncated: boolean;
  } | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<{
    connected?: boolean;
    host?: string;
    user?: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/lms/canvas", { headers: { "x-chalk-app": "1" } })
      .then((response) => response.json())
      .then(setCanvas)
      .catch(() => setCanvas({ connected: false }));
  }, []);

  const note = (id: string, ok: boolean, text: string) =>
    setChecked((all) => ({ ...all, [id]: { ok, text } }));

  const probe = async (connection: Connection) => {
    setWaiting(connection.id);
    try {
      const result = await appsCall<{ resources: number; tools: number; readTools: number }>({
        action: "probe",
        server: connection,
      });
      note(
        connection.id,
        true,
        `${result.resources} to read · ${result.tools} tools, ${result.readTools} read-only`,
      );
    } catch (problem) {
      note(connection.id, false, why(problem));
    } finally {
      setWaiting(null);
    }
  };

  const browse = async (connection: Connection, cursor?: string) => {
    /* Pressing Browse again, with nothing to page through, closes it. */
    if (!cursor && browsing?.id === connection.id) {
      setBrowsing(null);
      setReading(null);
      return;
    }

    setWaiting(connection.id);
    setReading(null);
    try {
      const page = await appsCall<{ items: Resource[]; next?: string }>({
        action: "resources",
        server: connection,
        cursor,
      });
      setBrowsing((open) => ({
        id: connection.id,
        items: cursor && open?.id === connection.id ? [...open.items, ...page.items] : page.items,
        next: page.next,
      }));
    } catch (problem) {
      note(connection.id, false, why(problem));
    } finally {
      setWaiting(null);
    }
  };

  const read = async (connection: Connection, item: Resource) => {
    setWaiting(item.uri);
    try {
      const result = await appsCall<{ text: string; truncated: boolean }>({
        action: "read",
        server: connection,
        uri: item.uri,
      });
      setReading({ item, text: result.text, truncated: result.truncated });
    } catch (problem) {
      setReading({ item, text: `Couldn't read it — ${why(problem)}`, truncated: false });
    } finally {
      setWaiting(null);
    }
  };

  return (
    <Pane
      title="Apps"
      lede="Connect the apps your work lives in, so what's in them can become something you learn from."
    >
      <Section
        title="Your school"
        desc={
          educator
            ? "Your Canvas courses with their modules, pages, files and due dates, to teach from. A lesson or quiz goes to Canvas only when you send it, as a draft your students see once you publish it there."
            : "Your Canvas courses with their modules, pages, files and due dates. chalk only reads them."
        }
      >
        <Card>
          <Row
            icon="learn"
            title="Canvas"
            badge={canvas?.connected ? <Tag tone="ok">Connected</Tag> : undefined}
            help={
              canvas?.connected
                ? `${canvas.host ?? "Canvas"}${canvas.user ? ` · ${canvas.user}` : ""}`
                : educator
                  ? "Bring your courses in to teach from, and send lessons back."
                  : "Bring your courses in to learn them."
            }
            side={
              <Btn
                size="sm"
                onClick={() => {
                  window.location.hash = educator ? "/teach/connect" : "/learn/canvas";
                }}
              >
                {canvas?.connected ? "Open" : "Connect"}
              </Btn>
            }
          />
        </Card>
      </Section>

      <Section
        title="Connected"
        meta={apps.length ? `${apps.length} app${apps.length === 1 ? "" : "s"}` : undefined}
        desc="chalk only reads from these. It never runs anything in an app that could change your account."
      >
        <Card>
          {apps.length === 0 ? (
            <div className="cc-empty">
              <SectionTile id="apps" size={64} />
              Nothing connected yet — add one below.
            </div>
          ) : (
            apps.map((connection) => {
              const state = checked[connection.id];
              const open = browsing?.id === connection.id;

              return (
                <Row
                  key={connection.id}
                  icon={iconFor(connection)}
                  title={connection.name || "Untitled app"}
                  mono
                  badge={
                    state ? (
                      <Tag tone={state.ok ? "ok" : "bad"}>
                        {state.ok ? "Connected" : "Can't reach it"}
                      </Tag>
                    ) : (
                      <Tag>Not checked</Tag>
                    )
                  }
                  help={
                    state && !state.ok
                      ? state.text
                      : connection.kind === "remote"
                        ? connection.url
                        : `${connection.command} ${connection.args.join(" ")}`
                  }
                  side={
                    <>
                      <Btn
                        variant="ghost"
                        size="sm"
                        icon={RefreshCw}
                        label="Check"
                        onClick={() => void probe(connection)}
                      />
                      <Btn size="sm" onClick={() => void browse(connection)}>
                        {waiting === connection.id ? "…" : open ? "Close" : "Browse"}
                      </Btn>
                      <Btn variant="ghost" size="sm" onClick={() => setEditing(connection)}>
                        Edit
                      </Btn>
                      <Btn
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        label={`Remove ${connection.name || "this app"}`}
                        onClick={() => {
                          const keeps =
                            connection.kind === "remote" && connection.token
                              ? " and token"
                              : "";
                          if (
                            window.confirm(
                              `Remove ${connection.name || "this app"}? chalk forgets its address${keeps}.`,
                            )
                          )
                            saveApps(apps.filter((one) => one.id !== connection.id));
                        }}
                      />
                    </>
                  }
                >
                  {open && browsing ? (
                    <Sub>
                      {browsing.items.length === 0
                        ? "This app offers nothing to read."
                        : browsing.items.map((item) => (
                            <div
                              className="cc-row"
                              style={{ minHeight: 44, padding: "6px 0" }}
                              key={item.uri}
                            >
                              <FileText size={15} />
                              <div className="cc-row-text">
                                <div className="cc-row-title">
                                  <span>{item.name}</span>
                                </div>
                              </div>
                              <Btn size="sm" onClick={() => void read(connection, item)}>
                                {waiting === item.uri ? "…" : "Open"}
                              </Btn>
                            </div>
                          ))}

                      {browsing.next ? (
                        <div style={{ marginTop: 8 }}>
                          <Btn
                            variant="ghost"
                            size="sm"
                            onClick={() => void browse(connection, browsing.next)}
                          >
                            Load more
                          </Btn>
                        </div>
                      ) : null}

                      {reading ? (
                        <div style={{ marginTop: 12 }}>
                          <div className="cc-inline">
                            <span className="cc-row-title" style={{ flex: 1 }}>
                              <span>{reading.item.name}</span>
                            </span>
                            <Btn
                              variant="primary"
                              size="sm"
                              icon={Sparkles}
                              onClick={() => onTeach(reading.item.name, reading.text)}
                            >
                              Teach me this
                            </Btn>
                          </div>
                          <pre className="cc-pre">
                            {reading.text.slice(0, 4000)}
                            {reading.text.length > 4000 || reading.truncated ? "\n…" : ""}
                          </pre>
                        </div>
                      ) : null}
                    </Sub>
                  ) : null}
                </Row>
              );
            })
          )}
        </Card>
      </Section>

      <Section
        title={editing && apps.some((one) => one.id === editing.id) ? "Edit app" : "Add an app"}
      >
        {editing ? (
          <EditApp
            connection={editing}
            desktop={desktop}
            onSave={(connection) => {
              saveApps(
                apps.some((one) => one.id === connection.id)
                  ? apps.map((one) => (one.id === connection.id ? connection : one))
                  : [...apps, connection],
              );
              setEditing(null);
              void probe(connection);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Card>
            {OFFERS.map((offer) => (
              <Row
                key={offer.label}
                icon={offer.icon}
                title={offer.label}
                help={offer.hint}
                side={
                  <Btn
                    size="sm"
                    icon={Plus}
                    onClick={() =>
                      setEditing({
                        ...offer.make(),
                        id: `a${Date.now().toString(36)}`,
                      } as Connection)
                    }
                  >
                    Add
                  </Btn>
                }
              />
            ))}
          </Card>
        )}
      </Section>
    </Pane>
  );
}
