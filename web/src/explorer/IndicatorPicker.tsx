import { ChevronsUpDown } from "lucide-react";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Indicator } from "../types";

type Props = {
  indicators: Indicator[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Phone layout: hide the search and list behind an "Indicator: …" disclosure button. */
  collapsible?: boolean;
};

export function IndicatorPicker({
  indicators,
  selectedId,
  onSelect,
  collapsible = false,
}: Props) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const needle = filter.trim().toLowerCase();
  const shown = indicators.filter((x) => x.label.toLowerCase().includes(needle));

  const groups = new Map<string, Indicator[]>();
  for (const ind of shown) {
    const g = groups.get(ind.category);
    if (g) g.push(ind);
    else groups.set(ind.category, [ind]);
  }

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };
  const choose = (id: string) => {
    onSelect(id);
    if (collapsible) close();
  };
  // Escape closes only the disclosure; preventDefault tells the county panel to stay open.
  const onKeyDown = (e: KeyboardEvent) => {
    if (!collapsible || !open || e.key !== "Escape") return;
    e.preventDefault();
    close();
  };
  const selectedLabel = indicators.find((x) => x.id === selectedId)?.label ?? selectedId;

  return (
    <div className="picker" onKeyDown={onKeyDown}>
      {collapsible && (
        <Button
          ref={toggleRef}
          type="button"
          variant="outline"
          className="picker-toggle h-auto w-full justify-between px-3 py-1.5 text-left whitespace-normal"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span>Indicator: {selectedLabel}</span>
          <ChevronsUpDown aria-hidden="true" />
        </Button>
      )}
      {(!collapsible || open) && (
        <>
          <label htmlFor={inputId} className="picker-label">
            Filter indicators
          </label>
          <Input
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
                      className="picker-item"
                      aria-pressed={ind.id === selectedId}
                      onClick={() => choose(ind.id)}
                    >
                      {ind.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
