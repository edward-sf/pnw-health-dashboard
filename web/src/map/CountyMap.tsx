import { type PointerEvent, useState } from "react";
import { HATCH_BACKGROUND } from "../color/makeColorScale";
import { outlineFor } from "../color/outline";
import { MAP_LAYOUT, type MapPath } from "./buildMapPaths";

type Props = {
  paths: MapPath[];
  fillFor: (fips: string) => string;
  tooltipFor: (fips: string) => string;
  selected: string | null;
  onSelect: (fips: string) => void;
  stateBorders: string;
};

type Tip = { fips: string; x: number; y: number; flip: boolean };

export function CountyMap({ paths, fillFor, tooltipFor, selected, onSelect, stateBorders }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);

  // On touch a tap selects the county and opens the panel, which replaces the tooltip.
  const place = (e: PointerEvent<SVGPathElement>, fips: string) => {
    if (e.pointerType === "touch") {
      setTip(null);
      return;
    }
    const box = e.currentTarget.closest(".county-map")?.getBoundingClientRect();
    const x = e.clientX - (box?.left ?? 0);
    setTip({ fips, x, y: e.clientY - (box?.top ?? 0), flip: box !== undefined && x > box.width / 2 });
  };

  const renderGroup = (items: MapPath[]) => {
    const ordered = [...items.filter((p) => p.fips !== selected), ...items.filter((p) => p.fips === selected)];
    return ordered.flatMap((p) => {
      const fill = fillFor(p.fips);
      const ring =
        p.fips === selected ? [<path key={`${p.fips}-ring`} className="county-ring" d={p.d} />] : [];
      return [
        ...ring,
        <path
          key={p.fips}
          data-fips={p.fips}
          d={p.d}
          fill={fill}
          style={{ "--county-stroke": outlineFor(fill) }}
          className="county"
          role="img"
          aria-label={`${p.name}, ${p.state}`}
          aria-current={p.fips === selected ? "true" : undefined}
          onClick={() => onSelect(p.fips)}
          onPointerEnter={(e) => place(e, p.fips)}
          onPointerMove={(e) => place(e, p.fips)}
          onPointerLeave={() => setTip(null)}
        />,
      ];
    });
  };

  // Widest first, so the smallest county's halo is on top and wins where halos overlap.
  const halos = paths.filter((p) => p.halo > 0).sort((a, b) => b.halo - a.halo);

  const [[ix0, iy0], [ix1, iy1]] = MAP_LAYOUT.inset;

  return (
    <div className="county-map">
      <svg
        viewBox={`0 0 ${MAP_LAYOUT.width} ${MAP_LAYOUT.height}`}
        role="group"
        aria-label="County map"
      >
        <defs>
          <pattern
            id="hatch-null"
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="4" height="4" fill={HATCH_BACKGROUND} />
            <line x1="0" y1="0" x2="0" y2="4" stroke="#999" strokeWidth="1.5" />
          </pattern>
        </defs>
        <g className="map-halos" aria-hidden="true">
          {halos.map((p) => (
            <path
              key={p.fips}
              className="county-halo"
              data-fips={p.fips}
              d={p.d}
              fill="transparent"
              stroke="transparent"
              strokeWidth={p.halo}
              onClick={() => onSelect(p.fips)}
              onPointerEnter={(e) => place(e, p.fips)}
              onPointerMove={(e) => place(e, p.fips)}
              onPointerLeave={() => setTip(null)}
            />
          ))}
        </g>
        <g className="map-main">{renderGroup(paths.filter((p) => p.state !== "AK"))}</g>
        <path className="state-borders" d={stateBorders} />
        <rect
          className="inset-frame"
          x={ix0}
          y={iy0}
          width={ix1 - ix0}
          height={iy1 - iy0}
          fill="none"
        />
        <text className="inset-label" x={ix0 + 6} y={iy0 + 16}>
          Alaska (not to scale)
        </text>
        <g className="map-inset">{renderGroup(paths.filter((p) => p.state === "AK"))}</g>
      </svg>
      {tip && (
        <div
          className={tip.flip ? "map-tooltip map-tooltip--left" : "map-tooltip"}
          role="tooltip"
          style={{ left: tip.flip ? tip.x - 12 : tip.x + 12, top: tip.y + 12 }}
        >
          {tooltipFor(tip.fips)}
        </div>
      )}
    </div>
  );
}
