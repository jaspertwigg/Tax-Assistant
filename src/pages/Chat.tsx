import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import { askClaude } from "../lib/claude";
import { countryOf } from "../lib/countries";
import { useApp, useRecords } from "../lib/data";
import { clearAll } from "../lib/db";
import type { ChatMessage } from "../lib/types";

const SUGGESTIONS: Record<string, string[]> = {
  AU: [
    "Summarise my deductions for this financial year",
    "Which of my receipts might not be claimable?",
    "How does the working-from-home fixed rate method work?",
    "When is my tax return due, and what's coming up?",
    "Roughly what refund or bill should I expect?",
    "Draft a note for my tax agent summarising my year",
  ],
  default: [
    "Summarise my expenses for this tax year",
    "Which of my receipts might not be claimable?",
    "What are my next tax deadlines?",
    "Can I claim for working from home?",
    "What records should I keep and for how long?",
    "Draft a note for my accountant summarising my year",
  ],
};

export default function ChatPage() {
  const { profile, apiKey } = useApp();
  const { items, loading } = useRecords<ChatMessage>("chat", (a, b) => a.createdAt - b.createdAt);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length, waiting]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || waiting) return;
    setDraft("");
    setError(null);
    setWaiting(true);
    try {
      await askClaude(apiKey, message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWaiting(false);
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
    await clearAll(["chat"]);
  }

  return (
    <div className="page chat-page">
      <header className="page-header">
        <div>
          <h1>Ask Claude</h1>
          <p className="muted">
            Claude can see your receipts, income and mileage for the current {countryOf(profile.country).yearTerm.toLowerCase()} and checks current {countryOf(profile.country).authority}{" "}
            guidance online. General information, not formal tax advice.
          </p>
        </div>
        {items.length > 0 && (
          <button className="btn" onClick={clearChat}>
            Clear chat
          </button>
        )}
      </header>

      {!apiKey && (
        <Link to="/settings" className="notice">
          Add your Claude API key in Settings to start chatting →
        </Link>
      )}
      <div className="chat-log">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : items.length === 0 && !waiting ? (
          <div className="chat-empty">
            <p>Try asking:</p>
            <div className="suggestions-grid">
              {(SUGGESTIONS[profile.country] ?? SUGGESTIONS.default).map((s) => (
                <button key={s} className="suggestion" disabled={!apiKey} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          items.map((m) => <Bubble key={m.id} m={m} />)
        )}
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
        <button className="btn primary" disabled={waiting || !draft.trim() || !apiKey}>
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
