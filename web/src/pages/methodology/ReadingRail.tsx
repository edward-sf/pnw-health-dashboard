import { useEffect, useRef, useState, type MouseEvent } from "react";
import { PHONE_QUERY, useMediaQuery } from "../../hooks/useMediaQuery";
import { STEPS } from "./steps";

type Props = { current: string | null; onPick: (id: string) => void };

function currentLabel(current: string | null): string {
  for (const step of STEPS) {
    const hit = step.sections.find((s) => s.id === current);
    if (hit) return `${step.name} · ${hit.railLabel}`;
  }
  return "On this page";
}

function RailList({ current, onPick }: Props) {
  const click = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    // Leave new-tab and modified clicks to the browser.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onPick(id);
  };
  return (
    <ol className="reading-rail-steps">
      {STEPS.map((step) => {
        const inStep = step.sections.some((s) => s.id === current);
        return (
          <li key={step.id}>
            <span className={`reading-rail-step${inStep ? " is-current" : ""}`}>{step.name}</span>
            <ul>
              {step.sections.map(({ id, railLabel }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    aria-current={id === current ? "location" : undefined}
                    onClick={(e) => click(e, id)}
                  >
                    {railLabel}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function PhoneBar({ current, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: Event) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <nav aria-label="On this page" className="reading-rail reading-rail--phone" ref={root}>
      <button
        type="button"
        className="reading-rail-toggle"
        aria-expanded={open}
        aria-controls="reading-rail-list"
        onClick={() => setOpen((o) => !o)}
      >
        {currentLabel(current)}
      </button>
      {open && (
        <div id="reading-rail-list" className="reading-rail-popover">
          <RailList
            current={current}
            onPick={(id) => {
              setOpen(false);
              onPick(id);
            }}
          />
        </div>
      )}
    </nav>
  );
}

/** The methodology page's table of contents: a sticky side rail, or a sticky bar on a phone. */
export function ReadingRail(props: Props) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  if (isPhone) return <PhoneBar {...props} />;
  return (
    <nav aria-label="On this page" className="reading-rail">
      <RailList {...props} />
    </nav>
  );
}
