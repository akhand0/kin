"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface DirEntry {
  patient_id: string;
  first_name: string;
  conditions: string[];
  shared: string[];
  status: "connected" | "outgoing" | "incoming" | null;
}
interface Conn {
  connection_id: string;
  peer_id: string;
  first_name: string;
  conditions: string[];
}
interface PeerState {
  opted_in: boolean;
  directory: DirEntry[];
  connections: Conn[];
  incoming: Conn[];
}
interface Msg {
  id: string;
  body: string;
  created_at: string;
  mine: boolean;
}

export default function Peers() {
  const [state, setState] = useState<PeerState | null>(null);
  const [active, setActive] = useState<Conn | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/peers", { cache: "no-store" });
      if (r.ok) setState(await r.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function setOptIn(opt: boolean) {
    await fetch("/api/peers", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ opt_in: opt }),
    });
    load();
  }

  async function connect(peerId: string) {
    await fetch("/api/peers/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ peerId }),
    });
    load();
  }

  async function respond(connectionId: string, accept: boolean) {
    await fetch(`/api/peers/requests/${connectionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accept }),
    });
    load();
  }

  return (
    <main className="min-h-screen bg-kin-bg">
      <header className="border-b border-kin-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-bold">
            Kin
          </Link>
          <Link
            href="/talk"
            className="rounded-lg border border-kin-border px-3 py-1.5 text-sm text-kin-text hover:bg-kin-panel"
          >
            ← Back to Kin
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold text-kin-text">Peer support</h1>
        <p className="mt-1 text-kin-muted">
          Connect with other people managing similar conditions. Everything here
          is opt-in — only people who&apos;ve joined can see or message you.
        </p>

        {!state ? (
          <p className="mt-8 text-sm text-kin-muted">Loading…</p>
        ) : active ? (
          <ChatView conn={active} onBack={() => setActive(null)} />
        ) : !state.opted_in ? (
          <OptInCard onOptIn={() => setOptIn(true)} />
        ) : (
          <div className="mt-6 space-y-8">
            {/* incoming requests */}
            {state.incoming.length > 0 && (
              <section>
                <SectionTitle>Requests</SectionTitle>
                <div className="space-y-2">
                  {state.incoming.map((c) => (
                    <div
                      key={c.connection_id}
                      className="flex items-center justify-between rounded-xl border border-kin-border bg-kin-panel px-4 py-3"
                    >
                      <PeerLabel name={c.first_name} conditions={c.conditions} />
                      <div className="flex gap-2">
                        <button
                          onClick={() => respond(c.connection_id, true)}
                          className="rounded-lg bg-kin-accent px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => respond(c.connection_id, false)}
                          className="rounded-lg border border-kin-border px-3 py-1.5 text-xs text-kin-muted hover:bg-kin-bg"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* connections */}
            <section>
              <SectionTitle>Your connections</SectionTitle>
              {state.connections.length === 0 ? (
                <p className="text-sm text-kin-muted">
                  No connections yet — send a request below.
                </p>
              ) : (
                <div className="space-y-2">
                  {state.connections.map((c) => (
                    <button
                      key={c.connection_id}
                      onClick={() => setActive(c)}
                      className="flex w-full items-center justify-between rounded-xl border border-kin-border bg-kin-panel px-4 py-3 text-left transition hover:bg-kin-panel2"
                    >
                      <PeerLabel name={c.first_name} conditions={c.conditions} />
                      <span className="text-sm text-kin-accent">Message →</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* directory */}
            <section>
              <SectionTitle>Find peers</SectionTitle>
              <div className="space-y-2">
                {state.directory
                  .filter((p) => p.status !== "connected")
                  .map((p) => (
                    <div
                      key={p.patient_id}
                      className="flex items-center justify-between rounded-xl border border-kin-border bg-kin-panel px-4 py-3"
                    >
                      <PeerLabel
                        name={p.first_name}
                        conditions={p.conditions}
                        shared={p.shared}
                      />
                      {p.status === "outgoing" ? (
                        <span className="text-xs text-kin-muted">Requested</span>
                      ) : p.status === "incoming" ? (
                        <span className="text-xs text-kin-nudge">
                          Wants to connect
                        </span>
                      ) : (
                        <button
                          onClick={() => connect(p.patient_id)}
                          className="rounded-lg border border-kin-border px-3 py-1.5 text-xs font-medium text-kin-text hover:bg-kin-bg"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  ))}
                {state.directory.length === 0 && (
                  <p className="text-sm text-kin-muted">
                    No one else has opted in yet.
                  </p>
                )}
              </div>
            </section>

            <button
              onClick={() => setOptIn(false)}
              className="text-xs text-kin-muted underline hover:text-kin-text"
            >
              Leave peer support
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function OptInCard({ onOptIn }: { onOptIn: () => void }) {
  return (
    <div className="mt-8 rounded-2xl border border-kin-border bg-kin-panel p-6 text-center">
      <div className="text-3xl">🤝</div>
      <h2 className="mt-3 text-lg font-semibold text-kin-text">
        Talk to people who get it
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-kin-muted">
        Opt in to connect with other patients managing similar conditions.
        You&apos;ll only ever share your first name and conditions — never your
        contact details — and you choose who to talk to.
      </p>
      <button
        onClick={onOptIn}
        className="mt-5 rounded-full bg-kin-accent px-6 py-2.5 text-sm font-semibold text-black hover:opacity-90"
      >
        Opt in to peer support
      </button>
    </div>
  );
}

function ChatView({ conn, onBack }: { conn: Conn; onBack: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/peers/messages?connectionId=${conn.connection_id}`,
        { cache: "no-store" },
      );
      if (r.ok) setMessages((await r.json()).messages ?? []);
    } catch {
      /* ignore */
    }
  }, [conn.connection_id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim() || sending) return;
    const body = text.trim();
    setText("");
    setSending(true);
    try {
      await fetch("/api/peers/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId: conn.connection_id, body }),
      });
      await load();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        onClick={onBack}
        className="mb-3 text-sm text-kin-muted hover:text-kin-text"
      >
        ← Connections
      </button>
      <div className="rounded-2xl border border-kin-border bg-kin-panel">
        <div className="border-b border-kin-border px-4 py-3">
          <PeerLabel name={conn.first_name} conditions={conn.conditions} />
        </div>
        <div className="min-h-[300px] space-y-3 p-4">
          {messages.length === 0 && (
            <p className="pt-20 text-center text-sm text-kin-muted">
              Say hello 👋
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  m.mine
                    ? "bg-kin-accent text-black"
                    : "bg-kin-panel2 text-kin-text"
                }`}
              >
                {m.body}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="flex gap-2 border-t border-kin-border p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={`Message ${conn.first_name}…`}
            className="flex-1 rounded-lg border border-kin-border bg-kin-bg px-3 py-2 text-sm text-kin-text placeholder:text-kin-muted"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="rounded-lg bg-kin-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-kin-muted">
        Be kind. Peers share experience, not medical advice — anything urgent
        goes to your care team.
      </p>
    </div>
  );
}

function PeerLabel({
  name,
  conditions,
  shared,
}: {
  name: string;
  conditions: string[];
  shared?: string[];
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-kin-panel2 text-xs font-semibold text-kin-text">
          {name.charAt(0)}
        </span>
        <span className="font-medium text-kin-text">{name}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 pl-9">
        {conditions.map((c) => (
          <span
            key={c}
            className="rounded-full px-2 py-0.5 text-[11px]"
            style={
              shared?.includes(c)
                ? { background: "#4ade801a", color: "#4ade80" }
                : { background: "var(--kin-panel2, #1a1f2b)", color: "#9aa4b2" }
            }
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-kin-muted">
      {children}
    </h2>
  );
}
