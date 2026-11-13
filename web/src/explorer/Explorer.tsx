import { ChartNoAxesColumn, Info, Map as MapIcon, Scale, Table2 } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Legend } from "../color/Legend";
import { formatValue } from "../color/formatValue";
import { makeColorScale } from "../color/makeColorScale";
import type { AppData } from "../data/loadData";
import { PHONE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { buildMapPaths } from "../map/buildMapPaths";
import { buildStateBorders } from "../map/buildStateBorders";
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
import { MeasurePicker } from "./MeasurePicker";
import { sourceLine } from "./sourceLine";
import { useExplorerParams } from "./useExplorerParams";

const SEARCH_INPUT_ID = "county-search";
// On phones the two Show options share the screen width, so their labels may wrap.
const SHOW_ITEM = "max-[720px]:whitespace-normal max-[720px]:leading-tight";

export function Explorer({ data }: { data: AppData }) {
  const { manifest, values, topology } = data;
  const targetIds = useMemo(() => Object.keys(data.model.targets), [data.model]);
  const paths = useMemo(() => buildMapPaths(topology), [topology]);
  const stateBorders = useMemo(() => buildStateBorders(topology), [topology]);
  const fipsSet = useMemo(
    () =>
      new Set(
        topology.objects.counties.geometries.flatMap((g) =>
          g.properties && "fips" in g.properties ? [g.properties.fips] : [],
        ),
      ),
    [topology],
  );
  const { params, setIndicator, setCounty, setTarget, setView, setShow } = useExplorerParams(
    manifest,
    fipsSet,
    targetIds,
  );
  const model = useMemo(
    () => targetModel(data.model, params.target),
    [data.model, params.target],
  );
  const targetOptions = useMemo(
    () => targetIds.map((id) => ({ id, label: targetModel(data.model, id).label })),
    [data.model, targetIds],
  );

  const counties = useMemo<County[]>(
    () => paths.map(({ fips, name, state }) => ({ fips, name, state })),
    [paths],
  );
  const isPhone = useMediaQuery(PHONE_QUERY);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const titleBlockRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // The stage fills the viewport height left under it, so it needs its own page offset. The
  // toolbar and title block above it are what can change that offset (wrapping, a longer title).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const top = stage.getBoundingClientRect().top + window.scrollY;
      stage.style.setProperty("--stage-top", `${Math.round(top)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of [toolbarRef.current, titleBlockRef.current]) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [params.view]);
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
  const compared = params.show === "expected";
  const isTarget = targetIds.includes(indicator.id);
  const targetIndicator = manifest.indicators.find((x) => x.id === params.target);
  const description = compared
    ? `How each county compares on ${outcomeName(model.label)} with what the model expects for counties nationwide with a similar social and economic profile.`
    : indicator.description;

  return (
    <div
      className={
        selectedCounty
          ? `explorer${isPhone ? " explorer--sheet-open" : ""}`
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
      <div ref={toolbarRef} className="explorer-toolbar">
        <MeasurePicker
          indicators={manifest.indicators}
          selectedId={indicator.id}
          onSelect={setIndicator}
        />
        <div className="toolbar-end">
          <CountySearch
            counties={counties}
            onSelect={onSelectWithOpener}
            inputId={SEARCH_INPUT_ID}
          />
          <ToggleGroup
            type="single"
            aria-label="View"
            value={params.view}
            onValueChange={(v) => {
              if (v === "map" || v === "table") setView(v);
            }}
          >
            <ToggleGroupItem value="map">
              <MapIcon aria-hidden="true" />
              Map
            </ToggleGroupItem>
            <ToggleGroupItem value="table">
              <Table2 aria-hidden="true" />
              Table
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      <div ref={titleBlockRef} className="title-block">
        <div className="title-row">
          <h2 ref={titleRef} className="indicator-title" tabIndex={-1} data-page-heading>
            {compared ? `${model.label}: compared with expected` : indicator.label}
          </h2>
          {isPhone && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="about-measure"
                  aria-label="About this measure"
                >
                  <Info aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] text-sm">
                <p className="indicator-description">{description}</p>
              </PopoverContent>
            </Popover>
          )}
          {isTarget && (
            <ToggleGroup
              type="single"
              className="show-toggle"
              aria-label="Show"
              value={params.show}
              onValueChange={(v) => {
                if (v === "observed" || v === "expected") setShow(v);
              }}
            >
              <ToggleGroupItem value="observed" className={SHOW_ITEM}>
                <ChartNoAxesColumn aria-hidden="true" />
                Observed
              </ToggleGroupItem>
              <ToggleGroupItem value="expected" className={SHOW_ITEM}>
                <Scale aria-hidden="true" />
                Compared with expected
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
        {!isPhone && <p className="indicator-description">{description}</p>}
        {compared ? (
          targetIndicator && <p className="indicator-source">{sourceLine(targetIndicator)}</p>
        ) : (
          <p className="indicator-source">{sourceLine(indicator)}</p>
        )}
      </div>
      {/* The panel floats over this area from 721px, so opening it never resizes the map. */}
      <div
        className={`explorer-view explorer-view--${params.view}${selectedCounty ? " explorer-view--panel-open" : ""}`}
      >
        {params.view === "table" ? (
          compared ? (
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
          <div ref={stageRef} className="map-stage">
            <CountyMap
              paths={paths}
              fillFor={(fips) =>
                compared
                  ? tierFill(countyModel(model, fips).flag)
                  : scale.fill(entries?.[fips]?.v ?? null)
              }
              tooltipFor={(fips) => {
                const p = paths.find((x) => x.fips === fips);
                if (compared) {
                  return modelTooltip(p?.name ?? fips, p?.state ?? "", countyModel(model, fips), model.unit);
                }
                return `${p?.name ?? fips}, ${p?.state ?? ""}: ${formatValue(entries?.[fips]?.v ?? null, indicator.unit)}`;
              }}
              selected={params.county}
              onSelect={onSelectFromMap}
              stateBorders={stateBorders}
            />
            {compared ? (
              <ModelLegend counts={counts} />
            ) : (
              <Legend scale={scale} unit={indicator.unit} />
            )}
            {!selectedCounty && <p className="stage-hint">Select a county for its details</p>}
          </div>
        )}
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
            modelMode={compared}
            peers={data.model.peers}
            onSelectCounty={onSelectPeer}
            focusRequested={focusFips !== null && focusFips === selectedCounty.fips}
            onFocusHandled={onFocusHandled}
            onClose={onClosePanel}
            targets={isTarget ? undefined : targetOptions}
            onTargetChange={isTarget ? undefined : setTarget}
          />
        )}
      </div>
    </div>
  );
}
