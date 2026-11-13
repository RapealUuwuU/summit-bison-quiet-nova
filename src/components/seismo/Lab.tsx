import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Crosshair, Play } from "lucide-react";
import { BacktestChart, GutenbergChart, YearChart } from "@/components/seismo/Charts";
import { QuakeMap } from "@/components/seismo/QuakeMap";
import catalogPacked from "../../../public/data/catalog.json";
import landFile from "../../../public/data/land.json";
import {
  DEFAULT_PARAMS,
  HORIZONS,
  THRESHOLDS,
  analyze,
  branchingRatio,
  buildHeat,
  cellAt,
  formatCount,
  formatPercent,
  formatUtc,
  inBbox,
  padView,
  scenarioExtra,
  simulate,
  unpack,
  type LandFile,
  type ModelParams,
  type PackedCatalog,
  type Simulation,
} from "@/lib/seismo/model";
import { REGIONS, regionById } from "@/lib/seismo/regions";

type Tab = "backtest" | "gr" | "model";
type Mode = "poisson" | "etas";

const packed = catalogPacked as PackedCatalog;
const ALL_EVENTS = unpack(packed);
const LAND = landFile as LandFile;
const NOW_MS = ALL_EVENTS[ALL_EVENTS.length - 1]?.ms ?? 0;

export function Lab() {
  const [regionId, setRegionId] = useState("taiwan");
  const [mc, setMc] = useState(4.5);
  const [mode, setMode] = useState<Mode>("poisson");
  const [horizon, setHorizon] = useState(30);
  const [focus, setFocus] = useState(6);
  const [backMag, setBackMag] = useState<6 | 7>(6);
  const [params, setParams] = useState<ModelParams>(DEFAULT_PARAMS);
  const [scenarioOn, setScenarioOn] = useState(false);
  const [scenario, setScenario] = useState({ lat: 23.6, lon: 121.1, mag: 7.2 });
  const [showHeat, setShowHeat] = useState(true);
  const [showHist, setShowHist] = useState(true);
  const [tab, setTab] = useState<Tab>("backtest");
  const [seed, setSeed] = useState(7);
  const [sim, setSim] = useState<Simulation | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playFrac, setPlayFrac] = useState(1);
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    setChartsReady(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const next = Math.min(1, (now - start) / 7000);
      setPlayFrac(next);
      if (next < 1) frame = requestAnimationFrame(step);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const region = regionById(regionId);
  const nowMs = NOW_MS;
  const regional = useMemo(() => {
    return ALL_EVENTS.filter((event) => inBbox(event.lat, event.lon, region.bbox));
  }, [region]);

  const analysis = useMemo(() => {
    if (regional.length === 0) return null;
    return analyze(regional, nowMs, mc, params);
  }, [regional, nowMs, mc, params]);

  const view = useMemo(() => padView(region.bbox, region.id === "all" ? 0.02 : 0.18), [region]);

  const inside = scenarioOn && inBbox(scenario.lat, scenario.lon, region.bbox);
  const heat = useMemo(() => {
    if (!analysis) return null;
    return buildHeat({
      view,
      history: regional,
      mc,
      triggers: analysis.triggers,
      horizon,
      params,
      scenario: scenarioOn ? scenario : null,
    });
  }, [analysis, view, regional, mc, horizon, params, scenarioOn, scenario]);

  const base = analysis ? cellAt(analysis, horizon, focus) : undefined;
  const activeExpected = base ? (mode === "etas" ? base.etasExpected : base.poissonExpected) : 0;
  const activeP = base ? (mode === "etas" ? base.etasP : base.poissonP) : 0;
  const extra =
    analysis && inside ? scenarioExtra(scenario.mag, horizon, mc, analysis.b, focus, params) : 0;
  const shockedP = extra > 0 ? 1 - Math.exp(-(activeExpected + extra)) : activeP;
  const branch = analysis ? branchingRatio(params.k, params.alpha, analysis.b) : null;
  const backRows = analysis ? analysis.backtests[backMag][mode] : [];
  const backMean = backRows.reduce(
    (acc, row) => ({ expected: acc.expected + row.expected, observed: acc.observed + row.observed }),
    { expected: 0, observed: 0 },
  );

  function chooseRegion(id: string) {
    const next = regionById(id);
    setRegionId(id);
    setScenario((current) =>
      inBbox(current.lat, current.lon, next.bbox)
        ? current
        : {
            ...current,
            lat: (next.bbox.minLat + next.bbox.maxLat) / 2,
            lon: (next.bbox.minLon + next.bbox.maxLon) / 2,
          },
    );
    setSim(null);
    setPlaying(false);
  }

  function updateParam<K extends keyof ModelParams>(key: K, value: number) {
    setParams((current) => ({ ...current, [key]: value }));
    setSim(null);
  }

  function drawSample() {
    if (!analysis || analysis.b == null) return;
    const annualMc = analysis.nMc / analysis.spanYears;
    const next = simulate({
      history: regional,
      nowMs,
      mc,
      b: analysis.b,
      params,
      horizon,
      annualMc,
      box: region.bbox,
      scenario: scenarioOn ? scenario : null,
      seed,
    });
    setSim(next);
    setPlayFrac(1);
    setPlaying(false);
    setSeed((value) => value + 1);
  }

  return (
    <main className="min-h-screen bg-bg text-fg" data-ready="yes">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 py-5 lg:px-6">
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 120 28" className="h-8 w-28 text-primary" aria-hidden="true">
              <path
                className="trace-draw"
                d="M1 16 H22 L28 16 L33 5 L40 24 L47 9 L53 16 H74 L80 16 L86 3 L94 23 L101 16 H119"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <h1 className="font-display text-4xl leading-none">震象</h1>
              <p className="mt-1 text-sm text-muted">西太平洋目錄推演</p>
            </div>
          </div>
          <p className="max-w-xl text-sm text-muted">
            {packed.count.toLocaleString("zh-Hant")} 筆 · M≥{packed.minMag} · {packed.start} 至 {packed.end.slice(0, 10)} · {packed.source}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-4 lg:px-6">
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
          這不是預警，也不能指出下一次地震的日期和地點。地震仍然無法做確定性預測。下面的數字只是 USGS
          歷史目錄的統計模擬：長期發生率，加上一個簡化 ETAS 的餘震強度。
        </p>

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-12">
          <section className="order-3 grid gap-3 lg:order-1 lg:col-span-3">
            <Panel title="區域">
              <label className="grid gap-2 text-sm" htmlFor="region">
                <span className="text-muted">統計範圍</span>
                <select
                  id="region"
                  className="min-h-11 rounded-lg border border-line bg-bg px-3 text-fg"
                  value={regionId}
                  onChange={(event) => chooseRegion(event.target.value)}
                >
                  {REGIONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs leading-relaxed text-muted">{region.note}</p>
            </Panel>

            <Panel title="門檻與時間">
              <Slider
                label="完整規模 Mc"
                value={mc.toFixed(1)}
                min={4.5}
                max={6}
                step={0.1}
                onChange={(value) => {
                  setMc(Math.round(value * 10) / 10);
                  setSim(null);
                }}
              />
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
                <SegButton pressed={mode === "poisson"} onClick={() => setMode("poisson")}>
                  長期泊松
                </SegButton>
                <SegButton pressed={mode === "etas"} onClick={() => setMode("etas")}>
                  短期 ETAS
                </SegButton>
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-bg p-1">
                {HORIZONS.map((days) => (
                  <SegButton key={days} pressed={horizon === days} onClick={() => setHorizon(days)}>
                    {days}天
                  </SegButton>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted">
                {mode === "poisson"
                  ? "把觀測窗裡的平均次數當成固定發生率。"
                  : "長期發生率，再疊上尚未衰完的直接餘震。平靜期會略為重複計算。"}
              </p>
            </Panel>

            <Panel title="假設主震">
              <button
                type="button"
                className="min-h-11 rounded-lg border border-line bg-bg px-3 text-sm"
                aria-pressed={scenarioOn}
                onClick={() => setScenarioOn((value) => !value)}
              >
                <span className="inline-flex items-center gap-2">
                  <Crosshair className="size-4 text-primary" aria-hidden="true" />
                  {scenarioOn ? "主震情境開啟" : "放一顆假設主震"}
                </span>
              </button>
              <Slider
                label="主震規模"
                value={scenario.mag.toFixed(1)}
                min={6}
                max={8.5}
                step={0.1}
                onChange={(value) => setScenario((current) => ({ ...current, mag: Math.round(value * 10) / 10 }))}
              />
              <p className="text-xs text-muted">
                {scenario.lat.toFixed(2)}°N，{scenario.lon.toFixed(2)}°E
                {scenarioOn && !inside ? " · 在區域外，不計入這個區域的機率" : ""}
              </p>
            </Panel>

            <Panel title="圖層">
              <Check label="歷史震央" checked={showHist} onChange={setShowHist} />
              <Check label="相對發生率" checked={showHeat} onChange={setShowHeat} />
              <button
                type="button"
                className="min-h-11 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg disabled:opacity-40"
                onClick={drawSample}
                disabled={!analysis?.b}
              >
                抽一條未來 {horizon} 天
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-3 text-sm disabled:opacity-40"
                disabled={!sim}
                onClick={() => {
                  setPlayFrac(0);
                  setPlaying(true);
                }}
              >
                <Play className="size-4" aria-hidden="true" />
                播放這個抽樣
              </button>
            </Panel>
          </section>

          <section className="order-2 grid min-w-0 gap-3 lg:order-2 lg:col-span-5">
            <QuakeMap
              land={LAND}
              view={view}
              region={region.bbox}
              events={ALL_EVENTS}
              heat={heat}
              showHeat={showHeat}
              showHist={showHist}
              scenario={scenarioOn ? scenario : null}
              synth={sim?.events ?? null}
              horizon={horizon}
              playFrac={playFrac}
              onPick={(lat, lon) => {
                setScenario((current) => ({ ...current, lat, lon }));
                setScenarioOn(true);
                setSim(null);
              }}
            />

            {analysis ? (
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
                <Stat label="區域內筆數" value={analysis.n.toLocaleString("zh-Hant")} />
                <Stat label="b 值" value={analysis.b ? analysis.b.toFixed(2) : "樣本不足"} />
                <Stat
                  label="區內最大"
                  value={analysis.maxEvent ? `M${analysis.maxEvent.mag.toFixed(1)}` : "—"}
                  detail={
                    analysis.maxEvent
                      ? new Intl.DateTimeFormat("en-CA", {
                          timeZone: "Asia/Taipei",
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        }).format(analysis.maxEvent.ms)
                      : ""
                  }
                />
                <Stat
                  label="M≥6 年率"
                  value={formatCount(cellAt(analysis, 365, 6)?.annual ?? 0)}
                  detail="次 / 年"
                />
              </dl>
            ) : null}

            {analysis ? (
              <div className="rounded-lg border border-line bg-surface p-4">
                <h2 className="text-sm text-muted">目錄最近六筆</h2>
                <ul className="mt-3 divide-y divide-line">
                  {analysis.recent.map((event) => (
                    <li key={`${event.ms}-${event.lat}-${event.lon}`} className="grid gap-1 py-2">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="tabular-nums text-primary">M{event.mag.toFixed(1)}</span>
                        <span className="tabular-nums text-xs text-muted">{formatUtc(event.ms)}</span>
                      </div>
                      <p className="text-xs text-muted">
                        {event.dep.toFixed(0)} km · {event.lat.toFixed(2)}°N {event.lon.toFixed(2)}°E
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="order-1 grid min-w-0 gap-3 max-lg:contents lg:order-3 lg:col-span-4">
            <div className="rounded-lg border border-line bg-surface p-4 max-lg:order-1">
              <p className="text-sm text-muted">
                未來 {horizon} 天 · 至少一次 M≥{focus}
              </p>
              <p className="mt-2 font-display text-6xl leading-none text-primary tabular-nums">{formatPercent(activeP)}</p>
              <p className="mt-3 text-sm text-muted">
                期望 {formatCount(activeExpected)} 次
                {base ? ` · 目錄裡有 ${base.observed} 次，約每年 ${formatCount(base.annual)} 次` : ""}
              </p>
              {mode === "etas" && base && base.poissonExpected > 0 ? (
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  約為長期平均的 {(base.etasExpected / base.poissonExpected).toFixed(2)} 倍。這是一階直接餘震，不含餘震再生的餘震。
                </p>
              ) : null}
              {scenarioOn ? (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-sm text-muted">若此刻發生 M{scenario.mag.toFixed(1)}</p>
                  <p className="mt-1 font-display text-4xl leading-none tabular-nums">{formatPercent(shockedP)}</p>
                  <p className="mt-2 text-xs text-muted">
                    主震本身不計入，只加它在這個窗口裡的直接餘震，約 {formatCount(extra)} 次。
                  </p>
                </div>
              ) : null}
            </div>

            {analysis ? (
              <div className="overflow-x-auto rounded-lg border border-line max-lg:order-1">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-surface text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">窗口</th>
                      {THRESHOLDS.map((threshold) => (
                        <th key={threshold} className="px-3 py-2 text-right font-medium">
                          M≥{threshold}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {HORIZONS.map((days) => (
                      <tr key={days} className={days === horizon ? "bg-surface-2" : "bg-raised"}>
                        <th className="px-3 py-2 text-left font-medium">{days} 天</th>
                        {THRESHOLDS.map((threshold) => {
                          const cell = cellAt(analysis, days, threshold);
                          const value = cell ? (mode === "etas" ? cell.etasP : cell.poissonP) : 0;
                          const selected = days === horizon && threshold === focus;
                          return (
                            <td key={threshold} className="px-1 py-1 text-right">
                              <button
                                type="button"
                                className={`min-h-11 w-full rounded-md px-2 tabular-nums ${selected ? "bg-primary text-primary-fg" : ""}`}
                                onClick={() => {
                                  setHorizon(days);
                                  setFocus(threshold);
                                }}
                              >
                                {formatPercent(value)}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="grid gap-3 max-lg:order-4 lg:contents">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface p-1">
              <SegButton pressed={tab === "backtest"} onClick={() => setTab("backtest")}>
                回測
              </SegButton>
              <SegButton pressed={tab === "gr"} onClick={() => setTab("gr")}>
                規模律
              </SegButton>
              <SegButton pressed={tab === "model"} onClick={() => setTab("model")}>
                參數
              </SegButton>
            </div>

            {chartsReady && tab === "backtest" && analysis ? (
              <Panel title="事前回測">
                <div className="grid grid-cols-2 gap-1">
                  <SegButton pressed={backMag === 6} onClick={() => setBackMag(6)}>
                    M≥6
                  </SegButton>
                  <SegButton pressed={backMag === 7} onClick={() => setBackMag(7)}>
                    M≥7
                  </SegButton>
                </div>
                <BacktestChart rows={backRows} />
                <p className="text-xs leading-relaxed text-muted">
                  每一年只用那一年之前的目錄。2006–2025 平均期望 {formatCount(backMean.expected / Math.max(1, backRows.length))}{" "}
                  次，實際 {formatCount(backMean.observed / Math.max(1, backRows.length))} 次。大主震那一年，事前的長期率幾乎一定偏低。
                </p>
              </Panel>
            ) : null}

            {chartsReady && tab === "gr" && analysis ? (
              <Panel title="Gutenberg–Richter">
                <GutenbergChart points={analysis.gr} />
                <p className="text-xs leading-relaxed text-muted">
                  縱軸是 log10 N(≥M)。直線是 Aki 1965 最大似然，規模以 0.1 分級做了半格修正。
                  {analysis.b ? ` b = ${analysis.b.toFixed(2)}，a = ${analysis.a?.toFixed(2)}。` : " 樣本少於 25 筆，不拟合。"}
                </p>
                <YearChart rows={analysis.yearly} />
                <p className="text-xs text-muted">柱是每年 M≥Mc，線是 M≥6。2026 年只到目錄最後一筆。</p>
              </Panel>
            ) : null}

            {tab === "model" && (
              <Panel title="ETAS 旋鈕">
                <Slider label="生產力 K" value={params.k.toFixed(2)} min={0.02} max={0.3} step={0.01} onChange={(value) => updateParam("k", value)} />
                <Slider label="規模指數 α" value={params.alpha.toFixed(2)} min={0.4} max={1.3} step={0.05} onChange={(value) => updateParam("alpha", Math.round(value * 100) / 100)} />
                <Slider label="Omori p" value={params.p.toFixed(2)} min={1.05} max={1.6} step={0.01} onChange={(value) => updateParam("p", value)} />
                <Slider label="Omori c（天）" value={params.c.toFixed(2)} min={0.01} max={0.4} step={0.01} onChange={(value) => updateParam("c", value)} />
                <Slider
                  label="背景比例"
                  value={params.backgroundFraction.toFixed(2)}
                  min={0.4}
                  max={1}
                  step={0.05}
                  onChange={(value) => updateParam("backgroundFraction", Math.round(value * 20) / 20)}
                />
                <p className="text-xs leading-relaxed text-muted">
                  分支比{" "}
                  {branch == null ? "—" : !Number.isFinite(branch) ? "超臨界" : branch.toFixed(2)}
                  。小於 1 才不會讓餘震無限增生。K、α、p、c 是文獻量級的預設，不是這份目錄的最大似然擬合。目錄下限 M4.5，外海與早期的小地震可能不完整。
                </p>
                {sim ? (
                  <div>
                    <p className="text-sm">
                      抽樣 {sim.events.length} 筆
                      {sim.truncated ? "，已截斷" : ""}，種子 {sim.seed}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {sim.events
                        .slice()
                        .sort((a, b) => b.mag - a.mag)
                        .slice(0, 5)
                        .map((event, index) => (
                          <li key={`${event.tDays}-${index}`}>
                            第 {event.tDays.toFixed(1)} 天 · M{event.mag.toFixed(1)} ·{" "}
                            {event.kind === "background" ? "背景" : "餘震"}
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
              </Panel>
            )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="bg-surface px-3 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl leading-none tabular-nums">{value}</dd>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

function SegButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-11 rounded-md px-2 text-sm ${pressed ? "bg-surface-2 text-fg" : "text-muted"}`}
    >
      {children}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-primary">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
