import { useId, useState } from "react";
import type { Indicator } from "../types";

type Props = {
  indicators: Indicator[];
  selectedId: string;
  onSelect: (id: string) => void;
  dimmed?: boolean;
};

export function IndicatorPicker({ indicators, selectedId, onSelect, dimmed = false }: Props) {
  const [filter, setFilter] = useState("");
  const inputId = useId();
  const needle = filter.trim().toLowerCase();
  const shown = indicators.filter((x) => x.label.toLowerCase().includes(needle));

  const groups = new Map<string, Indicator[]>();
  for (const ind of shown) {
    const g = groups.get(ind.category);
    if (g) g.push(ind);
    else groups.set(ind.category, [ind]);
  }

  return (
    <div className={dimmed ? "picker indicator-picker--dimmed" : "picker"}>
      {dimmed && (
        <p className="picker-note">
          Model mode shows life expectancy compared with what the model expects. Your indicator
          choice is kept for values mode.
        </p>
      )}
      <label htmlFor={inputId} className="picker-label">
        Filter indicators
      </label>
      <input
        id={inputId}
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {shown.length === 0 && <p className="picker-empty">No indicators match</p>}
      {[...groups].map(([category, items], n) => (
        <section key={category} role="group" aria-labelledby={`${inputId}-group-${n}`}>
          <h2 id={`${inputId}-group-${n}`}>{category}</h2>
          <ul>
            {items.map((ind) => (
              <li key={ind.id}>
                <button
                  type="button"
                  aria-pressed={ind.id === selectedId}
                  onClick={() => onSelect(ind.id)}
                >
                  {ind.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
