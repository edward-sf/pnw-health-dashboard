import { useCallback, useMemo, useRef, useState } from "react";
import { Legend } from "../color/Legend";
import { formatValue } from "../color/formatValue";
import { makeColorScale } from "../color/makeColorScale";
import type { AppData } from "../data/loadData";
import { PHONE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { buildMapPaths } from "../map/buildMapPaths";
import { ModelLegend } from "../model/ModelLegend";
import { outcomeName, targetModel } from "../model/targetView";
import { countyModel, modelTooltip, tierCounts, tierFill } from "../model/modelView";
import { CountyMap } from "../map/CountyMap";
import { CountyPanel } from "../panel/CountyPanel";
import type { County } from "../types";
import { CountySearch } from "../search/CountySearch";
import { CountyTable } from "../table/CountyTable";
import { ModelTable } from "../table/ModelTable";
import type { ModelRow } from "../table/sortModelRows";
import type { Row } from "../table/sortRows";
import { IndicatorPicker } from "./IndicatorPicker";
import { OutcomePicker } from "./OutcomePicker";
import { sourceLine } from "./sourceLine";
import { useExplorerParams } from "./useExplorerParams";

const SEARCH_INPUT_ID = "county-search";

export function Explorer({ data }: { data: AppData }) {
  const { manifest, values, topology } = data;
  const targetIds = useMemo(() => Object.keys(data.model.targets), [data.model]);
  const targetOptions = useMemo(
    () => targetIds.map((id) => ({ id, label: targetModel(data.model, id).label })),
    [targetIds, data.model],
  );
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
  const { params, setIndicator, setCounty, setTarget, setView, setMode } = useExplorerParams(
    manifest,
    fipsSet,
    targetIds,
  );
  const model = useMemo(
    () => targetModel(data.model, params.target),
    [data.model, params.target],
  );

  const counties = useMemo<County[]>(
    () => paths.map(({ fips, name, state }) => ({ fips, name, state })),
    [paths],
  );
  const isPhone = useMediaQuery(PHONE_QUERY);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The county a search or table selection asked to focus. It is bound to that FIPS, so a
  // selection that renders no panel cannot hand its request to a later map selection.
  const [focusFips, setFocusFips] = useState<string | null>(null);
  const onFocusHandled = useCallback(() => setFocusFips(null), []);
  const onClosePanel = useCallback(() => {
    setCounty(null);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus();
    else titleRef.current?.focus();
  }, [setCounty]);
  const onSelectWithOpener = useCallback(
    (fips: string, opener: HTMLElement) => {
      openerRef.current = opener;
      setCounty(fips);
      setFocusFips(fips);
    },
    [setCounty],
  );
  const onSelectFromMap = useCallback(
    (fips: string) => {
      setFocusFips(null);
      openerRef.current = null;
      setCounty(fips);
    },
    [setCounty],
  );

  // A peer button lives inside the panel, so like search it moves focus to the new heading.
  const onSelectPeer = useCallback(
    (fips: string) => {
      setFocusFips(fips);
      setCounty(fips);
    },
    [setCounty],
  );

  const selectedCounty = counties.find((c) => c.fips === params.county);
  const indicator = manifest.indicators.find((x) => x.id === params.indicator);
  const entries = indicator ? values[indicator.id] : undefined;
  const scale = useMemo(
    () => (indicator ? makeColorScale(indicator, entries ?? {}) : null),
    [indicator, entries],
  );
  const rows = useMemo<Row[]>(
    () => counties.map((c) => ({ ...c, entry: entries?.[c.fips] })),
    [counties, entries],
  );
  const modelRows = useMemo<ModelRow[]>(
    () => counties.map((c) => ({ ...c, model: countyModel(model, c.fips) })),
    [counties, model],
  );
  const counts = useMemo(
    () =>
      tierCounts(
        model,
        counties.map((c) => c.fips),
      ),
    [model, counties],
  );
  if (!indicator || !scale) return null;
  const modelMode = params.mode === "model";
  const targetIndicator = manifest.indicators.find((x) => x.id === params.target);

  return (
    <div
      className={
        selectedCounty
          ? `explorer explorer--panel${isPhone ? " explorer--sheet-open" : ""}`
          : "explorer"
      }
    >
      <a
        className="skip-link"
        href={`#${SEARCH_INPUT_ID}`}
        onClick={(e) => {
          // Focus the search without adding a hash to the URL. Without the search, let the
          // anchor do its default.
          const search = document.getElementById(SEARCH_INPUT_ID);
          if (!search) return;
          e.preventDefault();
          search.focus();
        }}
      >
        Skip to county search
      </a>
      <aside className="explorer-picker">
        {modelMode ? (
          <OutcomePicker targets={targetOptions} value={params.target} onChange={setTarget} />
        ) : (
          <IndicatorPicker
            indicators={manifest.indicators}
            selectedId={indicator.id}
            onSelect={setIndicator}
            collapsible={isPhone}
          />
        )}
      </aside>
      <section className="explorer-main">
        <CountySearch counties={counties} onSelect={onSelectWithOpener} inputId={SEARCH_INPUT_ID} />
        <div className="view-toggle" role="group" aria-label="Mode">
          <button type="button" aria-pressed={!modelMode} onClick={() => setMode("values")}>
            Values
          </button>
          <button type="button" aria-pressed={modelMode} onClick={() => setMode("model")}>
            Model
          </button>
        </div>
        <div className="view-toggle" role="group" aria-label="View">
          <button type="button" aria-pressed={params.view === "map"} onClick={() => setView("map")}>
            Map
          </button>
          <button
            type="button"
            aria-pressed={params.view === "table"}
            onClick={() => setView("table")}
          >
            Table
          </button>
        </div>
        <h2 ref={titleRef} className="indicator-title" tabIndex={-1} data-page-heading>
          {modelMode ? `${model.label}: compared with expected` : indicator.label}
        </h2>
        <p className="indicator-description">
          {modelMode
            ? `How each county compares on ${outcomeName(model.label)} with what the model expects for counties nationwide with a similar social and economic profile.`
            : indicator.description}
        </p>
        {modelMode ? (
          targetIndicator && <p className="indicator-source">{sourceLine(targetIndicator)}</p>
        ) : (
          <p className="indicator-source">{sourceLine(indicator)}</p>
        )}
        {params.view === "table" ? (
          modelMode ? (
            <ModelTable
              rows={modelRows}
              selected={params.county}
              onSelect={onSelectWithOpener}
              target={model}
            />
          ) : (
            <CountyTable
              key={indicator.id}
              rows={rows}
              indicator={indicator}
              selected={params.county}
              onSelect={onSelectWithOpener}
            />
          )
        ) : (
          <>
            <CountyMap
              paths={paths}
              fillFor={(fips) =>
                modelMode
                  ? tierFill(countyModel(model, fips).flag)
                  : scale.fill(entries?.[fips]?.v ?? null)
              }
              tooltipFor={(fips) => {
                const p = paths.find((x) => x.fips === fips);
                if (modelMode) {
                  return modelTooltip(p?.name ?? fips, p?.state ?? "", countyModel(model, fips), model.unit);
                }
                return `${p?.name ?? fips}, ${p?.state ?? ""}: ${formatValue(entries?.[fips]?.v ?? null, indicator.unit)}`;
              }}
              selected={params.county}
              onSelect={onSelectFromMap}
            />
            {modelMode ? (
              <ModelLegend counts={counts} />
            ) : (
              <Legend scale={scale} unit={indicator.unit} />
            )}
          </>
        )}
      </section>
      {selectedCounty && (
        <CountyPanel
          county={selectedCounty}
          indicator={indicator}
          entries={entries ?? {}}
          counties={counties}
          modelEntry={countyModel(model, selectedCounty.fips)}
          target={model}
          manifest={manifest}
          values={values}
          strata={data.strata}
          targetIndicator={targetIndicator}
          modelMode={modelMode}
          peers={data.model.peers}
          onSelectCounty={onSelectPeer}
          focusRequested={focusFips !== null && focusFips === selectedCounty.fips}
          onFocusHandled={onFocusHandled}
          onClose={onClosePanel}
        />
      )}
    </div>
  );
}
