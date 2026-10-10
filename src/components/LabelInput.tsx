import { KeyboardEvent, useState } from "react";

interface Props {
  value: string[];
  onChange: (labels: string[]) => void;
  suggestions: string[];
}

export default function LabelInput({ value, onChange, suggestions }: Props) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const label = raw.trim().toLowerCase().slice(0, 30);
    if (label && !value.includes(label)) onChange([...value, label]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const unused = suggestions.filter((s) => !value.includes(s) && s.includes(draft.toLowerCase())).slice(0, 8);

  return (
    <div className="labels-input">
      <div className="chips">
        {value.map((l) => (
          <span className="chip" key={l}>
            {l}
            <button type="button" aria-label={`Remove ${l}`} onClick={() => onChange(value.filter((x) => x !== l))}>
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={value.length ? "" : "Add a label and press Enter"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft && add(draft)}
        />
      </div>
      {unused.length > 0 && (
        <div className="chips suggestions">
          {unused.map((s) => (
            <button type="button" className="chip ghost" key={s} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
