import { FormEvent, useState } from "react";
import { COUNTRIES } from "../lib/countries";
import { upcomingDeadlines } from "../lib/deadlines";
import { useApp, useRecords } from "../lib/data";
import { newId, patch, put, remove } from "../lib/db";
import { daysUntil, formatDate } from "../lib/format";
import type { Reminder } from "../lib/types";

function when(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 0) return `in ${days} days`;
  return `${-days} days ago`;
}

export default function Deadlines() {
  const { profile } = useApp();
  const country = COUNTRIES[profile.country];
  const deadlines = upcomingDeadlines(profile.country);
  const reminders = useRecords<Reminder>("reminders", (a, b) => a.date.localeCompare(b.date));
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    await put("reminders", { id: newId(), title: title.trim(), date, done: false, createdAt: Date.now() });
    setTitle("");
    setDate("");
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Deadlines & reminders</h1>
          <p className="muted">
            Usual key dates for {country.name}. Dates can move (weekends, agents, special cases) — confirm with {country.authority}.
          </p>
        </div>
      </header>

      <div className="two-col">
        <section className="card">
          <h2>Key tax dates</h2>
          {deadlines.length === 0 ? (
            <p className="muted">Choose your country in Settings to see key dates.</p>
          ) : (
            <ul className="deadline-list">
              {deadlines.map((d) => {
                const days = daysUntil(d.date);
                return (
                  <li key={d.date + d.title} className={days < 0 ? "past" : days <= 30 ? "soon" : ""}>
                    <div className="deadline-date">
                      <strong>{formatDate(d.date)}</strong>
                      <span className="muted small">{when(days)}</span>
                    </div>
                    <div>
                      <div>{d.title}</div>
                      <div className="muted small">{d.detail}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>My reminders</h2>
          <form className="inline-form" onSubmit={add}>
            <input placeholder="e.g. Send P60 to accountant" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="btn primary">Add</button>
          </form>
          <ul className="reminder-list">
            {reminders.items.map((r) => (
              <li key={r.id} className={r.done ? "done" : ""}>
                <label className="checkbox">
                  <input type="checkbox" checked={r.done} onChange={(e) => patch("reminders", r.id, { done: e.target.checked })} />
                  <span>
                    {r.title}
                    <span className="muted small">
                      {" "}
                      · {formatDate(r.date)} ({when(daysUntil(r.date))})
                    </span>
                  </span>
                </label>
                <button className="icon-btn" aria-label="Delete reminder" onClick={() => remove("reminders", r.id)}>
                  ×
                </button>
              </li>
            ))}
            {!reminders.loading && reminders.items.length === 0 && <li className="muted">No reminders yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
