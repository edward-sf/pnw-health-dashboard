import { useCallback, useMemo, useRef, useState } from "react";
import { Legend } from "../color/Legend";
import { formatValue } from "../color/formatValue";
import { makeColorScale } from "../color/makeColorScale";
import type { AppData } from "../data/loadData";
import { buildMapPaths } from "../map/buildMapPaths";
import { CountyMap } from "../map/CountyMap";
import { CountyPanel, type County } from "../panel/CountyPanel";
import { CountySearch } from "../search/CountySearch";
import { CountyTable } from "../table/CountyTable";
import type { Row } from "../table/sortRows";
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
  const { params, setIndicator, setCounty, setView } = useExplorerParams(manifest, fipsSet);

  const counties = useMemo<County[]>(
    () => paths.map(({ fips, name, state }) => ({ fips, name, state })),
    [paths],
  );
  const openerRef = useRef<HTMLElement | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const onClosePanel = useCallback(() => {
    setCounty(null);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus();
  }, [setCounty]);
  const onSelectWithOpener = useCallback(
    (fips: string, opener: HTMLElement) => {
      openerRef.current = opener;
      setCounty(fips);
      setFocusToken((t) => t + 1);
    },
    [setCounty],
  );
  const onSelectFromMap = useCallback(
    (fips: string) => {
      openerRef.current = null;
      setCounty(fips);
    },
    [setCounty],
  );

  const indicator = manifest.indicators.find((x) => x.id === params.indicator);
  const entries = indicator ? values[indicator.id] : undefined;
  const scale = useMemo(
    () => (indicator ? makeColorScale(indicator, entries ?? {}) : null),
    [indicator, entries],
  );
  if (!indicator || !scale) return null;
  const rows: Row[] = counties.map((c) => ({ ...c, entry: entries?.[c.fips] }));
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
        <CountySearch counties={counties} onSelect={onSelectWithOpener} />
        <div className="view-toggle">
          <button type="button" aria-pressed={params.view === "map"} onClick={() => setView("map")}>
            Map
          </button>
          <button type="button" aria-pressed={params.view === "table"} onClick={() => setView("table")}>
            Table
          </button>
        </div>
        <h2 className="indicator-title">{indicator.label}</h2>
        {params.view === "table" ? (
          <CountyTable
            key={indicator.id}
            rows={rows}
            indicator={indicator}
            selected={params.county}
            onSelect={onSelectWithOpener}
          />
        ) : (
          <>
            <CountyMap
              paths={paths}
              fillFor={(fips) => scale.fill(entries?.[fips]?.v ?? null)}
              tooltipFor={(fips) => {
                const p = paths.find((x) => x.fips === fips);
                return `${p?.name ?? fips}, ${p?.state ?? ""}: ${formatValue(entries?.[fips]?.v ?? null, indicator.unit)}`;
              }}
              selected={params.county}
              onSelect={onSelectFromMap}
            />
            <Legend scale={scale} unit={indicator.unit} />
          </>
        )}
      </section>
      {selectedCounty && (
        <CountyPanel
          county={selectedCounty}
          indicator={indicator}
          entries={entries ?? {}}
          counties={counties}
          manifest={manifest}
          values={values}
          focusToken={focusToken}
          onClose={onClosePanel}
        />
      )}
    </div>
  );
}
