import type { Bbox } from "@/lib/seismo/regions";

export type Quake = {
  ms: number;
  lat: number;
  lon: number;
  mag: number;
  dep: number;
};

export type ModelParams = {
  k: number;
  alpha: number;
  p: number;
  c: number;
  backgroundFraction: number;
  sigmaKm: number;
  triggerDays: number;
};

export const DEFAULT_PARAMS: ModelParams = {
  k: 0.12,
  alpha: 0.8,
  p: 1.15,
  c: 0.05,
  backgroundFraction: 1,
  sigmaKm: 18,
  triggerDays: 120,
};

export const HORIZONS = [7, 30, 90, 365] as const;
export const THRESHOLDS = [5, 6, 7] as const;
export const WINDOW_START = Date.parse("2000-01-01T00:00:00Z");
export const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
const DM = 0.1;

export type PackedCatalog = {
  source: string;
  sourceUrl: string;
  license: string;
  retrieved: string;
  minMag: number;
  bbox: number[];
  start: string;
  end: string;
  count: number;
  ms: number[];
  lat: number[];
  lon: number[];
  mag: number[];
  dep: number[];
};

export type LandFile = { rings: [number, number][][] };

export function unpack(packed: PackedCatalog): Quake[] {
  const events: Quake[] = [];
  for (let i = 0; i < packed.count; i++) {
    events.push({
      ms: packed.ms[i],
      lat: packed.lat[i],
      lon: packed.lon[i],
      mag: packed.mag[i],
      dep: packed.dep[i],
    });
  }
  return events;
}

export function inBbox(lat: number, lon: number, box: Bbox): boolean {
  return lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon;
}

export function padView(box: Bbox, pad = 0.12): Bbox {
  const latSpan = Math.max(0.8, box.maxLat - box.minLat);
  const lonSpan = Math.max(0.8, box.maxLon - box.minLon);
  return {
    minLat: box.minLat - latSpan * pad,
    maxLat: box.maxLat + latSpan * pad,
    minLon: box.minLon - lonSpan * pad,
    maxLon: box.maxLon + lonSpan * pad,
  };
}

export function formatUtc(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function formatPercent(probability: number): string {
  if (!Number.isFinite(probability)) return "—";
  const pct = probability * 100;
  if (pct >= 99.95) return ">99.9%";
  if (pct > 0 && pct < 0.05) return "<0.05%";
  if (pct < 1) return `${pct.toFixed(2)}%`;
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(3);
}

function poissonP(expected: number): number {
  if (expected <= 0) return 0;
  if (expected > 40) return 1;
  return 1 - Math.exp(-expected);
}

/** Aki (1965) maximum-likelihood b, with a half-bin correction for 0.1 magnitude steps. */
export function aki(mags: number[], mc: number): { b: number; a: number; n: number; mean: number } | null {
  let n = 0;
  let sum = 0;
  for (const mag of mags) {
    if (mag + 1e-9 >= mc) {
      n += 1;
      sum += mag;
    }
  }
  if (n < 25) return null;
  const mean = sum / n;
  const denom = mean - (mc - DM / 2);
  if (denom < 0.05) return null;
  const b = Math.LOG10E / denom;
  if (!(b > 0.4 && b < 2.2)) return null;
  const a = Math.log10(n) + b * mc;
  return { b, a, n, mean };
}

export function omoriMass(ageDays: number, horizonDays: number, c: number, p: number): number {
  const surv = (t: number) => (c / (c + Math.max(0, t))) ** (p - 1);
  const mass = surv(ageDays) - surv(ageDays + horizonDays);
  return mass > 0 ? mass : 0;
}

export function productivity(mag: number, mc: number, k: number, alpha: number): number {
  return k * 10 ** (alpha * (mag - mc));
}

export function magScale(b: number, mc: number, threshold: number): number {
  if (threshold <= mc) return 1;
  return 10 ** (-b * (threshold - mc));
}

export function branchingRatio(k: number, alpha: number, b: number | null): number | null {
  if (b == null) return null;
  if (alpha >= b - 0.02) return Number.POSITIVE_INFINITY;
  return (k * b) / (b - alpha);
}

export function scenarioExtra(
  shockMag: number,
  horizonDays: number,
  mc: number,
  b: number | null,
  threshold: number,
  params: ModelParams,
): number {
  if (b == null || threshold < mc || shockMag < mc) return 0;
  return (
    productivity(shockMag, mc, params.k, params.alpha) *
    omoriMass(0, horizonDays, params.c, params.p) *
    magScale(b, mc, threshold)
  );
}

function qualifies(ageDays: number, mag: number, mc: number, triggerDays: number): boolean {
  if (mag < mc || ageDays < 0) return false;
  if (ageDays <= triggerDays) return true;
  return mag >= 6.5 && ageDays <= 365.25 * 3;
}

export type Cell = {
  horizon: number;
  threshold: number;
  observed: number;
  annual: number;
  poissonExpected: number;
  poissonP: number;
  etasExpected: number;
  etasP: number;
};

export type Trigger = {
  lat: number;
  lon: number;
  mag: number;
  ageDays: number;
  prod: number;
};

export type YearRow = { year: number; aboveMc: number; m6: number };
export type GrPoint = { mag: number; logN: number; fit: number | null };
export type BackRow = { year: number; expected: number; observed: number };

export type Analysis = {
  n: number;
  nMc: number;
  b: number | null;
  a: number | null;
  spanYears: number;
  maxEvent: Quake | null;
  recent: Quake[];
  cells: Cell[];
  triggers: Trigger[];
  yearly: YearRow[];
  gr: GrPoint[];
  backtests: Record<number, { poisson: BackRow[]; etas: BackRow[] }>;
};

export function analyze(
  events: Quake[],
  nowMs: number,
  mc: number,
  params: ModelParams,
): Analysis {
  const mags: number[] = [];
  let maxEvent: Quake | null = null;
  const counts = new Map<number, number>();
  for (const threshold of THRESHOLDS) counts.set(threshold, 0);
  let nMc = 0;
  for (const event of events) {
    if (event.mag + 1e-9 >= mc) {
      nMc += 1;
      mags.push(event.mag);
    }
    if (!maxEvent || event.mag > maxEvent.mag) maxEvent = event;
    for (const threshold of THRESHOLDS) {
      if (event.mag + 1e-9 >= threshold) counts.set(threshold, (counts.get(threshold) ?? 0) + 1);
    }
  }
  const spanYears = Math.max(1 / 365, (nowMs - WINDOW_START) / YEAR_MS);
  const fit = aki(mags, mc);
  const b = fit?.b ?? null;
  const a = fit?.a ?? null;

  const triggers: Trigger[] = [];
  for (const event of events) {
    const ageDays = (nowMs - event.ms) / DAY_MS;
    if (!qualifies(ageDays, event.mag, mc, params.triggerDays)) continue;
    triggers.push({
      lat: event.lat,
      lon: event.lon,
      mag: event.mag,
      ageDays,
      prod: productivity(event.mag, mc, params.k, params.alpha),
    });
  }

  const cells: Cell[] = [];
  for (const horizon of HORIZONS) {
    let directMc = 0;
    for (const trigger of triggers) {
      directMc += trigger.prod * omoriMass(trigger.ageDays, horizon, params.c, params.p);
    }
    for (const threshold of THRESHOLDS) {
      const observed = counts.get(threshold) ?? 0;
      const annual = observed / spanYears;
      const poissonExpected = annual * (horizon / 365.25);
      const scale = b == null || threshold < mc ? 0 : magScale(b, mc, threshold);
      const etasExtra = b == null || threshold < mc ? 0 : directMc * scale;
      const background = params.backgroundFraction * poissonExpected;
      const etasExpected = background + etasExtra;
      cells.push({
        horizon,
        threshold,
        observed,
        annual,
        poissonExpected,
        poissonP: poissonP(poissonExpected),
        etasExpected,
        etasP: poissonP(etasExpected),
      });
    }
  }

  const yearStart = 2000;
  const yearEnd = new Date(nowMs).getUTCFullYear();
  const yearly: YearRow[] = [];
  for (let year = yearStart; year <= yearEnd; year++) yearly.push({ year, aboveMc: 0, m6: 0 });
  const yearIndex = new Map(yearly.map((row, index) => [row.year, index]));
  for (const event of events) {
    const year = new Date(event.ms).getUTCFullYear();
    const index = yearIndex.get(year);
    if (index == null) continue;
    if (event.mag + 1e-9 >= mc) yearly[index].aboveMc += 1;
    if (event.mag + 1e-9 >= 6) yearly[index].m6 += 1;
  }

  const gr: GrPoint[] = [];
  const top = Math.min(8.2, maxEvent?.mag ?? mc);
  for (let mag = mc; mag <= top + 1e-6; mag = Math.round((mag + 0.2) * 10) / 10) {
    let n = 0;
    for (const event of events) if (event.mag + 1e-6 >= mag) n += 1;
    if (n <= 0) break;
    gr.push({ mag: Math.round(mag * 10) / 10, logN: Math.log10(n), fit: a != null && b != null ? a - b * mag : null });
  }

  const backtests: Analysis["backtests"] = {};
  for (const threshold of [6, 7] as const) {
    backtests[threshold] = {
      poisson: backtestRows(events, threshold, "poisson", mc, params),
      etas: backtestRows(events, threshold, "etas", mc, params),
    };
  }

  return {
    n: events.length,
    nMc,
    b,
    a,
    spanYears,
    maxEvent,
    recent: events.slice(-6).reverse(),
    cells,
    triggers,
    yearly,
    gr,
    backtests,
  };
}

function backtestRows(
  events: Quake[],
  threshold: number,
  mode: "poisson" | "etas",
  mc: number,
  params: ModelParams,
): BackRow[] {
  const rows: BackRow[] = [];
  for (let year = 2006; year <= 2025; year++) {
    const cutoff = Date.UTC(year, 0, 1);
    const end = Date.UTC(year + 1, 0, 1);
    let prior = 0;
    let observed = 0;
    const priorMags: number[] = [];
    for (const event of events) {
      if (event.ms < cutoff) {
        if (event.mag + 1e-9 >= threshold) prior += 1;
        if (event.mag + 1e-9 >= mc) priorMags.push(event.mag);
      } else if (event.ms < end && event.mag + 1e-9 >= threshold) {
        observed += 1;
      }
    }
    const spanYears = (cutoff - WINDOW_START) / YEAR_MS;
    const annual = prior / spanYears;
    let expected = annual;
    if (mode === "etas") {
      const fit = aki(priorMags, mc);
      let extra = 0;
      if (fit && threshold >= mc) {
        const scale = magScale(fit.b, mc, threshold);
        for (const event of events) {
          if (event.ms >= cutoff) break;
          const ageDays = (cutoff - event.ms) / DAY_MS;
          if (!qualifies(ageDays, event.mag, mc, params.triggerDays)) continue;
          extra +=
            productivity(event.mag, mc, params.k, params.alpha) *
            omoriMass(ageDays, 365.25, params.c, params.p) *
            scale;
        }
      }
      expected = params.backgroundFraction * annual + extra;
    }
    rows.push({ year, expected, observed });
  }
  return rows;
}

export function cellAt(analysis: Analysis, horizon: number, threshold: number): Cell | undefined {
  return analysis.cells.find((cell) => cell.horizon === horizon && cell.threshold === threshold);
}

export type SynthEvent = {
  tDays: number;
  lat: number;
  lon: number;
  mag: number;
  kind: "background" | "aftershock";
};

export type Simulation = {
  events: SynthEvent[];
  truncated: boolean;
  seed: number;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function samplePoisson(rng: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(rng)));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limit && k < 10000);
  return k - 1;
}

function sampleMag(rng: () => number, mc: number, b: number): number {
  const u = Math.max(rng(), 1e-9);
  return Math.min(9.5, mc - Math.log10(u) / b);
}

function jitter(rng: () => number, lat: number, lon: number, sigmaKm: number): { lat: number; lon: number } {
  const north = gauss(rng) * sigmaKm;
  const east = gauss(rng) * sigmaKm;
  const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return { lat: lat + north / 111, lon: lon + east / (111 * cos) };
}

function sampleOffset(rng: () => number, age: number, horizon: number, c: number, p: number): number | null {
  const surv = (t: number) => (c / (c + t)) ** (p - 1);
  const s0 = surv(age);
  const s1 = surv(age + horizon);
  const mass = s0 - s1;
  if (mass < 1e-8) return null;
  const target = s0 - rng() * mass;
  if (target <= 0) return horizon;
  const absolute = c / target ** (1 / (p - 1)) - c;
  const offset = absolute - age;
  if (offset <= 0 || offset > horizon) return null;
  return offset;
}

export function simulate(options: {
  history: Quake[];
  nowMs: number;
  mc: number;
  b: number;
  params: ModelParams;
  horizon: number;
  annualMc: number;
  box: Bbox;
  scenario: { lat: number; lon: number; mag: number } | null;
  seed: number;
}): Simulation {
  const { history, nowMs, mc, b, params, horizon, annualMc, box, scenario, seed } = options;
  const rng = mulberry32(seed);
  const backgrounds = history.filter((event) => event.mag >= mc);
  const maxEvents = 2200;
  const pending: { t: number; lat: number; lon: number; mag: number; gen: number; kind: SynthEvent["kind"] }[] = [];
  const produced: SynthEvent[] = [];
  let truncated = false;

  const bgLambda = Math.max(0, params.backgroundFraction) * annualMc * (horizon / 365.25);
  const nBg = samplePoisson(rng, bgLambda);
  for (let i = 0; i < nBg && produced.length + pending.length < maxEvents; i++) {
    if (backgrounds.length === 0) break;
    const host = backgrounds[Math.floor(rng() * backgrounds.length)];
    let place = jitter(rng, host.lat, host.lon, Math.max(12, params.sigmaKm));
    for (let attempt = 0; attempt < 4 && !inBbox(place.lat, place.lon, box); attempt++) {
      place = jitter(rng, host.lat, host.lon, Math.max(12, params.sigmaKm));
    }
    if (!inBbox(place.lat, place.lon, box)) continue;
    pending.push({
      t: rng() * horizon,
      lat: place.lat,
      lon: place.lon,
      mag: sampleMag(rng, mc, b),
      gen: 0,
      kind: "background",
    });
  }

  for (const event of history) {
    const age = (nowMs - event.ms) / DAY_MS;
    if (!qualifies(age, event.mag, mc, params.triggerDays)) continue;
    enqueueChildren(rng, pending, produced, maxEvents, {
      tParent: 0,
      age,
      lat: event.lat,
      lon: event.lon,
      mag: event.mag,
      gen: 0,
      horizon,
      mc,
      b,
      params,
      box,
      kind: "aftershock",
    });
  }

  if (scenario && scenario.mag >= mc) {
    enqueueChildren(rng, pending, produced, maxEvents, {
      tParent: 0,
      age: 0,
      lat: scenario.lat,
      lon: scenario.lon,
      mag: scenario.mag,
      gen: 0,
      horizon,
      mc,
      b,
      params,
      box,
      kind: "aftershock",
    });
  }

  while (pending.length > 0) {
    const parent = pending.pop();
    if (!parent) break;
    if (produced.length >= maxEvents) {
      truncated = true;
      break;
    }
    produced.push({ tDays: parent.t, lat: parent.lat, lon: parent.lon, mag: parent.mag, kind: parent.kind });
    if (parent.gen >= 5) continue;
    const before = pending.length + produced.length;
    enqueueChildren(rng, pending, produced, maxEvents, {
      tParent: parent.t,
      age: 0,
      lat: parent.lat,
      lon: parent.lon,
      mag: parent.mag,
      gen: parent.gen + 1,
      horizon,
      mc,
      b,
      params,
      box,
      kind: "aftershock",
    });
    if (pending.length + produced.length > maxEvents && before >= maxEvents) truncated = true;
  }

  produced.sort((a, b2) => a.tDays - b2.tDays);
  return { events: produced, truncated, seed };
}

function enqueueChildren(
  rng: () => number,
  pending: { t: number; lat: number; lon: number; mag: number; gen: number; kind: SynthEvent["kind"] }[],
  produced: SynthEvent[],
  maxEvents: number,
  source: {
    tParent: number;
    age: number;
    lat: number;
    lon: number;
    mag: number;
    gen: number;
    horizon: number;
    mc: number;
    b: number;
    params: ModelParams;
    box: Bbox;
    kind: SynthEvent["kind"];
  },
) {
  const remain = source.horizon - source.tParent;
  if (remain <= 0) return;
  const mean =
    productivity(source.mag, source.mc, source.params.k, source.params.alpha) *
    omoriMass(source.age, remain, source.params.c, source.params.p);
  const n = samplePoisson(rng, mean);
  const sigma = source.params.sigmaKm * 10 ** (0.5 * Math.max(0, source.mag - source.mc));
  for (let i = 0; i < n; i++) {
    if (pending.length + produced.length >= maxEvents) return;
    const offset = sampleOffset(rng, source.age, remain, source.params.c, source.params.p);
    if (offset == null) continue;
    let place = jitter(rng, source.lat, source.lon, sigma);
    if (!inBbox(place.lat, place.lon, source.box)) {
      place = jitter(rng, source.lat, source.lon, sigma * 0.5);
    }
    if (!inBbox(place.lat, place.lon, source.box)) continue;
    pending.push({
      t: source.tParent + offset,
      lat: place.lat,
      lon: place.lon,
      mag: sampleMag(rng, source.mc, source.b),
      gen: source.gen,
      kind: source.kind,
    });
  }
}

export type HeatGrid = {
  cols: number;
  rows: number;
  values: Float32Array;
  p98: number;
};

export function buildHeat(options: {
  view: Bbox;
  history: Quake[];
  mc: number;
  triggers: Trigger[];
  horizon: number;
  params: ModelParams;
  scenario: { lat: number; lon: number; mag: number } | null;
}): HeatGrid {
  const { view, history, mc, triggers, horizon, params, scenario } = options;
  const cols = 88;
  const rows = 64;
  const values = new Float32Array(cols * rows);
  const stride = Math.max(1, Math.ceil(history.filter((event) => event.mag >= mc).length / 3500));
  let seen = 0;
  for (const event of history) {
    if (event.mag < mc) continue;
    seen += 1;
    if (seen % stride !== 0) continue;
    splat(values, cols, rows, view, event.lat, event.lon, stride, 46);
  }
  for (const trigger of triggers) {
    const weight = trigger.prod * omoriMass(trigger.ageDays, horizon, params.c, params.p);
    if (weight <= 0) continue;
    const sigma = Math.max(18, params.sigmaKm * 10 ** (0.35 * Math.max(0, trigger.mag - mc)));
    splat(values, cols, rows, view, trigger.lat, trigger.lon, weight * 40, sigma);
  }
  if (scenario) {
    const weight = productivity(scenario.mag, mc, params.k, params.alpha) * omoriMass(0, horizon, params.c, params.p);
    const sigma = Math.max(18, params.sigmaKm * 10 ** (0.35 * Math.max(0, scenario.mag - mc)));
    splat(values, cols, rows, view, scenario.lat, scenario.lon, weight * 40, sigma);
  }
  const copy = Array.from(values).sort((a, b) => a - b);
  const p98 = copy[Math.min(copy.length - 1, Math.floor(copy.length * 0.985))] || 1;
  return { cols, rows, values, p98: Math.max(p98, 1e-6) };
}

function splat(
  grid: Float32Array,
  cols: number,
  rows: number,
  view: Bbox,
  lat: number,
  lon: number,
  weight: number,
  sigmaKm: number,
) {
  const latStep = (view.maxLat - view.minLat) / rows;
  const lonStep = (view.maxLon - view.minLon) / cols;
  const mid = ((view.minLat + view.maxLat) / 2) * (Math.PI / 180);
  const kmPerLat = 111;
  const kmPerLon = 111 * Math.max(0.25, Math.cos(mid));
  const dLat = (3 * sigmaKm) / kmPerLat;
  const dLon = (3 * sigmaKm) / kmPerLon;
  const i0 = Math.max(0, Math.floor((lon - dLon - view.minLon) / lonStep));
  const i1 = Math.min(cols - 1, Math.ceil((lon + dLon - view.minLon) / lonStep));
  const j0 = Math.max(0, Math.floor((view.maxLat - (lat + dLat)) / latStep));
  const j1 = Math.min(rows - 1, Math.ceil((view.maxLat - (lat - dLat)) / latStep));
  const inv = 1 / (2 * sigmaKm * sigmaKm);
  for (let j = j0; j <= j1; j++) {
    const cellLat = view.maxLat - (j + 0.5) * latStep;
    const dy = (cellLat - lat) * kmPerLat;
    for (let i = i0; i <= i1; i++) {
      const cellLon = view.minLon + (i + 0.5) * lonStep;
      const dx = (cellLon - lon) * kmPerLon;
      grid[j * cols + i] += weight * Math.exp(-(dx * dx + dy * dy) * inv);
    }
  }
}
