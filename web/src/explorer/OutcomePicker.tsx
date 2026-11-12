import { useId } from "react";

type Props = {
  targets: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
};

export function OutcomePicker({ targets, value, onChange }: Props) {
  const id = useId();
  return (
    <div className="picker outcome-picker">
      <label htmlFor={id} className="picker-label">
        Outcome
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
