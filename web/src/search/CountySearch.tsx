import { useId, useMemo, useState } from "react";
import type { County } from "../panel/CountyPanel";
import { STATE_NAMES } from "../panel/rankSummary";

type Props = {
  counties: County[];
  onSelect: (fips: string, opener: HTMLElement) => void;
};

const MAX_OPTIONS = 8;

export function CountySearch({ counties, onSelect }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const options = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const all = counties.map((c) => ({ c, label: `${c.name}, ${c.state}` }));
    const byLabel = all.filter((o) => o.label.toLowerCase().includes(q));
    // State-name matches go last so "Washington" keeps Washington County within the cap.
    const byStateName = all.filter(
      (o) =>
        !o.label.toLowerCase().includes(q) &&
        `${o.c.name}, ${STATE_NAMES[o.c.state] ?? o.c.state}`.toLowerCase().includes(q),
    );
    return [...byLabel, ...byStateName].slice(0, MAX_OPTIONS);
  }, [counties, text]);

  const expanded = open && options.length > 0;
  const noMatches = open && text.trim() !== "" && options.length === 0;
  const optionId = (i: number) => `${id}-opt-${i}`;

  const choose = (i: number, opener: HTMLElement) => {
    const o = options[i];
    if (!o) return;
    onSelect(o.c.fips, opener);
    setText("");
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (options.length === 0) return;
      setOpen(true);
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (options.length === 0) return;
      setOpen(true);
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      if (expanded) {
        e.preventDefault();
        choose(Math.max(active, 0), e.currentTarget);
      }
    } else if (e.key === "Escape") {
      if (expanded) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  };

  return (
    <div className="county-search">
      <label htmlFor={`${id}-input`} className="visually-hidden">
        Search counties
      </label>
      <input
        id={`${id}-input`}
        type="text"
        role="combobox"
        placeholder="Search counties"
        autoComplete="off"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {expanded && (
        <ul id={listId} role="listbox" aria-label="Matching counties" className="county-search-list">
          {options.map((o, i) => (
            <li
              key={o.c.fips}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const input = document.getElementById(`${id}-input`);
                if (input) choose(i, input);
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
      <p role="status" className={noMatches ? "county-search-empty" : "county-search-status"}>
        {noMatches ? "No matching counties" : ""}
      </p>
    </div>
  );
}
