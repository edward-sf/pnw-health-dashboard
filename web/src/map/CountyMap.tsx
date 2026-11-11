import { useState } from "react";
import { MAP_LAYOUT, type MapPath } from "./buildMapPaths";

type Props = {
  paths: MapPath[];
  fillFor: (fips: string) => string;
  tooltipFor: (fips: string) => string;
  selected: string | null;
  onSelect: (fips: string) => void;
};

type Tip = { fips: string; x: number; y: number };

export function CountyMap({ paths, fillFor, tooltipFor, selected, onSelect }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);

  const place = (el: Element, fips: string, clientX: number, clientY: number) => {
    const box = el.closest(".county-map")?.getBoundingClientRect();
    setTip({ fips, x: clientX - (box?.left ?? 0), y: clientY - (box?.top ?? 0) });
  };

  const renderGroup = (items: MapPath[]) => {
    const ordered = [...items.filter((p) => p.fips !== selected), ...items.filter((p) => p.fips === selected)];
    return ordered.map((p) => (
      <path
        key={p.fips}
        data-fips={p.fips}
        d={p.d}
        fill={fillFor(p.fips)}
        className="county"
        aria-label={`${p.name}, ${p.state}`}
        aria-current={p.fips === selected ? "true" : undefined}
        onClick={() => onSelect(p.fips)}
        onMouseEnter={(e) => place(e.currentTarget, p.fips, e.clientX, e.clientY)}
        onMouseMove={(e) => place(e.currentTarget, p.fips, e.clientX, e.clientY)}
        onMouseLeave={() => setTip(null)}
      />
    ));
  };

  const [[ix0, iy0], [ix1, iy1]] = MAP_LAYOUT.inset;

  return (
    <div className="county-map">
      <svg viewBox={`0 0 ${MAP_LAYOUT.width} ${MAP_LAYOUT.height}`} role="group" aria-label="County map">
        <g className="map-main">{renderGroup(paths.filter((p) => p.state !== "AK"))}</g>
        <rect className="inset-frame" x={ix0} y={iy0} width={ix1 - ix0} height={iy1 - iy0} fill="none" />
        <text className="inset-label" x={ix0 + 6} y={iy0 + 16}>
          Alaska (not to scale)
        </text>
        <g className="map-inset">{renderGroup(paths.filter((p) => p.state === "AK"))}</g>
      </svg>
      {tip && (
        <div className="map-tooltip" role="tooltip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          {tooltipFor(tip.fips)}
        </div>
      )}
    </div>
  );
}
