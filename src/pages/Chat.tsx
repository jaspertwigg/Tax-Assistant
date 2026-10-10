import { deleteDoc, doc, limit, orderBy } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { COUNTRIES } from "../lib/countries";
import { useApp, useUserCollection } from "../lib/data";
import { db, functions } from "../lib/firebase";
import type { ChatMessage } from "../lib/types";

const chatFn = httpsCallable<{ message: string }, { reply: string }>(functions, "chat", { timeout: 300_000 });

const SUGGESTIONS = [
  "Summarise my expenses for this tax year",
  "Which of my receipts might not be claimable?",
  "What are my next tax deadlines?",
  "Can I claim for working from home?",
  "What records should I keep and for how long?",
  "Draft a note for my accountant summarising my year",
];

export default function ChatPage() {
  const { user, profile } = useApp();
  const { items, loading } = useUserCollection<ChatMessage>(user.uid, "chatMessages", [orderBy("createdAt", "asc"), limit(200)], []);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ text: string; from: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Show the question immediately; hide this copy once the server-saved one arrives.
  const showPending = pending !== null && !items.slice(pending.from).some((m) => m.role === "user" && m.content === pending.text);
  const waiting = pending !== null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length, waiting]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || waiting) return;
    setDraft("");
    setError(null);
    setPending({ text: message, from: items.length });
    try {
      await chatFn({ message });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDraft(message);
    } finally {
      setPending(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(draft);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  }

  async function clearChat() {
    if (!confirm("Clear the whole conversation?")) return;
    await Promise.all(items.map((m) => deleteDoc(doc(db, "users", user.uid, "chatMessages", m.id))));
  }

  return (
    <div className="page chat-page">
      <header className="page-header">
        <div>
          <h1>Ask Claude</h1>
          <p className="muted">
            Claude can see your receipts, income and mileage for the current tax year and checks current {COUNTRIES[profile.country].authority}{" "}
            guidance online. General information, not formal tax advice.
          </p>
        </div>
        {items.length > 0 && (
          <button className="btn" onClick={clearChat}>
            Clear chat
          </button>
        )}
      </header>

      <div className="chat-log">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : items.length === 0 && !waiting ? (
          <div className="chat-empty">
            <p>Try asking:</p>
            <div className="suggestions-grid">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggestion" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          items.map((m) => <Bubble key={m.id} m={m} />)
        )}
        {showPending && <Bubble m={{ id: "pending", role: "user", content: pending!.text }} />}
        {waiting && (
          <div className="bubble assistant thinking">
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
            Thinking — this can take up to a minute if Claude is checking the latest rules.
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error">{error}</p>}
      <form className="composer" onSubmit={onSubmit}>
        <textarea
          rows={2}
          placeholder="Ask about your tax, receipts or deadlines…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          maxLength={8000}
        />
        <button className="btn primary" disabled={waiting || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

function Bubble({ m }: { m: Pick<ChatMessage, "id" | "role" | "content" | "sources"> }) {
  return (
    <div className={`bubble ${m.role}`}>
      {m.role === "assistant" ? (
        <>
          <div className="markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
            >
              {m.content}
            </ReactMarkdown>
          </div>
          {m.sources && m.sources.length > 0 && (
            <div className="sources">
              <span className="muted small">Sources:</span>
              {m.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="small">
                  {s.title || new URL(s.url).hostname}
                </a>
              ))}
            </div>
          )}
        </>
      ) : (
        <p>{m.content}</p>
      )}
    </div>
  );
}
