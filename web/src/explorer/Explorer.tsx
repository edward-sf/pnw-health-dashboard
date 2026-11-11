import { useCallback, useMemo } from "react";
import { Legend } from "../color/Legend";
import { formatValue } from "../color/formatValue";
import { makeColorScale } from "../color/makeColorScale";
import type { AppData } from "../data/loadData";
import { buildMapPaths } from "../map/buildMapPaths";
import { CountyMap } from "../map/CountyMap";
import { CountyPanel, type County } from "../panel/CountyPanel";
import { IndicatorPicker } from "./IndicatorPicker";
import { useExplorerParams } from "./useExplorerParams";

export function Explorer({ data }: { data: AppData }) {
  const { manifest, values, topology } = data;
  const paths = useMemo(() => buildMapPaths(topology), [topology]);
  const fipsSet = useMemo(
    () =>
      new Set(
        topology.objects.counties.geometries.flatMap((g) =>
          g.properties && "fips" in g.properties ? [g.properties.fips] : [],
        ),
      ),
    [topology],
  );
  const { params, setIndicator, setCounty } = useExplorerParams(manifest, fipsSet);

  const counties = useMemo<County[]>(
    () => paths.map(({ fips, name, state }) => ({ fips, name, state })),
    [paths],
  );
  const onClosePanel = useCallback(() => setCounty(null), [setCounty]);

  const indicator = manifest.indicators.find((x) => x.id === params.indicator);
  const entries = indicator ? values[indicator.id] : undefined;
  const scale = useMemo(
    () => (indicator ? makeColorScale(indicator, entries ?? {}) : null),
    [indicator, entries],
  );
  if (!indicator || !scale) return null;
  const selectedCounty = counties.find((c) => c.fips === params.county);

  return (
    <div className={selectedCounty ? "explorer explorer--panel" : "explorer"}>
      <aside className="explorer-picker">
        <IndicatorPicker
          indicators={manifest.indicators}
          selectedId={indicator.id}
          onSelect={setIndicator}
        />
      </aside>
      <section className="explorer-main">
        <h2 className="indicator-title">{indicator.label}</h2>
        <CountyMap
          paths={paths}
          fillFor={(fips) => scale.fill(entries?.[fips]?.v ?? null)}
          tooltipFor={(fips) => {
            const p = paths.find((x) => x.fips === fips);
            return `${p?.name ?? fips}, ${p?.state ?? ""}: ${formatValue(entries?.[fips]?.v ?? null, indicator.unit)}`;
          }}
          selected={params.county}
          onSelect={setCounty}
        />
        <Legend scale={scale} unit={indicator.unit} />
      </section>
      {selectedCounty && (
        <CountyPanel
          county={selectedCounty}
          indicator={indicator}
          entries={entries ?? {}}
          counties={counties}
          manifest={manifest}
          values={values}
          focusToken={0}
          onClose={onClosePanel}
        />
      )}
    </div>
  );
}
